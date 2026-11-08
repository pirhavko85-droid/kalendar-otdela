(function(root){
 'use strict';
 function moscowToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=t=>parts.find(x=>x.type===t).value;
  return get('year')+'-'+get('month')+'-'+get('day');
 }
 function isoDate(y,m,d){
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date.toISOString().slice(0,10):'';
 }
 function parse(text,today=moscowToday()){
  const t=String(text||'').trim(),low=t.toLowerCase().replace(/ё/g,'е');
  let date='',time='',warning=[];
  const base=new Date(today+'T12:00:00Z');
  const relative=low.match(/послезавтра|завтра|сегодня/);
  if(relative){base.setUTCDate(base.getUTCDate()+({'сегодня':0,'завтра':1,'послезавтра':2}[relative[0]]||0));date=base.toISOString().slice(0,10)}
  const numeric=low.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?=\s|[,.!?]|$)/);
  const months=['январ','феврал','март','апрел','мая','июн','июл','август','сентябр','октябр','ноябр','декабр'];
  const named=low.match(/(?:^|\s)(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4})(?:\s*года)?)?/);
  if(numeric||named){
   const match=numeric||named,y=Number(match[3]||today.slice(0,4)),m=numeric?Number(match[2]):months.findIndex(x=>match[2].startsWith(x))+1;
   const explicit=isoDate(y,m,Number(match[1]));
   if(date&&explicit!==date)warning.push('Относительная и указанная даты различаются — выберите нужную.');
   date=explicit;
   if(!date)warning.push('Указанная дата не существует.');
   if(!match[3])warning.push('Год принят текущий: '+y+'. Проверьте дату.');
  }
  const clock=low.match(/(?:^|\s)([01]?\d|2[0-3]):(\d{2})(?=\s|[,.!?]|$)/);
  const hour=low.match(/(?:^|\s)в\s+([01]?\d|2[0-3])(?:\s+(\d{1,2}))?\s*(?:час(?:а|ов)?|утра|вечера|дня)(?=\s|[,.!?]|$)/);
  if(clock&&Number(clock[2])<60)time=clock[1].padStart(2,'0')+':'+clock[2];
  else if(hour){let h=Number(hour[1]),min=Number(hour[2]||0);if(hour[0].includes('вечера')&&h<12)h+=12;if(min<60)time=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0')}
  if(!date)warning.push('Дата не распознана — укажите её в карточке.');
  if(!time)warning.push('Время не распознано — укажите его в карточке.');
  return {title:t,date,time,warning};
 }
 function format(draft){
  const d=draft.date?draft.date.split('-').reverse().join('.'):'';
  return 'Добавь мероприятие в Google-таблицу календаря отдела.\nНазвание: '+draft.title.trim()+'\nДата: '+d+'\nВремя: '+draft.time+' (Москва)\nУчастники: '+(draft.people.length?draft.people.join(', '):'не указаны')+(draft.note.trim()?'\nКомментарий: '+draft.note.trim():'')+'\nПроверь отсутствие дубля, сохрани в общей таблице и проверь публикацию в дашборде.';
 }
 const api={parse,format,moscowToday};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EventDraft=api;
})(typeof window==='undefined'?this:window);
