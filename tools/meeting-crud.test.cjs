const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../meeting-actions.js');
const ids=['КДВ','АВВ','ХПН','ПРВ','САЕ','ГЮК','СЕВ'];let sequence=0;
const uuid=()=>String(++sequence).padStart(8,'0')+'-1111-4111-8111-111111111111';
const clone=x=>JSON.parse(JSON.stringify(x));
function backend(){
 const headers=Array(32).fill('');Object.assign(headers,{0:'ID события',3:'Тип события',14:'Связанное событие',18:'Даты продления отпуска',19:'Кто изменил',20:'Когда изменено'});
 const grid=[headers],roster=[['ID','ФИО','Краткое имя'],...ids.map(id=>[id,id,id])],formats=new Map(),relaxed=new Set(),props={};let writes=0,failAt=0;
 const raw=(r,c)=>grid[r-1]?.[c-1]??'';
 const format=(r,c)=>formats.get(r+':'+c)||(c===9?'h:mm':'General');
 const display=(v,r,c)=>{let s=String(v??'').replace(/^'(?=[=+\-@])/,'');return c===9&&format(r,c)!=='@'?s.replace(/^0(?=\d:)/,''):s};
 function set(r,c,v){if(c===4&&!relaxed.has(r)&&v!=='Наряд')throw Error('validation');if(++writes===failAt){failAt=0;throw Error('simulated partial write')}grid[r-1]??=[];grid[r-1][c-1]=v}
 function range(row,col,height=1,width=1){const values=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>raw(row+i,col+j)));return {
  getValues:values,getDisplayValues:()=>values().map((r,i)=>r.map((v,j)=>display(v,row+i,col+j))),getFormulas:()=>values().map(r=>r.map(()=>'')),
  getNumberFormats:()=>values().map((r,i)=>r.map((_,j)=>format(row+i,col+j))),
  setNumberFormat:f=>{for(let i=0;i<height;i++)for(let j=0;j<width;j++)formats.set((row+i)+':'+(col+j),f)},
  setNumberFormats:rows=>rows.forEach((r,i)=>r.forEach((f,j)=>formats.set((row+i)+':'+(col+j),f))),
  getDataValidations:()=>Array.from({length:height},(_,i)=>[!relaxed.has(row+i)]),clearDataValidations:()=>{for(let i=0;i<height;i++)relaxed.add(row+i)},setDataValidations:rules=>rules.forEach((r,i)=>r[0]?relaxed.delete(row+i):relaxed.add(row+i)),
  setValue:v=>set(row,col,v),setValues:rows=>rows.forEach((r,i)=>r.forEach((v,j)=>set(row+i,col+j,v))),clearContent:()=>{for(let i=0;i<height;i++)for(let j=0;j<width;j++){grid[row-1+i]??=[];grid[row-1+i][col-1+j]=''}}
 }}
 const sheet={getLastRow:()=>grid.length,getLastColumn:()=>32,getMaxColumns:()=>32,getRange:range,getDataRange:()=>range(1,1,grid.length,32)};
 const c={SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='События'?sheet:{getDataRange:()=>({getDisplayValues:()=>roster})}}),flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{if(Buffer.byteLength(v)>9000)throw Error('property byte limit');props[k]=v}})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{formatDate:(_,tz,pattern)=>pattern==='yyyy-MM-dd'?'2026-11-18':'18.11.2026'},HtmlService:{createHtmlOutput:html=>({html,setTitle(title){this.title=title;return this},addMetaTag(){return this}})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('tools/event-writer/Code.gs','utf8'),c);
 const schema=vm.runInContext('CHANGE_SCHEMAS.events',c);
 return {c,grid,props,formats,post:request=>c.doPost({parameter:{payload:JSON.stringify(request)}}),events:()=>grid.slice(1).filter(r=>r[0]).map(r=>({id:r[0],...c.changeRecord_(schema,r)})),writes:()=>writes,failAfter:n=>failAt=writes+n};
}
function add(s,author,people=ids.slice(0,2),title='Контроль полного цикла'){
 const event={author,people:people.map(id=>({id})),title,date:'2026-11-18',endDate:'2026-11-18',time:'09:00',note:''},request={action:'add',event,requestId:uuid()};
 assert.match(s.post(request).title,/Запись сохранена/);return s.events().filter(e=>e.type===title);
}
for(const author of ids)test('native add → edit participants/dates → cancel → reload for author '+author,()=>{
 const s=backend(),initial=add(s,author);assert.equal(initial.length,2);
 const input={author,title:'Изменённый контроль',date:'2026-11-19',endDate:'2026-11-21',time:'09:05',note:'Мероприятие: обновлено',people:ids.slice(2,5).map(id=>({id}))};
 const edit={action:'edit',label:input.title,requestId:uuid(),operations:M.edit(initial,input,()=> 'NEW-'+uuid())};
 assert.match(s.post(edit).title,/Изменения сохранены/);let current=s.events().filter(e=>e.status!=='Отменена');assert.equal(current.length,3);assert.ok(current.every(e=>e.type===input.title&&e.start===input.date&&e.end===input.endDate&&e.basis===input.time));assert.deepEqual(current.map(e=>e.personId).sort(),ids.slice(2,5).sort());assert.equal(M.isPublished(edit,s.events()),true);
 const count=s.writes();assert.match(s.post(edit).title,/Изменения сохранены/);assert.equal(s.writes(),count);
 const cancel={action:'cancel',label:input.title,requestId:uuid(),operations:M.cancel(current,author)};assert.match(s.post(cancel).title,/Мероприятие удалено/);assert.equal(s.events().filter(e=>e.status!=='Отменена').length,0);assert.equal(M.isPublished(cancel,clone(s.events())),true);
 const final=s.writes();assert.match(s.post(cancel).title,/Мероприятие удалено/);assert.equal(s.writes(),final);
});
test('stale multi-participant change is rejected before any write',()=>{
 const s=backend(),rows=add(s,'ПРВ'),request={action:'cancel',requestId:uuid(),operations:M.cancel(rows,'ПРВ')};s.grid[2][9]='Другой участник изменил комментарий';const before=s.writes();const result=s.post(request);assert.match(result.title,/не подтверждены/);assert.match(result.html,/Конфликт/);assert.equal(s.writes(),before);assert.ok(s.events().every(e=>e.status==='План'));
});
test('a failed second row rolls back all values and cell formats',()=>{
 const s=backend(),rows=add(s,'ПРВ'),snapshot=()=>JSON.stringify(s.grid.map(r=>Array.from({length:32},(_,i)=>r[i]??''))),before=snapshot(),formats=JSON.stringify(Array.from({length:s.grid.length-1},(_,i)=>Array.from({length:32},(_,j)=>s.formats.get((i+2)+':'+(j+1))||(j===8?'h:mm':'General'))));s.failAfter(5);const result=s.post({action:'cancel',requestId:uuid(),operations:M.cancel(rows,'ПРВ')});assert.match(result.title,/не подтверждены/);assert.equal(snapshot(),before);assert.equal(JSON.stringify(Array.from({length:s.grid.length-1},(_,i)=>Array.from({length:32},(_,j)=>s.formats.get((i+2)+':'+(j+1))||(j===8?'h:mm':'General')))),formats);
});
test('long Cyrillic comments and seven-person rollback backups stay within property byte limits',()=>{
 const s=backend(),rows=add(s,'ГЮК',ids);for(let i=1;i<s.grid.length;i++)s.grid[i][9]='я'.repeat(2000);const current=s.events();const result=s.post({action:'cancel',requestId:uuid(),operations:M.cancel(current,'ГЮК')});assert.match(result.title,/Мероприятие удалено/);assert.ok(JSON.parse(s.props.LAST_CHANGE_BACKUP).chunkCount>1);assert.equal(s.c.readChangeBackup_({getProperty:k=>s.props[k]}).rows.length,7);
});
test('migration backs out only old meeting queue locks and preserves other work',()=>{
 const row={id:'X',type:'Тест7',comment:'Мероприятие: Тест7',status:'План'},op=M.cancel([row],'ПРВ')[0],id=uuid(),source={operations:[op],awaitingPublished:[op],requestId:id,autoPaused:true};const before=JSON.stringify(source);
 const m=M.migrateLegacy(source,e=>String(e.comment).includes('Мероприятие'),uuid);assert.equal(JSON.stringify(source),before);assert.equal(m.changed,true);assert.equal(m.store.operations.length,0);assert.equal(m.store.requestId,null);assert.equal(m.requests[0].requestId,id);assert.equal(m.requests[0].action,'cancel');
 const task={collection:'tasks',id:'T',before:{title:'Задача'},after:{title:'Новая'}};const mixed=M.migrateLegacy({...source,operations:[op,task]},e=>String(e.comment).includes('Мероприятие'),uuid);assert.equal(mixed.store.operations[0].collection,'tasks');assert.equal(mixed.store.requestId,id);assert.equal(M.migrateLegacy(m.store,()=>true,uuid).changed,false);
});
test('native meeting requests cannot mutate other collections or leave records',()=>{
 const s=backend();for(const op of [{collection:'tasks',after:{title:'x'}},{collection:'events',after:{type:'Основной отпуск'}},{collection:'events',before:null,after:{status:'План'}}]){assert.match(s.post({action:'cancel',requestId:uuid(),operations:[op]}).title,/не подтверждены/)}assert.equal(s.writes(),0);
});

test('already applied cancellation accepts a new request without overwriting later comments',()=>{
 const s=backend(),rows=add(s,'ПРВ'),operations=M.cancel(rows,'ПРВ');assert.match(s.post({action:'cancel',requestId:uuid(),operations}).title,/Мероприятие удалено/);s.grid[1][9]='Последующая пометка';const count=s.writes();assert.match(s.post({action:'cancel',requestId:uuid(),operations}).title,/Мероприятие удалено/);assert.equal(s.writes(),count);assert.equal(s.grid[1][9],'Последующая пометка');
});
