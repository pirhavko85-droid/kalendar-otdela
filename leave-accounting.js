// One accounting engine for snapshots and the dashboard. Dates use UTC throughout.
(function(root){
 'use strict';
 const TYPES=['Основной отпуск','Летний отпуск','Отпуск ВБД','Дополнительный отпуск','Отпуск по семейным обстоятельствам'];
 const FIELDS={leaveYear:'Отпускной год',leaveDays:'Сутки отпуска',travelDays:'Сутки дороги',holidayBonusDays:'Дополнительные дни ФГГС',totalAbsenceDays:'Всего дней отсутствия',partNumber:'Номер части',destination:'Место следования',travelBasis:'Основание дороги',officialHolidayCount:'Праздников в основной части',baseEnd:'Окончание основной части',leaveType:'Вид отпуска'};
 function shift(date,n){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
 function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(Date.parse(date)).toISOString().slice(0,10)===date}
 function span(start,end){if(!validDate(start)||!validDate(end))throw new Error('Некорректная дата отпуска');return Math.round((Date.parse(end)-Date.parse(start))/86400000)+1}
 function holiday(date){return /^(01-0[1-8]|02-23|03-08|05-01|05-09|06-12|11-04)$/.test(String(date).slice(5))}
 function countHolidays(start,end){let n=0;for(let d=start;d<=end;d=shift(d,1))if(holiday(d))n++;return n}
 function isLeave(e){return TYPES.includes(e.type)}
 function integer(value,name,min,max){const n=Number(value);if(value===''||value==null||!Number.isInteger(n)||n<min||n>max)throw new Error('Некорректное поле «'+name+'»');return n}
 function normalize(e,p){
  if(!isLeave(e))return {...e};
  const total=span(e.start,e.end||e.start);if(!Number.isInteger(total)||total<1||total>730)throw new Error('Некорректный период отпуска');
  const extra=e.holidayBonusDays==null?(e.extensionDates||[]).length:integer(e.holidayBonusDays,'Дополнительные дни ФГГС',0,1);
  const travel=integer(e.travelDays??0,'Сутки дороги',0,5);
  const days=integer(e.leaveDays??((e.days==null||e.days==='')?total:Number(e.days))-travel-extra,'Сутки отпуска',1,730);
  const year=integer(e.leaveYear??String(e.start).slice(0,4),'Отпускной год',2000,2100);
  const baseEnd=shift(e.start,days+travel-1),official=countHolidays(e.start,baseEnd);
  if(e.type==='Отпуск ВБД'&&(travel||extra))throw new Error('Отпуск ВБД не содержит дороги или дополнительных дней ФГГС');
  if(extra&&p&&p.category!=='ФГГС')throw new Error('Дополнительный день предназначен для ФГГС');
  if(p?.category==='ФГГС'&&travel)throw new Error('Дорога в этой модели предусмотрена для военнослужащих');
  if(p?.category==='ФГГС'&&['Основной отпуск','Летний отпуск'].includes(e.type)&&extra!==(official?1:0))throw new Error('По правилу проекта требуется один дополнительный день при наличии официального праздника');
  if(extra&&!official)throw new Error('В основной части нет официального праздника');
  if(total!==days+travel+extra)throw new Error('Период не совпадает с суммой: отпуск + дорога + дополнительный день');
  return {...e,leaveYear:year,leaveDays:days,days,travelDays:travel,holidayBonusDays:extra,totalAbsenceDays:total,baseEnd,officialHolidayCount:official,leaveType:e.type,partNumber:e.partNumber||'',destination:e.destination||'',travelBasis:e.travelBasis||'',extensionDates:extra?[shift(baseEnd,1)]:[]};
 }
 function account(p,events,year){
  const policy=p.leaveAccounts?.[year],complete=policy?.complete===true;
  const result={year,complete,mainLimit:policy?.main??null,vbdLimit:policy?.vbd??null,mainUsed:0,vbdUsed:0,mainPlan:0,vbdPlan:0,travelUsed:0,travelPlan:0,bonusUsed:0,bonusPlan:0,parts:[],warnings:[]};
  const seen=new Set();for(const raw of events){if(raw.personId!==p.id||!isLeave(raw)||['Отменена','Замена'].includes(raw.status)||Number(raw.leaveYear??String(raw.start).slice(0,4))!==Number(year))continue;
   if(seen.has(raw.id)){result.warnings.push('Повтор ID '+raw.id+' не учтён дважды');continue}seen.add(raw.id);
   let e;try{e=normalize(raw,p)}catch(err){result.warnings.push(raw.id+': '+err.message);result.complete=false;continue}result.parts.push(e);
   if(!['Факт','План'].includes(e.status)){result.warnings.push(e.id+': статус требует уточнения');continue}
   const actual=e.status==='Факт',bucket=e.type==='Отпуск ВБД'?'vbd':(['Основной отпуск','Летний отпуск'].includes(e.type)?'main':null);
   if(bucket)result[bucket+(actual?'Used':'Plan')]+=e.leaveDays;
   result[actual?'travelUsed':'travelPlan']+=e.travelDays;result[actual?'bonusUsed':'bonusPlan']+=e.holidayBonusDays;
  }
  for(const key of ['main','vbd']){result[key+'Remaining']=result.complete&&result[key+'Limit']!=null?result[key+'Limit']-result[key+'Used']:null;result[key+'Forecast']=result[key+'Remaining']==null?null:result[key+'Remaining']-result[key+'Plan'];if(result[key+'Forecast']<0)result.warnings.push('План превышает норму '+key)}
  if(result.parts.filter(e=>e.travelDays>0).length>1)result.warnings.push('Повторная дорога в одном отпускном году: проверить основания');
  result.parts.sort((a,b)=>a.start.localeCompare(b.start));return result;
 }
 root.LeaveAccounting={FIELDS,TYPES,isLeave,normalize,account,holiday,countHolidays,shift,span};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.LeaveAccounting;
})(typeof globalThis==='undefined'?this:globalThis);
