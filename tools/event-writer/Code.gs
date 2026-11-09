// Anonymous append-only event writer, explicitly approved by Roman 08.11.2026.
// The selected author is a declared signature, NOT an authenticated identity.
const EVENT_SHEET_ID='1q83XSPLXRd9Fgk20gSs601SX9LZWA1yQvkZQQEQ49KU';
const EVENT_ORIGIN='https://pirhavko85-droid.github.io';
const EVENT_AUTHORS={'roman':'Роман П.','pavel':'Павел Х.','julia':'Юлия Г.','КДВ':'Денис К.','АВВ':'Василий А.','ХПН':'Павел Х.','ПРВ':'Роман П.','САЕ':'Александр С.','ГЮК':'Юлия Г.','СЕВ':'Екатерина С.'};
function text_(value,max){if(typeof value!=='string'||value.trim().length>max)throw new Error('Некорректное текстовое поле.');return value.trim()}
function safe_(s){return /^[=+\-@]/.test(s)?"'"+s:s}
function validateEvent_(input){
 if(!input||typeof input!=='object')throw new Error('Нет карточки мероприятия.');
 const title=text_(input.title,300),date=text_(input.date,10),time=text_(input.time,5),note=text_(input.note||'',2000);
 if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Проверьте название, дату и время.');
 if(date<'2020-01-01'||date>'2100-12-31')throw new Error('Проверьте год мероприятия.');
 if(!Object.prototype.hasOwnProperty.call(EVENT_AUTHORS,input.author))throw new Error('Выберите, кто внёс мероприятие.');
 if(!Array.isArray(input.people)||input.people.length>7)throw new Error('Проверьте участников.');
 const people=[...new Set(input.people.map(p=>text_(p.id,30)))];
 const endDate=text_(input.endDate||date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||new Date(endDate+'T12:00:00Z').toISOString().slice(0,10)!==endDate||endDate<date||endDate>'2100-12-31')throw new Error('Проверьте дату окончания.');
 return {title,date,endDate,time,note,people,author:input.author};
}
function addDepartmentEvent(input,requestId){
 try{
  if(!/^[a-f0-9-]{36}$/i.test(requestId||''))throw new Error('Неверный номер запроса. Обновите страницу.');
  const event=validateEvent_(input),lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('Идёт другая запись. Повторите через несколько секунд.');
  try{
   const book=SpreadsheetApp.openById(EVENT_SHEET_ID),sheet=book.getSheetByName('События');
   const last=sheet.getLastRow();if(last>20000)throw new Error('Достигнут лимит записей. Сообщите Роману.');
   const all=sheet.getRange(1,1,Math.max(1,last),15).getDisplayValues();
   if(all[0][0]!=='ID события'||all[0][3]!=='Тип события'||all[0][14]!=='Связанное событие')throw new Error('Изменилась структура таблицы. Сообщите Роману.');
   const prefix='WEB-'+requestId+'-',old=all.filter(r=>r[0].indexOf(prefix)===0);
   if(old.length){if(old.length!==Math.max(1,event.people.length)||old.some(r=>!r[3]||!r[4]||!r[8]))throw new Error('Обнаружена незавершённая прежняя запись. Сообщите Роману; мероприятие ещё не сохранено.');return {ok:true,duplicate:true,ids:old.map(r=>r[0])};}
   const displayDate=event.date.split('-').reverse().join('.');
   const existing=all.filter(r=>r[3].trim().toLowerCase()===event.title.toLowerCase()&&r[4]===displayDate&&(r[5]||r[4])===event.endDate.split('-').reverse().join('.')&&r[8]===event.time&&r[7]!=='Отменена');
   if(existing.length)return {ok:true,duplicate:true,ids:existing.map(r=>r[0])};
   const roster=book.getSheetByName('Сотрудники').getDataRange().getDisplayValues();
   const names={};roster.slice(1).filter(r=>r[0]).forEach(r=>{names[r[0]]=r[2]||r[1]});
   if(event.people.some(id=>!Object.prototype.hasOwnProperty.call(names,id)))throw new Error('Состав сотрудников изменился. Обновите дашборд.');
   const properties=PropertiesService.getScriptProperties(),today=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
   const quota=JSON.parse(properties.getProperty('APPEND_QUOTA')||'{}');
   if(quota.day===today&&quota.count>=200)throw new Error('Дневной лимит добавлений достигнут. Сообщите Роману.');
   const people=event.people.length?event.people:[''];
   const author=EVENT_AUTHORS[event.author],comment='Мероприятие: '+event.title+'. Начало в '+event.time+' по Москве.'+(event.note?' '+event.note:'');
   const group='WEB-GRP-'+requestId,entered=Utilities.formatDate(new Date(),'Europe/Moscow','dd.MM.yyyy');
   const rows=people.map((id,i)=>[prefix+i,id,names[id]||'',safe_(event.title),displayDate,event.endDate.split('-').reverse().join('.'),Math.round((Date.parse(event.endDate)-Date.parse(event.date))/86400000)+1,'План',event.time,safe_(comment),'Указал автор: '+author,entered,'Карточка дашборда; автор выбран без проверки аккаунта','Совещание / мероприятие',group]);
   const target=sheet.getRange(last+1,1,rows.length,15),before=target.getDisplayValues();
   if(before.some(r=>r.some(v=>v!=='')))throw new Error('Целевые строки уже заняты. Повторите попытку.');
   properties.setProperty('LAST_EVENT_REQUEST',JSON.stringify({requestId:requestId,event:event,createdAt:new Date().toISOString()}));
   properties.setProperty('LAST_APPEND_BACKUP',JSON.stringify({requestId:requestId,createdAt:new Date().toISOString(),range:'События!A'+(last+1)+':O'+(last+rows.length),before:before}));
   // Only these new meeting titles are free text. Existing category validation stays intact.
   const typeRange=sheet.getRange(last+1,4,rows.length,1),validation=typeRange.getDataValidations();
   try{
    typeRange.clearDataValidations();
    target.setValues(rows);SpreadsheetApp.flush();
    const check=target.getDisplayValues(),display=v=>String(v).replace(/^'(?=[=+\-@])/,'');
    if(check.some((r,i)=>r.some((v,j)=>v!==display(rows[i][j]))))throw new Error('Подтверждение полной записи не получено.');
   }catch(writeError){
    target.clearContent();typeRange.setDataValidations(validation);SpreadsheetApp.flush();
    throw new Error('Мероприятие не сохранено; незаполненные строки убраны. '+writeError.message);
   }
   properties.setProperty('APPEND_QUOTA',JSON.stringify({day:today,count:(quota.day===today?quota.count:0)+1}));
   return {ok:true,ids:rows.map(r=>r[0]),author:author};
  }finally{lock.releaseLock()}
 }catch(e){return {ok:false,message:e.message||'Не удалось сохранить мероприятие.'}}
}
function doGet(e){
 const channel=String(e&&e.parameter&&e.parameter.channel||'');
 if(!/^[a-f0-9-]{36}$/i.test(channel))return HtmlService.createHtmlOutput('<p>Откройте карточку мероприятия в дашборде отдела.</p>');
 const page=HtmlService.createHtmlOutputFromFile('Bridge').getContent().replace('__CHANNEL__',JSON.stringify(channel));
 return HtmlService.createHtmlOutput(page).setTitle('Добавление мероприятия').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Shared administrative calendar. Declared authors are independent of Google identity.
// No API keys, OAuth tokens, or deployment permissions are changed by this code.
const CHANGE_SCHEMAS={
 people:{sheet:'Сотрудники',header:'ID',fields:{full:1,short:2,role:3,category:4,birthdate:5},dates:['birthdate']},
 events:{sheet:'События',header:'ID события',fields:{personId:1,type:3,start:4,end:5,days:6,status:7,basis:8,comment:9,linkedEvent:14},dates:['start','end']},
 tasks:{sheet:'Задачи',header:'ID задачи',fields:{personId:1,title:3,description:4,created:5,deadline:6,priority:7,status:8,completed:9,author:10,comment:11,controlled:14},dates:['created','deadline','completed']},
 birthdays:{sheet:'Дни рождения',header:'Сотрудник ID',fields:{name:1,date:2,affiliation:7},dates:['date']}
};
function changeDate_(v){
 const s=String(v||'').trim();if(!s)return '';
 const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:s;
}
function changeRecord_(schema,row){
 const o={};Object.keys(schema.fields).forEach(k=>{
  const v=String(row[schema.fields[k]]||'');
  o[k]=k==='controlled'?v==='На контроле':schema.dates.indexOf(k)>=0?changeDate_(v):v;
 });return o;
}
function changeEqual_(a,b){return a===b||String(a==null?'':a)===String(b==null?'':b)}
function changeStatus_(requestId){return JSON.parse(PropertiesService.getScriptProperties().getProperty('CHANGE_'+requestId)||'null')}
function getDepartmentChangeStatus(requestId){
 if(!/^[a-f0-9-]{36}$/i.test(requestId||''))return {ok:false,message:'Некорректный номер запроса.'};
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:false,phase:'unknown',message:'Предыдущая запись ещё обрабатывается.'};
 try{return changeStatus_(requestId)||{ok:false,phase:'not_found',message:'Запрос не записан. Можно повторить отправку.'}}finally{lock.releaseLock()}
}
function applyDepartmentChanges(operations,requestId){
 if(!/^[a-f0-9-]{36}$/i.test(requestId||''))return {ok:false,message:'Некорректный номер запроса.'};
 if(!Array.isArray(operations)||!operations.length||operations.length>100)return {ok:false,message:'Отправляйте от 1 до 100 изменений.'};
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))return {ok:false,message:'Другой участник сохраняет изменения. Повторите позже.'};
 const prepared=[],done=[];
 try{
  const prior=changeStatus_(requestId);if(prior)return prior;
  const book=SpreadsheetApp.openById(EVENT_SHEET_ID),cache={},seen=new Set();
  const roster=book.getSheetByName('Сотрудники').getDataRange().getDisplayValues();
  const authors={};roster.slice(1).filter(r=>r[0]).forEach(r=>authors[r[0]]=r[2]||r[1]);
  const properties=PropertiesService.getScriptProperties(),day=Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');
  const quota=JSON.parse(properties.getProperty('CHANGE_QUOTA')||'{}');
  if(quota.day===day&&quota.count+operations.length>500)throw new Error('Дневной лимит изменений достигнут.');
  for(const op of operations){
   const schema=CHANGE_SCHEMAS[op.collection];
   if(!schema||typeof op.id!=='string'||!op.id||op.id.length>120||/^[=+\-@]/.test(op.id)||!op.after||typeof op.after!=='object'||Array.isArray(op.after))throw new Error('Некорректное изменение. Удаление через этот сервис не выполняется.');
   if(!Object.prototype.hasOwnProperty.call(authors,op.author))throw new Error('Выберите имя автора из сотрудников отдела.');
   const unique=op.collection+':'+op.id;if(seen.has(unique))throw new Error('Повтор записи в одном запросе.');seen.add(unique);
   if(!cache[op.collection]){
    const sheet=book.getSheetByName(schema.sheet),rows=sheet.getDataRange().getDisplayValues();
    if(rows.length>20000||rows[0][0]!==schema.header)throw new Error('Структура общей таблицы изменилась.');
    cache[op.collection]={sheet,rows,next:rows.length+1};
   }
   const entry=cache[op.collection],matches=[];entry.rows.forEach((r,i)=>{if(i&&String(r[0])===op.id)matches.push(i)});
   if(matches.length>1)throw new Error('В общей базе повторяющийся ID: '+op.id);
   const rowIndex=matches.length?matches[0]:-1,current=rowIndex>=0?changeRecord_(schema,entry.rows[rowIndex]):null;
   if((!current)!==(!op.before))throw new Error('Запись добавлена или удалена другим участником. Сначала сверьте общую базу.');
   if(current&&Object.keys(schema.fields).some(k=>!changeEqual_(current[k],op.before[k])))throw new Error('Конфликт: запись '+op.id+' уже изменена другим участником. Ваши правки сохранены локально.');
   const values={};Object.keys(schema.fields).forEach(k=>{
    if(k==='controlled'){if(typeof op.after[k]!=='boolean')throw new Error('Некорректный контроль задачи.');values[k]=op.after[k];return}
    const v=op.after[k];if(typeof v!=='string'||v.length>4000)throw new Error('Некорректное поле '+k);
    if(schema.dates.indexOf(k)>=0&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2100-12-31'))throw new Error('Проверьте дату.');
    values[k]=v;
   });
   if(values.personId&&!authors[values.personId])throw new Error('Неизвестный сотрудник.');
   if(op.collection==='events'&&(!values.type||!values.start||(values.end&&values.end<values.start)||(values.days&&!/^\d+$/.test(values.days))))throw new Error('Проверьте название, период и количество дней.');
   if(op.collection==='tasks'&&!values.title)throw new Error('Укажите название задачи.');
   if(op.collection==='birthdays'&&(!values.name||!values.date))throw new Error('Укажите имя и дату рождения.');
   if(op.collection==='people'&&(!values.short||!values.full))throw new Error('Укажите имя сотрудника.');
   prepared.push({op,schema,entry,values,row:rowIndex>=0?rowIndex+1:entry.next++,isNew:rowIndex<0,author:authors[op.author]});
  }
  // Save all affected original rows before any write. Formulas are preserved on rollback.
  const backups=prepared.map(p=>{const range=p.entry.sheet.getRange(p.row,1,1,p.entry.sheet.getLastColumn());return {sheet:p.schema.sheet,row:p.row,values:range.getValues()[0],formulas:range.getFormulas()[0]}});
  properties.setProperty('LAST_CHANGE_BACKUP',JSON.stringify({requestId,at:new Date().toISOString(),rows:backups}));
  properties.setProperty('CHANGE_'+requestId,JSON.stringify({ok:false,phase:'unknown',message:'Запись начата; требуется подтверждение результата.'}));
  for(let i=0;i<prepared.length;i++){
   const p=prepared[i],backup=backups[i];done.push({p,backup});
   if(p.op.collection==='events'&&(p.isNew||p.op.before.type!==p.values.type)){
    p.typeRange=p.entry.sheet.getRange(p.row,4);p.typeValidation=p.typeRange.getDataValidations();p.typeRange.clearDataValidations();
   }
   if(p.isNew)p.entry.sheet.getRange(p.row,1).setValue(safe_(p.op.id));
   Object.keys(p.schema.fields).forEach(k=>{
    if(!p.isNew&&changeEqual_(p.op.before[k],p.values[k]))return;
    let value=p.values[k];if(k==='controlled')value=value?'На контроле':'Не на контроле';else if(p.schema.dates.indexOf(k)>=0&&value)value=value.split('-').reverse().join('.');
    p.entry.sheet.getRange(p.row,p.schema.fields[k]+1).setValue(typeof value==='string'?safe_(value):value);
   });
   if(['events','tasks'].includes(p.op.collection)&&(p.isNew||p.op.before.personId!==p.values.personId))p.entry.sheet.getRange(p.row,3).setValue(safe_(authors[p.values.personId]||''));
   const headers=p.entry.sheet.getRange(1,1,1,p.entry.sheet.getLastColumn()).getDisplayValues()[0];
   for(const pair of [['Кто изменил','Указал автор: '+p.author],['Когда изменено',new Date().toISOString()]]){
    let col=headers.indexOf(pair[0])+1;if(!col){col=headers.length+1;if(col>p.entry.sheet.getMaxColumns())p.entry.sheet.insertColumnsAfter(p.entry.sheet.getMaxColumns(),1);p.entry.sheet.getRange(1,col).setValue(pair[0]);headers.push(pair[0])}
    p.entry.sheet.getRange(p.row,col).setValue(pair[1]);
   }
  }
  SpreadsheetApp.flush();
  for(const p of prepared){const row=p.entry.sheet.getRange(p.row,1,1,p.entry.sheet.getLastColumn()).getDisplayValues()[0],actual=changeRecord_(p.schema,row);if(Object.keys(p.schema.fields).some(k=>!changeEqual_(actual[k],p.values[k])))throw new Error('Полная запись не подтверждена.');}
  const result={ok:true,phase:'saved',requestId,count:prepared.length};
  properties.setProperty('CHANGE_QUOTA',JSON.stringify({day,count:(quota.day===day?quota.count:0)+operations.length}));properties.setProperty('CHANGE_'+requestId,JSON.stringify(result));return result;
 }catch(e){
  let rollback=true;
  for(const {p,backup} of done.reverse()){try{const currentWidth=p.entry.sheet.getLastColumn(),cells=backup.values.map((v,i)=>backup.formulas[i]||(typeof v==='string'?safe_(v):v));while(cells.length<currentWidth)cells.push('');p.entry.sheet.getRange(p.row,1,1,currentWidth).setValues([cells]);if(p.typeRange)p.typeRange.setDataValidations(p.typeValidation)}catch(_){rollback=false}}
  try{SpreadsheetApp.flush()}catch(_){rollback=false}
  if(!rollback){const result={ok:false,phase:'unknown',message:'Не удалось подтвердить восстановление записи. Не повторяйте отправку до сверки таблицы.'};PropertiesService.getScriptProperties().setProperty('CHANGE_'+requestId,JSON.stringify(result));return result}
  const rejected={ok:false,phase:'rejected',message:e.message||'Изменения не сохранены.'};if(done.length)PropertiesService.getScriptProperties().setProperty('CHANGE_'+requestId,JSON.stringify(rejected));return rejected;
 }finally{lock.releaseLock()}
}

