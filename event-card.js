(function(){
 'use strict';
 // Public append-only endpoint approved by Roman; author is a declared signature.
 const WRITE_URL='https://script.google.com/macros/s/AKfycby_8kebiO2KSNJjqWrR3G4tHQ1gOKdSTf15K0lUxtanI8PpWDz-gq41dHUmfsjY9RJ3/exec';
 const modal=document.createElement('div');modal.id='eventCard';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Новое мероприятие');
 modal.innerHTML=`<div class="modal-box"><div class="modal-head"><h3>Новое мероприятие</h3><button type="button" id="cardClose" aria-label="Закрыть карточку">×</button></div>
 <details><summary>Заполнить карточку из текста</summary><label>Текст мероприятия<textarea id="cardText" rows="3" placeholder="Совещание завтра в 11:30"></textarea></label><button type="button" id="cardParse">Заполнить карточку</button><p class="muted">Проверьте дату и время. Участников выберите ниже.</p></details>
 <form id="cardForm" class="form-grid"><label class="full">Название<input id="cardTitle" maxlength="300" required placeholder="Например: получение временных пропусков"></label><label>Дата<input id="cardDate" type="date" required></label><label>Время (Москва)<input id="cardTime" type="time" required></label><fieldset class="full" id="cardPeople"><legend>Участники</legend></fieldset><label class="full">Комментарий<textarea id="cardNote" maxlength="2000" rows="2" placeholder="Необязательно"></textarea></label><p id="cardWarning" class="full muted"></p>
 <label class="full">Кто внёс<select id="cardAuthor" required><option value="">Выберите автора</option><option value="roman">Роман П.</option><option value="pavel">Павел Х.</option><option value="julia">Юлия Г.</option></select></label>
 <button class="primary full" type="submit" id="cardSubmit">Добавить в общий календарь</button></form><p id="cardStatus" role="status" aria-live="polite"></p>
 <details id="cardCopy"><summary>Передать карточку через чат</summary><button type="button" id="cardCopyButton">Подготовить текст для чата</button><label id="cardCopyBox" hidden>Текст для чата<textarea id="cardCopyText" rows="6" readonly></textarea></label></details></div>`;
 document.body.append(modal);const $=id=>document.getElementById(id);let peer=null,peerOrigin='',channel='',frame=null,pending=null,lastPayload='',requestId='',poll=null;
 const status=t=>{$('cardStatus').textContent=t};
 const endpoint=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(WRITE_URL);
 function clearCopy(){$('cardCopyBox').hidden=true}
 $('cardForm').addEventListener('input',clearCopy);
 function draft(){return {title:$('cardTitle').value.trim(),date:$('cardDate').value,time:$('cardTime').value,people:[...$('cardPeople').querySelectorAll('input:checked')].map(x=>({id:x.value,name:x.dataset.name})),note:$('cardNote').value.trim(),author:$('cardAuthor').value}}
 function open(){
  const selected=new Set([...$('cardPeople').querySelectorAll('input:checked')].map(x=>x.value));
  const field=$('cardPeople');field.replaceChildren();const legend=document.createElement('legend');legend.textContent='Участники';field.append(legend);
  for(const p of db.people){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=p.id;box.dataset.name=p.short;box.checked=selected.has(p.id);label.append(box,document.createTextNode(p.short));field.append(label)}
  if(!$('cardDate').value)$('cardDate').value=EventDraft.moscowToday();
  $('cardSubmit').disabled=!endpoint||!!pending;
  if(!endpoint)status('Карточка готова. Прямое сохранение в Google Sheets ещё подключается. Сейчас её можно передать через чат.');
  modal.classList.add('open');$('cardTitle').focus();
 }
 window.openEventCard=open;
 $('cardClose').onclick=()=>modal.classList.remove('open');
 document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('open')});
 modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
 $('cardParse').onclick=()=>{const d=EventDraft.parse($('cardText').value);$('cardTitle').value=d.title;$('cardDate').value=d.date;$('cardTime').value=d.time;$('cardWarning').textContent=d.warning.join(' ');clearCopy()};
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
  if(event.data.type==='department-result'){clearTimeout(pending.timer);pending=null;$('cardSubmit').disabled=false;const result=event.data.result;
   if(!result?.ok){status(result?.message||'Не удалось сохранить запись. Повторите попытку.');return}
   status(result.duplicate?'Это мероприятие уже есть в таблице. Повторная запись не добавлена.':'Сохранено в Google Sheets. Ожидаю появления в общем дашборде…');
   if(result.ids?.length&&localStorage.getItem(SYNC_KEY)){
    clearInterval(poll);let tries=0;poll=setInterval(async()=>{tries++;await syncEncrypted();if(result.ids.every(id=>db.events.some(e=>e.id===id))){clearInterval(poll);status('Мероприятие опубликовано и появилось в общем календаре.')}else if(tries>=30){clearInterval(poll);status('В Google Sheets запись сохранена. Публикация задерживается; позже нажмите «Получить свежие данные».')}},10000);
   }else status('Сохранено в Google Sheets. После автоматической синхронизации нажмите «Получить свежие данные».');
  }
 });
 function send(){if(peer&&pending)peer.postMessage({type:'department-add',channel,requestId:pending.requestId,event:pending.event},peerOrigin)}
 $('cardForm').onsubmit=e=>{
  e.preventDefault();if(!endpoint||pending)return;
  const d=draft(),payload=JSON.stringify(d);if(payload!==lastPayload){requestId=crypto.randomUUID();lastPayload=payload}
  $('cardSubmit').disabled=true;status('Сохраняю в общей Google-таблице…');
  pending={event:d,requestId,timer:setTimeout(()=>{pending=null;$('cardSubmit').disabled=false;status('Не удалось получить подтверждение. Проверьте связь и повторите: повторный запрос не создаст дубль.')},45000)};
  bridge();send();
 };
})();
