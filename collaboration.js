(function(){
 'use strict';
 const STORE='departmentChangesV1',AUTHOR='departmentEditorV1';
 const fields={people:['short','full','role','category','birthdate'],events:['personId','type','start','end','days','status','basis','comment','linkedEvent'],tasks:['personId','title','description','created','deadline','priority','status','completed','author','comment','controlled'],birthdays:['name','date','affiliation']};
 const names={people:'Сотрудники',events:'События',tasks:'Задачи',birthdays:'Дни рождения'};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const clean=(kind,x)=>x?Object.fromEntries(fields[kind].map(k=>[k,k==='controlled'?!!x[k]:String(x[k]??'')])):null;
 // Compare the user's intended fields, not unrelated edits made meanwhile.
 function alreadyApplied(op,remote){const current=clean(op.collection,remote);if(!current||!op.after)return false;return fields[op.collection].filter(k=>!op.before||op.before[k]!==op.after[k]).every(k=>current[k]===op.after[k])}
 let conflictRemote=null;
 let store;try{store=JSON.parse(localStorage.getItem(STORE))}catch(_){}
 store=store||{operations:[],requestId:null};let previous=clone(db),pulling=false,lastPullAt=0,busy=false,unknown=!!store.requestId,peer=null,origin='',channel='',frame=null,timer=null,capable=false;
 const card=document.createElement('div');card.className='card shared-data';card.innerHTML='<h3>Общие изменения отдела</h3><p>Любой участник может редактировать записи. Выбранное имя — подпись автора, а не проверка Google-аккаунта.</p><label class="shared-author">Кто вносит изменения<select id="departmentEditor"><option value="">Выберите имя</option>'+db.people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.short||p.full)+'</option>').join('')+'</select></label><details class="manual-sync-tools"><summary>Ручные действия и резервная копия</summary><div class="toolbar"><button id="uploadChanges" class="primary">Загрузить изменения в Google Таблицу</button><button id="checkChanges">Проверить отправку</button><button id="syncDepartment">Синхронизировать</button><button id="downloadChanges">Сохранить изменения в файл</button></div></details><p id="changeStatus" role="status" aria-live="polite"></p><details><summary>Редактировать общие записи</summary><div class="shared-record-fields"><label>Раздел<select id="editKind">'+Object.entries(names).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label>Запись<select id="editRecord"></select></label><button id="editSelected">Открыть запись</button><button id="newSharedRecord">Новая запись</button></div></details>';
 const advanced=document.createElement('details');advanced.className='exchange-advanced';advanced.innerHTML='<summary>Дополнительные инструменты</summary>';advanced.append(card);document.querySelector('#data').append(advanced);
 let removalFeedback=null;
 const $=id=>document.getElementById(id),setStatus=t=>{$('changeStatus').textContent=t;if(removalFeedback)removalFeedback(t);window.dispatchEvent(new CustomEvent('department-sync-state',{detail:{message:t,retry:unknown||!!store.autoPaused,conflict:!!store.autoPaused&&!!store.operations.length,active:busy||unknown||!!store.operations.length||waitingPublication()}}))};
 const resolve=document.createElement('button');resolve.textContent='Принять общую версию';resolve.hidden=true;card.append(resolve);resolve.onclick=()=>window.acceptDepartmentVersion();
 $('departmentEditor').value=localStorage.getItem(AUTHOR)||'';
 $('departmentEditor').onchange=()=>{localStorage.setItem(AUTHOR,$('departmentEditor').value);update()};
 function update(){
  resolve.hidden=!store.autoPaused||!store.operations.length;resolve.disabled=busy||pulling||unknown;
  $('uploadChanges').disabled=busy||pulling||unknown||!store.operations.length||!$('departmentEditor').value;
  $('downloadChanges').disabled=busy||!store.operations.length;
  $('checkChanges').disabled=busy||!store.requestId;
  $('syncNowBtn').disabled=busy||pulling||unknown;
  $('syncDepartment').disabled=busy||pulling||unknown;
  $('editSelected').disabled=busy||pulling||unknown;$('newSharedRecord').disabled=busy||pulling||unknown;
 }
 function persist(){localStorage.setItem(STORE,JSON.stringify(store));update()}
 function capture(){
  let changed=false;
  for(const kind of Object.keys(fields)){
   const old=new Map((previous[kind]||[]).map(x=>[x.id,x])),now=new Map((db[kind]||[]).map(x=>[x.id,x]));
   for(const id of new Set([...old.keys(),...now.keys()])){
    const before=clean(kind,old.get(id)),after=clean(kind,now.get(id));
    if(JSON.stringify(before)===JSON.stringify(after))continue;
    changed=true;
    const author=$('departmentEditor').value;
    if(!author){db=clone(previous);alert('Выберите «Кто вносит изменения» во вкладке «Импорт / экспорт». Изменение пока не сохранено.');return false}
    let op=store.operations.find(x=>x.collection===kind&&x.id===id);
    if(!op){op={collection:kind,id,before,after,author};store.operations.push(op)}else{op.after=after;op.author=author}
    if(JSON.stringify(op.before)===JSON.stringify(op.after))store.operations=store.operations.filter(x=>x!==op);
    if(now.get(id)){now.get(id).enteredBy='Указал автор: '+(person(author)?.short||author);now.get(id).modifiedAt=new Date().toISOString()}
   }
  }
  if(changed){store.requestId=null;store.autoPaused=false;setStatus('Сохраняю изменения автоматически…')}
  persist();previous=clone(db);if(changed)setTimeout(()=>autoTick(true),500);return true;
 }
 const saveOriginal=save;
 save=function(){if(busy||pulling||unknown){db=clone(previous);alert('Дождитесь подтверждения отправки изменений.');return}if(capture())saveOriginal();else{localStorage.setItem(KEY,JSON.stringify(db));renderAll()}};
 const syncOriginal=syncEncrypted;
 function waitingPublication(){return !!(store.awaitingPublished?.length||store.receipts?.length)}
 syncEncrypted=async function(){
  if(busy||pulling||unknown||(store.operations.length&&!store.autoPaused))return false;
  pulling=true;update();let published=null;
  try{
   const ok=await syncOriginal({apply:(incoming,actual)=>{published=actual;db=incoming;saveOriginal()}});
   lastPullAt=Date.now();if(!ok||!published){if(waitingPublication())setStatus('В таблице сохранено. Свежий снимок пока недоступен; повторяю получение автоматически.');return false}
   const hadPending=waitingPublication();
   const hadConflict=store.autoPaused&&!!store.operations.length;
   if(hadConflict){
    conflictRemote=clone(published);const remaining=[];
    for(const op of store.operations){
     const remote=(published[op.collection]||[]).find(x=>x.id===op.id);
     if(alreadyApplied(op,remote))continue;
     remaining.push(op);const list=db[op.collection],at=list.findIndex(x=>x.id===op.id),local=(previous[op.collection]||[]).find(x=>x.id===op.id);
     if(local){if(at>=0)list[at]=clone(local);else list.push(clone(local))}
    }
    store.operations=remaining;if(!remaining.length){store.autoPaused=false;store.requestId=null;conflictRemote=null}
   }
   if(store.awaitingPublished?.length){
    const waiting=[];
    for(const op of store.awaitingPublished){
     const list=db[op.collection]||[],index=list.findIndex(x=>x.id===op.id),remote=(published[op.collection]||[]).find(x=>x.id===op.id),local=(previous[op.collection]||[]).find(x=>x.id===op.id);
     if(JSON.stringify(clean(op.collection,remote))!==JSON.stringify(op.after)){
      if(remote?.modifiedAt&&local?.modifiedAt&&remote.modifiedAt>local.modifiedAt)continue;
      waiting.push(op);if(local){if(index>=0)list[index]=clone(local);else list.push(clone(local))}
     }
    }
    store.awaitingPublished=waiting;
   }
   const ids=new Set((published.events||[]).map(e=>e.id));
   store.receipts=(store.receipts||[]).filter(receipt=>!receipt.ids.every(id=>ids.has(id)));
   persist();saveOriginal();previous=clone(db);renderRecords();
   if(hadConflict)setStatus(store.operations.length?'Свежие данные проверены. Локальные правки отличаются от общей версии. Можно принять общую версию с резервной копией правок, затем открыть мероприятие заново.':'Эти изменения уже сохранены в общей базе. Данные обновлены, повторная отправка не требуется.');
   else if(hadPending)setStatus(waitingPublication()?'Сохранено в общей таблице. Дожидаюсь публикации и подгружаю результат автоматически. Можно закрыть карточку.':'Изменения опубликованы в общем календаре. Данные обновлены автоматически.');
   return true;
  }finally{pulling=false;update()}
 };
 window.watchDepartmentEvent=function(ids,author,publication){
  if(author&&db.people.some(p=>p.id===author)){$('departmentEditor').value=author;localStorage.setItem(AUTHOR,author)}
  if(!Array.isArray(ids)||!ids.length)return;
  store.receipts=store.receipts||[];const key=[...ids].sort().join('|');
  if(!store.receipts.some(r=>[...r.ids].sort().join('|')===key))store.receipts.push({ids:[...ids],at:new Date().toISOString()});
  persist();setStatus('Мероприятие сохранено в общей таблице. '+(publication?.phase==='queued'?'Публикация GitHub запрошена.':publication&&publication.phase!=='queued'?'Ускоренный запуск пока недоступен; ожидаю фоновую публикацию.':'Ожидаю публикацию сайта.')+' Свежие данные загрузятся автоматически.');autoTick(true);
 };
 $('syncNowBtn').onclick=()=>syncEncrypted();
 $('syncNowBtn').textContent='Получить свежие данные из общей базы';
 document.querySelector('#data>.card p').textContent='Изменения отправляются автоматически. «Получить свежие данные» проверяет опубликованную версию сайта. Для добавления мероприятий используйте вкладку «Мероприятия». Дополнительные инструменты нужны для других записей и резервной копии.';
 function renderRecords(){const kind=$('editKind').value;$('editRecord').innerHTML=(db[kind]||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.type||x.title||x.short||x.name||x.full||x.id)+(x.start?' · '+esc(fmt(x.start)):'')+'</option>').join('')}
 $('editKind').onchange=renderRecords;renderRecords();
 const history=document.createElement('details');history.innerHTML='<summary>Кто внёс изменения</summary><div id="sharedChangeHistory"></div>';card.append(history);
 function renderHistory(){const rows=Object.keys(fields).flatMap(kind=>(db[kind]||[]).filter(x=>x.enteredBy).map(x=>({kind,...x}))).sort((a,b)=>String(b.modifiedAt||'').localeCompare(String(a.modifiedAt||''))).slice(0,50);$('sharedChangeHistory').innerHTML=rows.length?rows.map(x=>'<p><b>'+esc(x.type||x.title||x.short||x.name||x.id)+'</b> · '+esc(x.enteredBy)+(x.modifiedAt?' · '+esc(new Date(x.modifiedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))+' МСК':'')+'</p>').join(''):'Авторов для этих записей ещё нет.'}
 const oldRenderAll=renderAll;renderAll=function(){oldRenderAll();renderHistory()};renderHistory();
 const modal=document.createElement('div');modal.className='modal';modal.id='sharedEditor';modal.innerHTML='<div class="modal-box"><h3 id="sharedEditorTitle"></h3><form id="sharedEditForm" class="form-grid"></form><button id="closeSharedEditor">Закрыть</button></div>';document.body.append(modal);
 const labels={short:'Краткое имя',full:'ФИО',role:'Должность',category:'Категория',birthdate:'Дата рождения',personId:'Сотрудник',type:'Тип / название',start:'Начало',end:'Окончание',days:'Количество дней',status:'Статус',basis:'Основание / время',comment:'Комментарий',linkedEvent:'Общее мероприятие (ID)',title:'Задача',description:'Описание',created:'Дата постановки',deadline:'Срок',priority:'Приоритет',completed:'Дата выполнения',author:'Постановщик',controlled:'На контроле',name:'Имя',date:'Дата рождения',affiliation:'Принадлежность'};
 $('newSharedRecord').onclick=()=>openRecord(true);
 $('editSelected').onclick=()=>openRecord(false);
 function openRecord(isNew){
  const kind=$('editKind').value,id=isNew?uid('SHARED'):$('editRecord').value,item=isNew?{id,status:kind==='tasks'?'Новая':'План',created:todayISO(),affiliation:'Наш отдел'}:(db[kind]||[]).find(x=>x.id===id);if(!item)return;
  $('sharedEditorTitle').textContent=names[kind]+' · '+(item.type||item.title||item.short||item.name||id);
  const form=$('sharedEditForm');form.replaceChildren();
  fields[kind].forEach(k=>{const label=document.createElement('label');label.textContent=labels[k]||k;let input;
   if(k==='personId'){input=document.createElement('select');input.innerHTML='<option value="">Не указан</option>'+db.people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.short)+'</option>').join('')}
   else{input=document.createElement(['description','comment'].includes(k)?'textarea':'input');if(input.tagName==='INPUT')input.type=k==='controlled'?'checkbox':['start','end','birthdate','date','created','deadline','completed'].includes(k)?'date':k==='days'?'number':'text'}
   input.name=k;if(k==='controlled')input.checked=!!item[k];else input.value=item[k]??'';label.append(input);form.append(label)});
  const button=document.createElement('button');button.type='submit';button.className='primary';button.textContent='Сохранить в общей таблице';form.append(button);
  form.onsubmit=e=>{e.preventDefault();if(busy||pulling||unknown){setStatus('Дождитесь завершения текущего обмена данными.');return}if(isNew){db[kind]??=[];db[kind].push(item)}for(const k of fields[kind])item[k]=k==='controlled'?form.elements[k].checked:form.elements[k].value;save();modal.classList.remove('open');renderRecords()};modal.classList.add('open');
 };
 window.changeDepartmentMeeting=function(id,input,baseline,feedback){
  if(busy||pulling||unknown){feedback('Дождитесь завершения текущего обмена данными и повторите действие.');return false}
  if(store.operations.length){feedback('Дождитесь автоматической отправки предыдущих изменений.');return false}
  if(!db.people.some(p=>p.id===input.author)){feedback('Выберите автора изменения.');return false}
  const rows=meetingRowsForRemoval(id);
  if(rows.length!==baseline.length||rows.some(r=>!baseline.some(b=>b.id===r.id&&JSON.stringify(clean('events',b))===JSON.stringify(clean('events',r))))){feedback('Мероприятие обновилось. Закройте карточку, получите свежие данные и откройте его снова.');return false}
  const planned=planMeetingEdit(rows,input,()=>uid('MEETING'));
  $('departmentEditor').value=input.author;localStorage.setItem(AUTHOR,input.author);removalFeedback=feedback;
  planned.forEach(item=>{const at=db.events.findIndex(e=>e.id===item.id);if(at>=0)db.events[at]=item;else db.events.push(item)});
  save();renderRecords();
  if(!store.operations.length){feedback('Изменений нет.');return true}
  store.autoPull=true;persist();$('uploadChanges').click();return true;
 };
 window.removeDepartmentMeeting=function(id,author,feedback){
  if(busy||pulling||unknown){feedback('Дождитесь завершения текущего обмена данными и повторите действие.');return false}
  if(store.operations.length){feedback('Дождитесь автоматической отправки предыдущих изменений.');return false}
  if(!db.people.some(p=>p.id===author)){feedback('Выберите автора удаления.');return false}
  const target=db.events.find(e=>e.id===id&&isMeetingEvent(e));
  if(!target){feedback('Мероприятие не найдено. Получите свежие данные.');return false}
  const rows=meetingRowsForRemoval(id);
  if(!rows.length){feedback('Мероприятие уже удалено из календаря.');return false}
  $('departmentEditor').value=author;localStorage.setItem(AUTHOR,author);removalFeedback=feedback;
  rows.forEach(e=>e.status='Отменена');save();renderRecords();
  store.autoPull=true;persist();$('uploadChanges').click();return true;
 };
 $('syncDepartment').onclick=()=>{if(store.operations.length){store.autoPull=true;persist();$('uploadChanges').click()}else syncEncrypted()};
 $('closeSharedEditor').onclick=()=>modal.classList.remove('open');
 $('downloadChanges').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,operations:store.operations},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='изменения-отдела-'+todayISO()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 function resetBridge(){if(frame)frame.remove();frame=null;peer=null;origin='';channel=''}
 function send(type,payload={}){if(peer)peer.postMessage({type,channel,...payload},origin)}
 function connect(){if(frame)return;const match=document.querySelector('script[src^="event-card.js"]');if(!match)return;channel=crypto.randomUUID();frame=document.createElement('iframe');frame.hidden=true;frame.title='Обмен изменениями отдела';frame.src='https://script.google.com/macros/s/AKfycby_8kebiO2KSNJjqWrR3G4tHQ1gOKdSTf15K0lUxtanI8PpWDz-gq41dHUmfsjY9RJ3/exec?channel='+channel;document.body.append(frame)}
 $('checkChanges').onclick=()=>{if(busy||pulling||!store.requestId)return;busy=true;update();setStatus('Проверяю результат предыдущей отправки…');connect();send('department-change-status',{requestId:store.requestId});clearTimeout(timer);timer=setTimeout(()=>{busy=false;resetBridge();unknown=true;setStatus('Сверка пока недоступна. Повторная отправка заблокирована, локальные правки сохранены.');update()},45000)};
 $('uploadChanges').onclick=()=>{
  if(busy||pulling||unknown||!store.operations.length)return;
  if(store.operations.some(x=>!x.after)){store.autoPaused=true;persist();setStatus('Есть локальное удаление. Оно сохранено в файле изменений; массовое удаление в общую базу сейчас не отправляется.');return}
  busy=true;update();setStatus('Сохраняю изменения в общей таблице…');clearTimeout(timer);connect();send('department-capabilities');
  timer=setTimeout(()=>{busy=false;resetBridge();if(store.requestId){unknown=true;setStatus('Ответ таблицы задержался. Проверяю результат автоматически; повторную запись не создаю.')}else setStatus('Связь с таблицей пока недоступна. Изменения сохранены на устройстве; отправлю автоматически после восстановления связи.');update()},45000);
 };
 window.addEventListener('message',e=>{
  if(!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)||e.data?.channel!==channel)return;
  if(e.data.type==='department-ready'&&!peer){peer=e.source;origin=e.origin;if(busy){if(unknown&&store.requestId)send('department-change-status',{requestId:store.requestId});else send('department-capabilities')}return}
  if(e.source!==peer)return;
  if(e.data.type==='department-capabilities-result'&&busy){capable=e.data.result?.version>=2;if(!capable){clearTimeout(timer);busy=false;setStatus('Требуется обновление сервиса общей записи. Локальные правки сохранены.');update();return}store.requestId=store.requestId||crypto.randomUUID();persist();setStatus('Загружаю изменения в Google Таблицу…');send('department-changes',{requestId:store.requestId,operations:store.operations});return}
  if(e.data.type!=='department-changes-result'||e.data.requestId!==store.requestId)return;
  clearTimeout(timer);busy=false;unknown=false;
  if(!e.data.result?.ok){if(e.data.result?.phase==='unknown'){unknown=true;setStatus(e.data.result.message);persist();return}store.autoPaused=e.data.result?.phase!=='not_found';store.requestId=null;setStatus(e.data.result?.message||'Таблица не подтвердила запись. Ваши изменения сохранены на устройстве.');persist();return}
  const waiting=new Map([...(store.awaitingPublished||[]),...store.operations].map(op=>[op.collection+':'+op.id,op]));
  store={operations:[],requestId:null,awaitingPublished:[...waiting.values()],receipts:store.receipts||[]};previous=clone(db);persist();
  setStatus('Сохранено в общей таблице. '+(e.data.result.publication?.phase==='queued'?'Публикация GitHub запрошена. ':e.data.result.publication?'Ускоренный запуск пока недоступен; ожидаю фоновую публикацию. ':'')+'Получаю обновления автоматически. Можно закрыть карточку.');setTimeout(()=>autoTick(true),0);
 });
 async function autoTick(force=false){
  if(document.hidden||navigator.onLine===false||busy||pulling)return;
  if(unknown){$('checkChanges').click();return}
  if(store.operations.length){if(store.autoPaused){if(localStorage.getItem(SYNC_KEY)&&(force||Date.now()-lastPullAt>=60000))await syncEncrypted()}else if($('departmentEditor').value)$('uploadChanges').click();return}
  if(localStorage.getItem(SYNC_KEY)&&(force||waitingPublication()||Date.now()-lastPullAt>=60000))await syncEncrypted();
 }
 window.retryDepartmentSync=function(){if(unknown){$('checkChanges').click();return}if(store.autoPaused){syncEncrypted();return}autoTick(true)};
 window.acceptDepartmentVersion=async function(){
  if(!store.autoPaused||busy||pulling||unknown)return;
  if(!await syncEncrypted()||!store.operations.length||!conflictRemote)return;
  if(!confirm('Принять общую версию вместо несохранённых локальных правок? Резервная копия правок останется на этом устройстве.'))return;
  try{localStorage.setItem('departmentConflictBackupV1',JSON.stringify({at:new Date().toISOString(),db,changes:store}))}catch(_){setStatus('Не удалось сохранить резерв. Локальные правки оставлены без изменений.');return}
  for(const op of store.operations){const list=db[op.collection],at=list.findIndex(x=>x.id===op.id),remote=(conflictRemote[op.collection]||[]).find(x=>x.id===op.id);if(remote){if(at>=0)list[at]=clone(remote);else list.push(clone(remote))}else if(at>=0)list.splice(at,1)}
  store.operations=[];store.requestId=null;store.autoPaused=false;conflictRemote=null;persist();saveOriginal();previous=clone(db);renderRecords();setStatus('Загружена общая версия. Резерв локальных правок сохранён на устройстве. Теперь можно открыть мероприятие и изменить его заново.');
 };
 window.addEventListener('online',()=>autoTick(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoTick(true)});
 window.addEventListener('focus',()=>autoTick(true));
 setInterval(()=>autoTick(),15000);setTimeout(()=>autoTick(true),700);
 setStatus(unknown?'Проверяю результат предыдущей отправки автоматически.':store.operations.length?'Продолжаю автоматическую отправку сохранённых изменений.':waitingPublication()?'Продолжаю проверку публикации и автоматическое обновление данных.':'Автоматический обмен включён. Новых локальных изменений нет.');update();
})();
