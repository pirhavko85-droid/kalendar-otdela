(function(){
 'use strict';
 // Public append-only endpoint approved by Roman; author is a declared signature.
 const WRITE_URL='https://script.google.com/macros/s/AKfycby_8kebiO2KSNJjqWrR3G4tHQ1gOKdSTf15K0lUxtanI8PpWDz-gq41dHUmfsjY9RJ3/exec';
 const modal=document.createElement('div');modal.id='eventCard';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Новое мероприятие');
 modal.innerHTML=`<div class="modal-box"><div class="modal-head"><h3>Новое мероприятие</h3><button type="button" id="cardClose" aria-label="Закрыть карточку">×</button></div>
 <details id="cardParsePanel"><summary>Заполнить карточку из текста</summary><label>Текст мероприятия<textarea id="cardText" rows="3" placeholder="Совещание завтра в 11:30"></textarea></label><button type="button" id="cardParse">Заполнить карточку</button><p class="muted">Проверьте дату и время. Участников выберите ниже.</p></details>
 <details id="cardDeletePanel"><summary>Удалить / изменить мероприятие по названию</summary><label>Кто вносит изменения<select id="cardDeleteAuthor"></select></label><label>Найти мероприятие<input id="cardDeleteSearch" placeholder="Например: Тест" autocomplete="off"></label><p class="muted">Выберите запись и действие: изменить её поля или удалить из календаря. Изменения станут общими после публикации. Удалённая запись сохраняется в таблице как отменённая для восстановления.</p><div id="cardDeleteResults"></div></details>
 <form id="cardForm" class="form-grid"><label class="full">Кто внёс<select id="cardAuthor" required><option value="">Выберите автора</option><option value="roman">Роман П.</option><option value="pavel">Павел Х.</option><option value="julia">Юлия Г.</option></select></label><label class="full">Название<input id="cardTitle" maxlength="300" required placeholder="Например: получение временных пропусков"></label><label>Дата<input id="cardDate" type="date" required></label><label>Дата окончания<input id="cardEndDate" type="date"></label><label>Время (Москва)<input id="cardTime" type="time" required></label><fieldset class="full" id="cardPeople"><legend>Участники</legend></fieldset><label class="full">Комментарий<textarea id="cardNote" maxlength="2000" rows="2" placeholder="Необязательно"></textarea></label><p id="cardWarning" class="full muted"></p>

 <button class="primary full" type="submit" id="cardSubmit">Добавить в общий календарь</button></form><p id="cardStatus" role="status" aria-live="polite"></p>
 <details id="cardCopy"><summary>Передать карточку через чат</summary><button type="button" id="cardCopyButton">Подготовить текст для чата</button><label id="cardCopyBox" hidden>Текст для чата<textarea id="cardCopyText" rows="6" readonly></textarea></label></details></div>`;
 document.body.append(modal);const $=id=>document.getElementById(id);let peer=null,peerOrigin='',channel='',frame=null,pending=null,lastPayload='',requestId='',poll=null,editingId=null,editingBaseline=[],editingAutoNote=false;
 const notice=document.createElement('p');notice.id='eventSaveNotice';notice.className='card';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;document.getElementById('eventsTable').before(notice);
 const status=(t,showOutside=false)=>{$('cardStatus').textContent=t;if(showOutside){notice.textContent=t;notice.hidden=false}if(modal.classList.contains('open'))$('cardStatus').scrollIntoView({block:'nearest'})};
 const publicationHint='По расписанию: проверки каждые 5 минут круглосуточно, включая выходные. Запуск может задерживаться. Повторно добавлять мероприятие не нужно.';
 function setBusy(active){$('cardForm').querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=active)}
 const endpoint=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(WRITE_URL);
 function clearCopy(){$('cardCopyBox').hidden=true}
 $('cardForm').addEventListener('input',clearCopy);
 function draft(){return {title:$('cardTitle').value.trim(),date:$('cardDate').value,endDate:$('cardEndDate').value||$('cardDate').value,time:$('cardTime').value,people:[...$('cardPeople').querySelectorAll('input:checked')].map(x=>({id:x.value,name:x.dataset.name})),note:$('cardNote').value.trim(),author:$('cardAuthor').value}}
 function open(){
  if(editingId){$('cardTitle').value='';$('cardDate').value=EventDraft.moscowToday();$('cardEndDate').value='';$('cardTime').value='';$('cardNote').value='';$('cardPeople').querySelectorAll('input').forEach(box=>box.checked=false)}
  editingAutoNote=false;editingId=null;editingBaseline=[];$('cardSubmit').textContent='Добавить в общий календарь';
  modal.setAttribute('aria-label','Новое мероприятие');$('cardCopy').hidden=false;modal.querySelector('h3').textContent='Новое мероприятие';$('cardForm').style.display='';$('cardParsePanel').hidden=false;$('cardDeletePanel').open=false;
  const selected=new Set([...$('cardPeople').querySelectorAll('input:checked')].map(x=>x.value));
  const author=$('cardAuthor'),saved=author.value;author.innerHTML='<option value="">Выберите автора</option>'+db.people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.short||p.full)+'</option>').join('');author.value=saved||localStorage.getItem('departmentEditorV1')||'';
  const field=$('cardPeople');field.replaceChildren();const legend=document.createElement('legend');legend.textContent='Участники';field.append(legend);
  for(const p of db.people){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=p.id;box.dataset.name=p.short;box.checked=selected.has(p.id);label.append(box,document.createTextNode(p.short));field.append(label)}
  if(!$('cardDate').value)$('cardDate').value=EventDraft.moscowToday();
  try{if(!$('cardAuthor').value)$('cardAuthor').value=localStorage.getItem('departmentEventAuthorV1')||''}catch(_){}
  $('cardSubmit').disabled=!endpoint||!!pending;
  if(!endpoint)status('Карточка готова. Прямое сохранение в Google Sheets ещё подключается. Сейчас её можно передать через чат.');
  $('cardDeleteAuthor').innerHTML=author.innerHTML;$('cardDeleteAuthor').value=author.value;renderRemovalResults();
  modal.classList.add('open');$('cardTitle').focus();
 }
 window.openEventCard=open;
 function renderRemovalResults(){
  const q=$('cardDeleteSearch').value.trim().toLowerCase();
  const groups=groupedMeetingEvents(db.events.filter(isMeetingEvent)).filter(e=>!q||(e.type+' '+fmt(e.start)+' '+eventTime(e)).toLowerCase().includes(q)).sort((a,b)=>b.start.localeCompare(a.start));
  const host=$('cardDeleteResults');host.replaceChildren();
  if(!groups.length){host.textContent='Мероприятий не найдено.';return}
  for(const e of groups.slice(0,30)){
   const row=document.createElement('div');row.className='event-delete-result';const label=document.createElement('span'),title=document.createElement('b'),dates=document.createElement('small');title.textContent=e.type;dates.textContent=fmt(e.start)+(e.end&&e.end!==e.start?' — '+fmt(e.end):'')+' · '+(eventTime(e)||'без времени');label.append(title,dates);
   const button=document.createElement('button');button.type='button';button.className='event-remove';button.textContent='Удалить';button.onclick=()=>{
    const author=$('cardDeleteAuthor').value;if(!author){status('Выберите, кто удаляет мероприятие.',true);return}
    if(!confirm('Удалить «'+e.type+'» · '+dates.textContent+' из общего календаря для всех участников?'))return;
    if(window.removeDepartmentMeeting?.(e.id,author,t=>status(t,true))){renderRemovalResults();$('cardDeletePanel').open=false}
   };const edit=document.createElement('button');edit.type='button';edit.textContent='Изменить';edit.className='event-remove';edit.onclick=()=>openEdit(e.id);const actions=document.createElement('div');actions.className='meeting-actions';actions.append(edit,button);row.append(label,actions);host.append(row);
  }
  if(groups.length>30){const hint=document.createElement('p');hint.textContent='Показаны первые 30 записей. Уточните название в поиске.';host.append(hint)}
 }
 function openRemoval(id,query=''){
  open();modal.setAttribute('aria-label','Удалить / изменить мероприятие');$('cardCopy').hidden=true;modal.querySelector('h3').textContent='Удалить / изменить мероприятие';$('cardForm').style.display='none';$('cardParsePanel').hidden=true;
  const item=db.events.find(e=>e.id===id);$('cardDeleteSearch').value=item?item.type:query;$('cardDeletePanel').open=true;renderRemovalResults();$('cardDeleteSearch').focus();
 }
 function openEdit(id){
  const rows=meetingRowsForRemoval(id);if(!rows.length){status('Мероприятие не найдено.',true);return}
  const group=groupedMeetingEvents(rows)[0],selectedAuthor=$('cardDeleteAuthor').value;open();if(selectedAuthor)$('cardAuthor').value=selectedAuthor;editingId=id;editingBaseline=JSON.parse(JSON.stringify(rows));
  modal.setAttribute('aria-label','Изменить мероприятие');modal.querySelector('h3').textContent='Изменить мероприятие';$('cardDeletePanel').open=false;$('cardCopy').hidden=true;
  $('cardTitle').value=group.type;$('cardDate').value=group.start;$('cardEndDate').value=group.end||group.start;$('cardTime').value=eventTime(group);
  editingAutoNote=/^Мероприятие: .*?\. Начало в \d{2}:\d{2} по Москве\./.test(String(group.comment||''));
  $('cardNote').value=String(group.comment||'').replace(/^Мероприятие: .*?\. Начало в \d{2}:\d{2} по Москве\.\s*/, '');
  const people=new Set(rows.map(r=>r.personId));$('cardPeople').querySelectorAll('input').forEach(box=>box.checked=people.has(box.value));
  $('cardSubmit').textContent='Сохранить изменения в общем календаре';clearCopy();$('cardTitle').focus();
 }
 $('cardDeleteSearch').oninput=renderRemovalResults;
 $('cardDeletePanel').addEventListener('toggle',()=>{if($('cardDeletePanel').open)renderRemovalResults()});
 document.getElementById('eventsTable').addEventListener('click',e=>{const button=e.target.closest('[data-remove-meeting]');if(button)openRemoval(button.dataset.removeMeeting)});
 window.openMeetingRemoval=openRemoval;

 $('cardClose').onclick=()=>modal.classList.remove('open');
 document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('open')});
 modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
 $('cardParse').onclick=()=>{const text=$('cardText').value;if(/^\s*удали(?:ть)?\s+/i.test(text)){openRemoval(null,text.replace(/^\s*удали(?:ть)?\s+/i,'').trim());return}const d=EventDraft.parse(text);$('cardTitle').value=d.title;$('cardDate').value=d.date;$('cardTime').value=d.time;$('cardWarning').textContent=d.warning.join(' ');clearCopy()};
 $('cardCopyButton').onclick=async()=>{
  if(!$('cardForm').reportValidity())return;const d=draft();const text=EventDraft.format({...d,people:d.people.map(p=>p.name)});$('cardCopyBox').hidden=false;$('cardCopyText').value=text;
  try{await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>setTimeout(reject,2000))]);status('Карточка скопирована для рабочего чата. В Google Sheets пока ничего не записано.')}
  catch(_){$('cardCopyText').focus();$('cardCopyText').select();status('Скопируйте выделенный текст для рабочего чата. В Google Sheets пока ничего не записано.')}
 };
 function bridge(){
  if(frame)return;channel=crypto.randomUUID();frame=document.createElement('iframe');frame.hidden=true;frame.title='Подключение общей таблицы';frame.src=WRITE_URL+'?channel='+encodeURIComponent(channel);document.body.append(frame);
 }
 window.addEventListener('message',event=>{
  if(!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)||event.data?.channel!==channel)return;
  if(event.data.type==='department-ready'&&!peer){peer=event.source;peerOrigin=event.origin;if(pending)send();return}
  if(event.source!==peer||!pending||event.data.requestId!==pending.requestId)return;
  if(event.data.type==='department-result'){clearTimeout(pending.timer);pending=null;setBusy(false);const result=event.data.result;
   if(!result?.ok){status(result?.message||'Не удалось сохранить запись. Повторите попытку.',true);return}
   status((result.duplicate?'Это мероприятие уже есть в таблице. Повторная запись не добавлена.':'Сохранено в Google Sheets. Ожидаю появления в общем дашборде…')+' '+publicationHint,true);
   if(result.ids?.length&&localStorage.getItem(SYNC_KEY)){
    clearInterval(poll);let tries=0;poll=setInterval(async()=>{tries++;await syncEncrypted();if(result.ids.every(id=>db.events.some(e=>e.id===id))){clearInterval(poll);status('Мероприятие опубликовано и появилось в общем календаре.',true)}else if(tries>=30){clearInterval(poll);status('В Google Sheets запись сохранена. '+publicationHint+' Позже нажмите «Получить свежие данные».',true)}},10000);
   }else status('Сохранено в Google Sheets. '+publicationHint+' После публикации нажмите «Получить свежие данные».',true);
  }
 });
 function send(){if(peer&&pending)peer.postMessage({type:'department-add',channel,requestId:pending.requestId,event:pending.event},peerOrigin)}
 $('cardForm').onsubmit=e=>{
  e.preventDefault();if(!endpoint||pending)return;
  const d=draft();if(d.endDate<d.date){status('Дата окончания не может быть раньше начала.');return}if(editingId){if(editingAutoNote)d.note='Мероприятие: '+d.title+'. Начало в '+d.time+' по Москве.'+(d.note?' '+d.note:'');if(window.changeDepartmentMeeting?.(editingId,d,editingBaseline,t=>status(t,true))){$('cardForm').style.display='none';editingId=null}return}const payload=JSON.stringify(d);if(payload!==lastPayload){requestId=crypto.randomUUID();lastPayload=payload}
  try{localStorage.setItem('departmentEventAuthorV1',d.author)}catch(_){}
  setBusy(true);status('Сохраняю в общей Google-таблице…',true);
  pending={event:d,requestId,timer:setTimeout(()=>{pending=null;setBusy(false);if(!peer&&frame){frame.remove();frame=null;channel=''}status('Не удалось получить подтверждение. Проверьте связь и повторите: повторный запрос не создаст дубль.',true)},45000)};
  bridge();send();
 };
})();
