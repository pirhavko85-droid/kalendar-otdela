const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?undefined:end)}
function context(events=[],people=[]){const c={LeaveAccounting:require('../leave-accounting.js'),db:{events,people,tasks:[]},todayISO:()=> '2026-11-08',productionDayInfo:d=>({nonwork:['2026-11-07','2026-11-08'].includes(d)}),person:id=>people.find(p=>p.id===id)};vm.createContext(c);for(const name of ['effectiveEventStatus','activeEvent','eventTime','meetingGroupKey','groupedMeetingEvents','peoplePresenceInfo'])vm.runInContext(fn(name),c);return c}
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
 , 'События':[['ID события','Сотрудник ID','Сотрудник','Тип события','Дата начала','Дата окончания','Количество дней','Статус','Основание/номер','Комментарий','Кто внёс','Дата внесения','Источник ввода','Категория учёта','Связанное событие']]
 },props={};let writes=0,strict=true;
 const display=v=>String(v??'').replace(/^'(?=[=+\-@])/,'');
 const sheet=name=>({getDataRange:()=>({getDisplayValues:()=>grids[name].map(r=>r.map(display))}),getLastColumn:()=>Math.max(...grids[name].map(r=>r.length)),getMaxColumns:()=>50,
  getRange:(row,col,h=1,w=1)=>{const raw=()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grids[name][row-1+i]?.[col-1+j]??''));return{getDisplayValues:()=>raw().map(r=>r.map(display)),getValues:raw,getDataValidations:()=>[[strict]],clearDataValidations:()=>{strict=false},setDataValidations:v=>{strict=v[0][0]},getFormulas:()=>raw().map(r=>r.map(()=>'')),setValue:v=>{if(name==='События'&&col===4&&strict&&v!=='Наряд')throw Error('strict validation');writes++;grids[name][row-1]??=[];grids[name][row-1][col-1]=v},setFormula:v=>{assert.match(v,/^=W[0-9]+$/);writes++;grids[name][row-1][col-1]=grids[name][row-1][22]},setValues:rows=>{writes++;rows.forEach((r,i)=>{grids[name][row-1+i]??=[];r.forEach((v,j)=>grids[name][row-1+i][col-1+j]=v)})}}}
 });
 const c={SpreadsheetApp:{openById:()=>({getSheetByName:sheet}),flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Utilities:{formatDate:()=> '2026-11-08'}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('tools/event-writer/Code.gs','utf8'),c);return{c,grids,props,writes:()=>writes};
}
const request='11111111-1111-1111-1111-111111111111';
test('shared leave writer stores debit, road and accounting year separately and rejects an inconsistent interval before writing',()=>{
 for(const valid of [true,false]){const s=backend(),schema=vm.runInContext('CHANGE_SCHEMAS.events',s.c);s.grids['События'][0].length=32;const after=s.c.changeRecord_(schema,[]);Object.assign(after,{personId:'P',type:'Основной отпуск',start:'2026-08-24',end:'2026-09-16',days:'20',leaveDays:'20',leaveYear:'2026',travelDays:valid?'4':'6',holidayBonusDays:'0',status:'Факт'});const result=s.c.applyDepartmentChanges([{collection:'events',id:'LEAVE-TEST',author:'P',before:null,after}],request);assert.equal(result.ok,valid,result.message);if(valid){assert.equal(s.grids['События'][1][6],'20');assert.equal(s.grids['События'][1][21],'2026');assert.equal(s.grids['События'][1][23],'4');assert.equal(s.grids['События'][1][25],'24')}else assert.equal(s.writes(),0)}
});
test('shared FGGS writer keeps the extra calendar date outside the annual debit',()=>{const s=backend();s.grids['Сотрудники'][1][4]='ФГГС';s.grids['События'][0].length=32;const schema=vm.runInContext('CHANGE_SCHEMAS.events',s.c),after=s.c.changeRecord_(schema,[]);Object.assign(after,{personId:'P',type:'Основной отпуск',start:'2026-06-01',end:'2026-06-26',days:'25',leaveDays:'25',leaveYear:'2026',travelDays:'0',holidayBonusDays:'1',status:'Факт'});const result=s.c.applyDepartmentChanges([{collection:'events',id:'FG-TEST',author:'P',before:null,after}],request);assert.equal(result.ok,true,result.message);assert.equal(s.grids['События'][1][24],'1');assert.equal(s.grids['События'][1][25],'26');assert.equal(s.grids['События'][1][30],'25.06.2026')});
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

test('shared event title accepts free text despite strict category validation',()=>{
 const s=backend();const after={personId:'P',type:'Новое мероприятие',start:'2026-11-09',end:'2026-11-10',days:'2',status:'План',basis:'11:00',comment:'',linkedEvent:''};
 const result=s.c.applyDepartmentChanges([{collection:'events',id:'NEW-EVENT',author:'P',before:null,after}],request);
 assert.equal(result.ok,true);assert.equal(s.grids['События'][1][3],after.type);assert.equal(s.grids['События'][1][2],'Роман П.');assert.equal(s.grids['События'][1][5],'10.11.2026');
});

