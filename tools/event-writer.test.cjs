const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const data=[['ID события','','','Тип события','','','','','','','','','','','Связанное событие']],props={};let writes=0;
 const range=(row,col,height,width)=>({getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(data[row-1+i]?.[col-1+j]??''))),setValues:rows=>{writes++;rows.forEach((r,i)=>{data[row-1+i]=r.slice()})}});
 const sheet={getLastRow:()=>data.length,getRange:range};
 const book={getSheetByName:name=>name==='События'?sheet:{getDataRange:()=>({getDisplayValues:()=>[['ID','ФИО','Краткое имя'],['ХПН','Павел','Павел Х.'],['ПРВ','Роман','Роман П.']]})}};
 const context={SpreadsheetApp:{openById:()=>book,flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{formatDate:(_,tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-11-08':'08.11.2026'}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('tools/event-writer/Code.gs','utf8'),context);
 return {context,data,props,writes:()=>writes};
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
