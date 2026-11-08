const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(options={}){
 const data=[['ID события','','','Тип события','','','','','','','','','','','Связанное событие']],props={};let writes=0;const relaxed=new Set();
 const display=v=>String(v??'').replace(/^'(?=[=+\-@])/,'');
 const range=(row,col,height,width)=>({
  getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>display(data[row-1+i]?.[col-1+j]))),
  getDataValidations:()=>Array.from({length:height},(_,i)=>[!relaxed.has(row+i)]),
  clearDataValidations:()=>{for(let i=0;i<height;i++)relaxed.add(row+i)},
  setDataValidations:rules=>rules.forEach((r,i)=>{if(r[0])relaxed.delete(row+i);else relaxed.add(row+i)}),
  clearContent:()=>{for(let i=0;i<height;i++){data[row-1+i]??=[];for(let j=0;j<width;j++)data[row-1+i][col-1+j]=''}},
  setValues:rows=>{writes++;let count=0;rows.forEach((r,i)=>{data[row-1+i]??=[];r.forEach((v,j)=>{if(col-1+j===3&&!relaxed.has(row+i)&&v!=='Другое')throw new Error('D validation');data[row-1+i][col-1+j]=v;if(options.failAfter===++count)throw new Error('simulated partial write')})})}
 });
 const sheet={getLastRow:()=>data.reduce((n,r,i)=>r.some(v=>v!=='')?i+1:n,0),getRange:range};
 const book={getSheetByName:name=>name==='События'?sheet:{getDataRange:()=>({getDisplayValues:()=>[['ID','ФИО','Краткое имя'],['ХПН','Павел','Павел Х.'],['ПРВ','Роман','Роман П.']]})}};
 const context={SpreadsheetApp:{openById:()=>book,flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{formatDate:(_,tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-11-08':'08.11.2026'}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('tools/event-writer/Code.gs','utf8'),context);
 return {context,data,props,relaxed,writes:()=>writes};
}
const event={title:'Совещание',date:'2026-11-09',time:'11:30',note:'',people:[{id:'ХПН'},{id:'ПРВ'}],author:'roman'};
const id='12345678-1234-1234-1234-123456789012';
test('one append groups participants and preserves existing rows; repeat is idempotent',()=>{
 const s=setup(),header=JSON.stringify(s.data[0]);let r=s.context.addDepartmentEvent(event,id);
 assert.equal(r.ok,true);assert.equal(s.writes(),1);assert.equal(r.ids.length,2);assert.equal(JSON.stringify(s.data[0]),header);
 assert.equal(s.data[1][14],s.data[2][14]);assert.equal(s.data[1][10],'Указал автор: Роман П.');
 assert.ok(s.props.LAST_APPEND_BACKUP);r=s.context.addDepartmentEvent(event,id);assert.equal(r.duplicate,true);assert.equal(s.writes(),1);
 r=s.context.addDepartmentEvent(event,'22222222-2222-2222-2222-222222222222');assert.equal(r.duplicate,true);assert.equal(s.writes(),1);
});
test('invalid author, invalid date, unknown participants and oversized inputs never write',()=>{
 for(const change of [{author:'stranger'},{date:'2026-02-31'},{people:[{id:'unknown'}]},{title:'x'.repeat(301)},{time:'25:00'}]){
  const s=setup();assert.equal(s.context.addDepartmentEvent({...event,...change},id).ok,false);assert.equal(s.writes(),0);
 }
});
test('spreadsheet formulas in user titles are stored as literal text',()=>{
 const s=setup();assert.equal(s.context.addDepartmentEvent({...event,title:'=IMPORTXML("https://example.com")'},id).ok,true);assert.ok(s.data[1][3].startsWith("'="));
});

 test('failed partial writes are rolled back and validation is restored',()=>{
  const s=setup({failAfter:2}),r=s.context.addDepartmentEvent(event,id);
  assert.equal(r.ok,false);assert.ok(s.data.slice(1).every(row=>row.every(v=>v==='')));assert.equal(s.relaxed.has(2),false);
 });
 test('an old incomplete ID is never reported as a saved event',()=>{
  const s=setup();s.data.push(['WEB-'+id+'-0','ХПН','Павел Х.']);const r=s.context.addDepartmentEvent(event,id);
  assert.equal(r.ok,false);assert.equal(s.writes(),0);
 });
