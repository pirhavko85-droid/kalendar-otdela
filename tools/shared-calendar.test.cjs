const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?undefined:end)}
function context(events=[],people=[]){const c={db:{events,people,tasks:[]},todayISO:()=> '2026-11-08',productionDayInfo:d=>({nonwork:['2026-11-07','2026-11-08'].includes(d)}),person:id=>people.find(p=>p.id===id)};vm.createContext(c);for(const name of ['effectiveEventStatus','activeEvent','eventTime','meetingGroupKey','groupedMeetingEvents','peoplePresenceInfo'])vm.runInContext(fn(name),c);return c}
test('weekend is off by default, explicit service and duty override it; cancelled service does not',()=>{
 const p={id:'P'},c=context([],[p]);assert.equal(c.peoplePresenceInfo(p).label,'Выходной');assert.equal(c.peoplePresenceInfo(p).present,false);assert.equal(c.peoplePresenceInfo(p,'2026-11-09').present,true);
 c.db.events.push({id:'work',personId:'P',type:'Выход в выходной/праздничный день',start:'2026-11-08',end:'2026-11-08',status:'Факт'});assert.equal(c.peoplePresenceInfo(p).present,true);
 c.db.events[0].status='Отменена';assert.equal(c.peoplePresenceInfo(p).present,false);
 c.db.events[0].status='Факт';c.db.events[0].type='Наряд';assert.equal(c.peoplePresenceInfo(p).present,true);
});
test('two confirmed five-day moves count as two while all ten calendar occurrences remain',()=>{
 const events=[];for(const [id,start] of [['MOVE-20261109-GAG-YUG',9],['MOVE-20261116-YUG-OPIDO-3',16]])for(let n=0;n<5;n++)events.push({id:id+(n?'-'+(start+n):''),type:'Переезд',start:'2026-11-'+(start+n).toString().padStart(2,'0'),status:'План'});
 const c=context(events),groups=c.groupedMeetingEvents(events);assert.equal(groups.length,2);assert.equal(groups[0].start,'2026-11-09');assert.equal(groups[0].end,'2026-11-13');assert.equal(groups[1].end,'2026-11-20');assert.equal(events.length,10);
});
test('one interval appears daily and stays current through its last day; unrelated repeated titles stay separate',()=>{
 const c=context(),a={id:'a',type:'Переезд',start:'2026-11-09',end:'2026-11-13',status:'План'};c.db.events=[a];
 for(let n=9;n<=13;n++)assert.equal(c.activeEvent(a,'2026-11-'+String(n).padStart(2,'0')),true);
 assert.equal(c.activeEvent(a,'2026-11-14'),false);
 assert.equal(c.groupedMeetingEvents([a,{...a,id:'b',start:'2026-11-16',end:'2026-11-20'}]).length,2);
});
function backend(){
 const grids={
  'Сотрудники':[['ID','ФИО','Краткое имя','Должность','Категория','Дата рождения'],['P','Роман','Роман П.','Инженер','Сотрудник','17.06.1985']],
  'Задачи':[['ID задачи','Исполнитель ID','Исполнитель','Задача','Описание','Дата постановки','Срок исполнения','Приоритет','Статус','Дата выполнения','Постановщик','Комментарий','Просрочена','Дней до срока','Контроль'],['T','P','Роман','Старая задача','','08.11.2026','','Обычный','Новая','','','','','','Не на контроле']]
 },props={};let writes=0;
 const display=v=>String(v??'').replace(/^'(?=[=+\-@])/,'');
 const sheet=name=>({getDataRange:()=>({getDisplayValues:()=>grids[name].map(r=>r.map(display))}),getLastColumn:()=>Math.max(...grids[name].map(r=>r.length)),getMaxColumns:()=>50,
  getRange:(row,col,h=1,w=1)=>{const raw=()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grids[name][row-1+i]?.[col-1+j]??''));return{getDisplayValues:()=>raw().map(r=>r.map(display)),getValues:raw,getFormulas:()=>raw().map(r=>r.map(()=>'')),setValue:v=>{writes++;grids[name][row-1]??=[];grids[name][row-1][col-1]=v},setValues:rows=>{writes++;rows.forEach((r,i)=>{grids[name][row-1+i]??=[];r.forEach((v,j)=>grids[name][row-1+i][col-1+j]=v)})}}}
 });
 const c={SpreadsheetApp:{openById:()=>({getSheetByName:sheet}),flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{formatDate:()=> '2026-11-08'}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('tools/event-writer/Code.gs','utf8'),c);return{c,grids,props,writes:()=>writes};
}
const request='11111111-1111-1111-1111-111111111111';
function operation(s){const before=s.c.changeRecord_(s.c.CHANGE_SCHEMAS||vm.runInContext('CHANGE_SCHEMAS',s.c).tasks,s.grids['Задачи'][1]);return{collection:'tasks',id:'T',author:'P',before,after:{...before,title:'Обновлённая задача'}}}
test('shared writer accepts declared roster author with no Google account and verifies idempotent result',()=>{
 const s=backend(),op=operation(s),r=s.c.applyDepartmentChanges([op],request);assert.equal(r.ok,true);assert.equal(s.grids['Задачи'][1][3],'Обновлённая задача');assert.ok(s.grids['Задачи'][1].includes('Указал автор: Роман П.'));const n=s.writes();assert.equal(s.c.applyDepartmentChanges([op],request).ok,true);assert.equal(s.writes(),n);assert.equal(s.c.getDepartmentChangeStatus(request).ok,true);
});
test('concurrent edits, unknown authors and deletion are rejected before any cell write',()=>{
 for(const kind of ['conflict','author','delete']){const s=backend(),op=operation(s);if(kind==='conflict')op.before.title='Чужая версия';if(kind==='author')op.author='unknown';if(kind==='delete')op.after=null;const r=s.c.applyDepartmentChanges([op],request);assert.equal(r.ok,false);assert.equal(s.writes(),0)}
});
test('formula-like edits stay literal and result status distinguishes unknown request',()=>{
 const s=backend(),op=operation(s);op.after.title='=IMPORTXML("https://example.com")';assert.equal(s.c.applyDepartmentChanges([op],request).ok,true);assert.ok(s.grids['Задачи'][1][3].startsWith("'="));assert.equal(s.c.getDepartmentChangeStatus('22222222-2222-2222-2222-222222222222').phase,'not_found');
});
