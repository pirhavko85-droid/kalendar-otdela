(function(){
 'use strict';
 window.departmentNativeMeetings=true;
 // Public append-only endpoint approved by Roman; author is a declared signature.
 const WRITE_URL='https://script.google.com/macros/s/AKfycby_8kebiO2KSNJjqWrR3G4tHQ1gOKdSTf15K0lUxtanI8PpWDz-gq41dHUmfsjY9RJ3/exec';
 const modal=document.createElement('div');modal.id='eventCard';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Новое мероприятие');
 modal.innerHTML=`<div class="modal-box"><div class="modal-head"><h3>Новое мероприятие</h3><button type="button" id="cardClose" aria-label="Закрыть карточку">×</button></div>
 <details id="cardParsePanel"><summary>Заполнить карточку из текста</summary><label>Текст мероприятия<textarea id="cardText" rows="3" placeholder="Совещание завтра в 11:30"></textarea></label><button type="button" id="cardParse">Заполнить карточку</button><p class="muted">Проверьте дату и время. Участников выберите ниже.</p></details>
 <details id="cardDeletePanel"><summary>Удалить / изменить мероприятие по названию</summary><label>Кто вносит изменения<select id="cardDeleteAuthor"></select></label><label>Найти мероприятие<input id="cardDeleteSearch" placeholder="Например: Тест" autocomplete="off"></label><p class="muted">Выберите запись и действие: изменить её поля или удалить из календаря. Изменения станут общими после публикации. Удалённая запись сохраняется в таблице как отменённая для восстановления.</p><div id="cardDeleteResults"></div></details>
 <form id="cardForm" class="form-grid"><label class="full">Кто внёс<select id="cardAuthor" required><option value="">Выберите автора</option><option value="roman">Роман П.</option><option value="pavel">Павел Х.</option><option value="julia">Юлия Г.</option></select></label><label class="full">Название<input id="cardTitle" maxlength="300" required placeholder="Например: получение временных пропусков"></label><label>Дата<input id="cardDate" type="date" required></label><label>Дата окончания<input id="cardEndDate" type="date"></label><label>Время (Москва)<input id="cardTime" type="time" required></label><fieldset class="full" id="cardPeople"><legend>Участники</legend></fieldset><label class="full">Комментарий<textarea id="cardNote" maxlength="2000" rows="2" placeholder="Необязательно"></textarea></label><p id="cardWarning" class="full muted"></p>

 <button class="primary full" type="submit" id="cardSubmit">Добавить в общий календарь</button></form><p id="cardStatus" role="status" aria-live="polite"></p>
 <details id="cardCopy"><summary>Передать карточку через чат</summary><button type="button" id="cardCopyButton">Подготовить текст для чата</button><label id="cardCopyBox" hidden>Текст для чата<textarea id="cardCopyText" rows="6" readonly></textarea></label></details></div>`;
 document.body.append(modal);const $=id=>document.getElementById(id);let pending=null,lastPayload='',requestId='',editingId=null,editingBaseline=[],editingAutoNote=false;
 const notice=document.createElement('p');notice.id='eventSaveNotice';notice.className='card';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;document.getElementById('eventsTable').before(notice);
 const status=(t,showOutside=false)=>{$('cardStatus').textContent=t;if(showOutside){notice.textContent=t;notice.hidden=false}if(modal.classList.contains('open'))$('cardStatus').scrollIntoView({block:'nearest'})};
 const retry=document.createElement('button');retry.id='eventRetrySync';retry.type='button';retry.textContent='Повторить проверку';retry.hidden=true;notice.after(retry);retry.onclick=()=>window.retryDepartmentSync?.();
 const accept=document.createElement('button');accept.id='eventAcceptShared';accept.type='button';accept.textContent='Принять общую версию';accept.hidden=true;retry.after(accept);accept.onclick=()=>window.acceptDepartmentVersion?.();
 window.addEventListener('department-sync-state',e=>{if(e.detail.active||!notice.hidden){notice.textContent=e.detail.message;notice.hidden=false};retry.hidden=!e.detail.retry;accept.hidden=!e.detail.conflict;retry.textContent=e.detail.conflict?'Проверить свежие данные':'Повторить проверку'});
 const publicationHint='По расписанию: проверки каждые 5 минут круглосуточно, включая выходные. Запуск может задерживаться. Повторно добавлять мероприятие не нужно.';
 function setBusy(active){$('cardForm').querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false)}
 const endpoint=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(WRITE_URL);
 function clearCopy(){$('cardCopyBox').hidden=true}
 $('cardForm').addEventListener('input',clearCopy);
 function draft(){return {title:$('cardTitle').value.trim(),date:$('cardDate').value,endDate:$('cardEndDate').value||$('cardDate').value,time:$('cardTime').value,people:[...$('cardPeople').querySelectorAll('input:checked')].map(x=>({id:x.value,name:x.dataset.name})),note:$('cardNote').value.trim(),author:$('cardAuthor').value}}
 function open(){
  if(pending&&!archivePending())return;
  setBusy(false);$('cardForm').reset();$('cardTitle').value='';$('cardDate').value=EventDraft.moscowToday();$('cardEndDate').value='';$('cardTime').value='';$('cardNote').value='';$('cardWarning').textContent='После нажатия откроется страница Google Sheets с результатом сохранения.';$('cardStatus').textContent='';lastPayload='';requestId='';clearCopy();
  if(editingId){$('cardTitle').value='';$('cardDate').value=EventDraft.moscowToday();$('cardEndDate').value='';$('cardTime').value='';$('cardNote').value='';$('cardPeople').querySelectorAll('input').forEach(box=>box.checked=false)}
  editingAutoNote=false;editingId=null;editingBaseline=[];$('cardSubmit').textContent='Добавить в общий календарь';
  modal.setAttribute('aria-label','Новое мероприятие');$('cardCopy').hidden=false;modal.querySelector('h3').textContent='Новое мероприятие';$('cardForm').style.display='';$('cardParsePanel').hidden=false;$('cardDeletePanel').open=false;
  renderUnconfirmedDrafts();
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
 window.changeDepartmentMeeting=function(id,input,baseline,feedback){
  if(!db.people.some(p=>p.id===input.author)){feedback('Выберите автора изменения.');return false}
  const rows=meetingRowsForRemoval(id);
  if(rows.length!==baseline.length||rows.some(r=>!baseline.some(b=>b.id===r.id&&JSON.stringify(MeetingActions.record(b))===JSON.stringify(MeetingActions.record(r))))){feedback('Мероприятие изменилось. Откройте свежую карточку.');return false}
  const operations=MeetingActions.edit(rows,input,()=>uid('MEETING'));
  if(!operations.length){feedback('Изменений нет.');return true}
  return sendRequest({action:'edit',operations,label:input.title,requestId:crypto.randomUUID()});
 };
 window.removeDepartmentMeeting=function(id,author,feedback){
  if(!db.people.some(p=>p.id===author)){feedback('Выберите автора удаления.');return false}
  const rows=meetingRowsForRemoval(id);if(!rows.length){feedback('Мероприятие уже удалено.');return false}
  return sendRequest({action:'cancel',operations:MeetingActions.cancel(rows,author),label:rows[0].type,requestId:crypto.randomUUID()});
 };
 function renderRemovalResults(){
  const q=$('cardDeleteSearch').value.trim().toLowerCase();
  const groups=groupedMeetingEvents(db.events.filter(isMeetingEvent)).filter(e=>!q||(e.type+' '+fmt(e.start)+' '+eventTime(e)).toLowerCase().includes(q)).sort((a,b)=>b.start.localeCompare(a.start));
  const host=$('cardDeleteResults');host.replaceChildren();
  if(!groups.length){host.textContent='Мероприятий не найдено.';return}
  for(const e of groups.slice(0,30)){
   const row=document.createElement('div');row.className='event-delete-result';const label=document.createElement('span'),title=document.createElement('b'),dates=document.createElement('small');title.textContent=e.type;dates.textContent=fmt(e.start)+(e.end&&e.end!==e.start?' — '+fmt(e.end):'')+' · '+(eventTime(e)||'без времени');label.append(title,dates);
   const button=document.createElement('button');button.type='button';button.className='event-remove';button.textContent='Удалить';button.onclick=()=>{
    const author=$('cardDeleteAuthor').value;if(!author){status('Выберите, кто удаляет мероприятие.',true);return}
    if(button.dataset.confirm!=='yes'){
     button.dataset.confirm='yes';button.textContent='Подтвердить удаление';
     const undo=document.createElement('button');undo.type='button';undo.textContent='Отмена';undo.onclick=()=>{button.dataset.confirm='';button.textContent='Удалить';undo.remove()};actions.append(undo);
     status('Удалить «'+e.type+'» · '+dates.textContent+' для всех участников? Подтвердите удаление рядом с записью.');return;
    }
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

 $('cardClose').onclick=()=>{if(pending&&!archivePending())return;modal.classList.remove('open')};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('open')});
 modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
 $('cardParse').onclick=()=>{const text=$('cardText').value;if(/^\s*удали(?:ть)?\s+/i.test(text)){openRemoval(null,text.replace(/^\s*удали(?:ть)?\s+/i,'').trim());return}const d=EventDraft.parse(text);$('cardTitle').value=d.title;$('cardDate').value=d.date;$('cardTime').value=d.time;$('cardWarning').textContent=d.warning.join(' ');clearCopy()};
 $('cardCopyButton').onclick=async()=>{
  if(!$('cardForm').reportValidity())return;const d=draft();const text=EventDraft.format({...d,people:d.people.map(p=>p.name)});$('cardCopyBox').hidden=false;$('cardCopyText').value=text;
  try{await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>setTimeout(reject,2000))]);status('Карточка скопирована для рабочего чата. В Google Sheets пока ничего не записано.')}
  catch(_){$('cardCopyText').focus();$('cardCopyText').select();status('Скопируйте выделенный текст для рабочего чата. В Google Sheets пока ничего не записано.')}
 };
 const draftsPanel=document.createElement('details');draftsPanel.id='cardDrafts';$('cardForm').before(draftsPanel);
 function renderUnconfirmedDrafts(){
  draftsPanel.replaceChildren();let drafts=[];try{drafts=JSON.parse(localStorage.getItem('departmentUnconfirmedEventsV1')||'[]')}catch(_){}draftsPanel.hidden=!drafts.length;
  const heading=document.createElement('summary');heading.textContent='Неподтверждённые черновики ('+drafts.length+')';draftsPanel.append(heading);
  for(const d of drafts){const text=document.createElement('p');text.textContent=(d.action==='cancel'?'Удаление: ':d.action==='edit'?'Изменение: ':'')+(d.event?.title||d.label||'Мероприятие')+' · '+(d.event?.date||d.operations?.[0]?.after?.start||'')+' '+(d.event?.time||d.operations?.[0]?.after?.basis||'');const button=document.createElement('button');button.type='button';button.textContent='Отправить через страницу подтверждения';button.onclick=()=>sendRequest(d);draftsPanel.append(text,button)}
 }
 function disconnectPending(){pending=null;setBusy(false)}
 function archivePending(){
  if(!pending)return true;
  try{const drafts=JSON.parse(localStorage.getItem('departmentUnconfirmedEventsV1')||'[]');if(!drafts.some(d=>d.requestId===pending.requestId))drafts.push({...pending,savedAt:new Date().toISOString()});localStorage.setItem('departmentUnconfirmedEventsV1',JSON.stringify(drafts));localStorage.removeItem('departmentPendingEventV1')}catch(_){status('Не удалось сохранить черновик. Скопируйте карточку через чат.');return false}
  disconnectPending();renderUnconfirmedDrafts();return true;
 }
 function sendDirect(event,id){return sendRequest({action:'add',event,requestId:id,label:event.title})}
 function sendRequest(request){
  // Preserve the exact request before navigating: retries use this ID.
  pending=request;if(!archivePending())return false;
  const form=document.createElement('form');form.method='post';form.action=WRITE_URL;form.target='_self';form.rel='noopener';form.hidden=true;
  const input=document.createElement('input');input.type='hidden';input.name='payload';input.value=JSON.stringify(request);form.append(input);document.body.append(form);
  try{form.submit();status('Открывается страница подтверждения Google Sheets. Дождитесь на ней результата. Карточка сохранена в черновиках до появления записи в общем календаре.',true)}catch(_){status('Не удалось открыть страницу отправки. Карточка сохранена в черновиках; повторите отправку оттуда.',true)}finally{form.remove();setBusy(false)}return true;
 }
 // Reload never turns an unconfirmed request into a permanent form lock.
 try{const saved=JSON.parse(localStorage.getItem('departmentPendingEventV1'));if((saved?.event||saved?.operations)&&/^[a-f0-9-]{36}$/i.test(saved.requestId||'')){pending=saved;archivePending()}}catch(_){}
 setBusy(false);
 window.addEventListener('pageshow',()=>{if(pending)archivePending();setBusy(false)});
 window.addEventListener('department-published-snapshot',e=>{
  const rows=e.detail?.events;if(!Array.isArray(rows))return;
  const published=d=>MeetingActions.isPublished(d,rows);
  if(pending&&published(pending)){localStorage.removeItem('departmentPendingEventV1');disconnectPending();status('Запись уже опубликована в общем календаре. Можно создать новое мероприятие.',true)}
  try{const drafts=JSON.parse(localStorage.getItem('departmentUnconfirmedEventsV1')||'[]');localStorage.setItem('departmentUnconfirmedEventsV1',JSON.stringify(drafts.filter(d=>!published(d))));renderUnconfirmedDrafts()}catch(_){}
 });
 $('cardForm').onsubmit=e=>{
  e.preventDefault();if(!endpoint||pending)return;
  const d=draft();if(d.endDate<d.date){status('Дата окончания не может быть раньше начала.');return}if(editingId){if(editingAutoNote)d.note='Мероприятие: '+d.title+'. Начало в '+d.time+' по Москве.'+(d.note?' '+d.note:'');if(window.changeDepartmentMeeting?.(editingId,d,editingBaseline,t=>status(t,true))){$('cardForm').style.display='none';editingId=null}return}const payload=JSON.stringify(d);if(payload!==lastPayload){requestId=crypto.randomUUID();lastPayload=payload}
  try{localStorage.setItem('departmentEventAuthorV1',d.author)}catch(_){}
  sendDirect(d,requestId);
 };
})();
