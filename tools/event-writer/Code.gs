// Anonymous append-only event writer, explicitly approved by Roman 08.11.2026.
// The selected author is a declared signature, NOT an authenticated identity.
const EVENT_SHEET_ID='1q83XSPLXRd9Fgk20gSs601SX9LZWA1yQvkZQQEQ49KU';
const EVENT_ORIGIN='https://pirhavko85-droid.github.io';
const EVENT_AUTHORS={'roman':'Роман П.','pavel':'Павел Х.','julia':'Юлия Г.'};
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
 return {title,date,time,note,people,author:input.author};
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
   const existing=all.filter(r=>r[3].trim().toLowerCase()===event.title.toLowerCase()&&r[4]===displayDate&&r[8]===event.time&&r[7]!=='Отменена');
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
   const rows=people.map((id,i)=>[prefix+i,id,names[id]||'',safe_(event.title),displayDate,displayDate,1,'План',event.time,safe_(comment),'Указал автор: '+author,entered,'Карточка дашборда; автор выбран без проверки аккаунта','Совещание / мероприятие',group]);
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