test('removal targets every participant of exactly one meeting and keeps recoverable rows',()=>{
 const rows=[{id:'a',type:'Тест',linkedEvent:'g1',start:'2026-11-09',status:'План'},{id:'b',type:'Тест',linkedEvent:'g1',start:'2026-11-09',status:'План'},{id:'c',type:'Тест',linkedEvent:'g2',start:'2026-11-10',status:'План'}];
 const c=context(rows);c.isMeetingEvent=()=>true;vm.runInContext(fn('meetingRowsForRemoval'),c);
 const selected=c.meetingRowsForRemoval('a');assert.deepEqual(Array.from(selected,e=>e.id),['a','b']);selected.forEach(e=>e.status='Отменена');
 assert.equal(c.groupedMeetingEvents(rows).length,1);assert.equal(rows.length,3);assert.equal(rows[2].status,'План');assert.equal(c.activeEvent(rows[0],'2026-11-09'),false);assert.equal(c.meetingRowsForRemoval('missing').length,0);
});
test('author is parenthesized in the same participant text',()=>{
 const c=context();vm.runInContext(fn('meetingPeopleLine'),c);assert.equal(c.meetingPeopleLine({participants:['Павел Х.','Роман П.'],enteredBy:'Указал автор: Роман П.'}),'Павел Х., Роман П. (автор: Роман П.)');
 assert.equal(c.meetingPeopleLine({participants:[]}), 'Участник не указан');
});

test('cancelling a participant group is conflict checked before any write',()=>{
 for(const conflict of [false,true]){
  const s=backend();for(const id of ['E1','E2'])s.grids['События'].push([id,'P','Роман','Тест','09.11.2026','09.11.2026','1','План','15:00','','','','','','GROUP']);
  const schema=vm.runInContext('CHANGE_SCHEMAS.events',s.c),ops=s.grids['События'].slice(1).map(r=>{const before=s.c.changeRecord_(schema,r);return{collection:'events',id:r[0],author:'P',before,after:{...before,status:'Отменена'}}});
  if(conflict)ops[1].before.type='Старая версия';const result=s.c.applyDepartmentChanges(ops,request);
  assert.equal(result.ok,!conflict);if(conflict){assert.equal(s.writes(),0);assert.equal(s.grids['События'][1][7],'План')}else{assert.equal(result.count,2);assert.equal(s.grids['События'][1][7],'Отменена');assert.equal(s.grids['События'][2][7],'Отменена')}
 }
});

test('meeting edits preserve existing IDs and group while updating every participant',()=>{
 const c=context();vm.runInContext(fn('planMeetingEdit'),c);let seq=0;
 const rows=[{id:'a',personId:'P',type:'Старое название',start:'2026-11-09',end:'2026-11-09',status:'План',linkedEvent:'G'},{id:'b',personId:'Q',type:'Старое название',start:'2026-11-09',end:'2026-11-09',status:'План',linkedEvent:'G'}];
 const before=JSON.stringify(rows),input={title:'Новое название',date:'2026-11-10',endDate:'2026-11-12',time:'16:30',note:'Новый комментарий',people:[{id:'P'},{id:'Q'},{id:'R'}]};
 const planned=c.planMeetingEdit(rows,input,()=> 'new-'+(++seq));assert.equal(JSON.stringify(rows),before);assert.deepEqual(Array.from(planned,r=>r.id),['a','b','new-1']);assert.equal(new Set(planned.map(r=>r.linkedEvent)).size,1);
 for(const row of planned){assert.equal(row.type,input.title);assert.equal(row.start,input.date);assert.equal(row.end,input.endDate);assert.equal(row.days,3);assert.equal(row.basis,'16:30');assert.equal(row.comment,input.note)}
 const reduced=c.planMeetingEdit(rows,{...input,people:[{id:'Q'}]},()=> 'unused');assert.equal(reduced.find(r=>r.id==='a').status,'Отменена');assert.equal(reduced.find(r=>r.id==='b').status,'План');assert.equal(reduced.length,2);
 const noPeople=c.planMeetingEdit(rows,{...input,people:[]},()=> 'unused');assert.equal(noPeople.filter(r=>r.status!=='Отменена').length,1);assert.equal(noPeople[0].personId,'');
});

test('today uses the current day for a multiday event heading and preserves the original period',()=>{
 const c=context([{id:'move',type:'Переезд',start:'2026-11-09',end:'2026-11-13',status:'План',basis:'09:00'}]);let out='';
 Object.assign(c,{todayISO:()=> '2026-11-10',esc:String,fmt:String,isMeetingEvent:()=>true,eventRelative:d=>d==='2026-11-10'?'сегодня':'вчера',eventDateTitle:d=>d==='2026-11-10'?'Вторник, 10 ноября':'Понедельник, 9 ноября',document:{getElementById:id=>id==='eventsTable'?{set innerHTML(v){out=v}}:{value:''}}});
 for(const name of ['meetingPeopleLine','renderEventDateGroups','renderEvents'])vm.runInContext(fn(name),c);
 c.renderEvents();const today=out.split('<details')[0];assert.match(today,/Вторник, 10 ноября/);assert.doesNotMatch(today,/Понедельник/);assert.match(today,/2026-11-09 — 2026-11-13/);assert.equal(c.db.events[0].start,'2026-11-09');
 assert.match(c.renderEventDateGroups(c.groupedMeetingEvents(c.db.events),'past'),/Понедельник, 9 ноября/);
});
test('today date follows Moscow at midnight regardless of the device timezone',()=>{
 const c={Intl,Date:class extends Date{constructor(){super('2026-11-09T21:01:00Z')}}};vm.createContext(c);vm.runInContext(fn('todayISO'),c);assert.equal(c.todayISO(),'2026-11-10');
});
