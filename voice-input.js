(function(){
 'use strict';
 const modal=document.createElement('div');modal.className='modal';modal.id='voiceModal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Голосовой черновик мероприятия');
 modal.innerHTML=`<div class="modal-box"><div class="modal-head"><h3>Голосовой черновик мероприятия</h3><button type="button" id="voiceClose" aria-label="Закрыть голосовой ввод">×</button></div>
 <p>Пробная версия. Запись в общую таблицу пока выполняется через чат. Эта карточка ничего не публикует.</p>
 <p class="muted">Whisper распознаёт русский язык на устройстве. При первом запуске потребуется загрузить модель — десятки мегабайт. Аудио на сервер не отправляется. Запись — до 45 секунд.</p>
 <div class="toolbar"><button type="button" id="voiceLoad">Подготовить микрофон</button><button type="button" id="voiceStart" disabled>🎤 Начать запись</button><button type="button" id="voiceStop" disabled>Остановить</button></div>
 <p id="voiceStatus" role="status" aria-live="polite">Можно также ввести текст вручную.</p>
 <label>Распознанный текст<textarea id="voiceText" rows="3" placeholder="Добавь совещание завтра в 11:00. Участники: Павел, Роман."></textarea></label>
 <button type="button" id="voiceParse">Заполнить карточку из текста</button><p class="muted">Даты и время распознаются по простым правилам. Числа словами и фамилии могут потребовать исправления. Участников отметьте ниже.</p>
 <form id="voiceForm" class="form-grid"><label class="full">Название<input id="voiceTitle" required maxlength="500"></label><label>Дата<input id="voiceDate" type="date" required></label><label>Время (Москва)<input id="voiceTime" type="time" required></label><fieldset class="full" id="voicePeople"><legend>Участники</legend></fieldset><label class="full">Комментарий<textarea id="voiceNote" rows="2"></textarea></label><p id="voiceWarning" class="full muted"></p><button class="primary full" type="submit">Скопировать для внесения в таблицу</button></form>
 <p class="muted">После проверки скопируйте карточку и отправьте в чат, через который вы редактируете Google-таблицу.</p></div>`;
 document.body.append(modal);
 const $=id=>document.getElementById(id);
 let worker=null,ready=false,stream=null,recorder=null,timer=null,timeout=null,busy=false,closed=false,audioContext=null;
 const status=t=>{$('voiceStatus').textContent=t};
 function release(){clearTimeout(timer);timer=null;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null}
 function resetWorker(){clearTimeout(timeout);if(worker)worker.terminate();worker=null;ready=false;busy=false;$('voiceLoad').disabled=false;$('voiceStart').disabled=true;}
 function close(){closed=true;if(recorder&&recorder.state!=='inactive')recorder.stop();release();recorder=null;if(audioContext)audioContext.close().catch(()=>{});audioContext=null;resetWorker();$('voiceStop').disabled=true;modal.classList.remove('open')}
 function parse(){const draft=VoiceDraft.parse($('voiceText').value);$('voiceTitle').value=draft.title;$('voiceDate').value=draft.date;$('voiceTime').value=draft.time;$('voiceWarning').textContent=draft.warning.join(' ')}
 window.openVoiceDraft=function(){
  closed=false;modal.classList.add('open');
  const field=$('voicePeople');field.replaceChildren();const legend=document.createElement('legend');legend.textContent='Участники';field.append(legend);
  for(const p of db.people){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=p.short;box.style.width='auto';label.append(box,document.createTextNode(' '+p.short));label.style.display='inline-flex';label.style.gap='6px';label.style.margin='6px 12px 6px 0';field.append(label)}
  status('Можно подготовить микрофон или ввести текст вручную.');
 };
 $('voiceClose').onclick=close;
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close()});
 $('voiceParse').onclick=parse;
 $('voiceLoad').onclick=()=>{
  if(!window.Worker||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Запись в этом браузере недоступна. Используйте текстовый ввод или диктовку клавиатуры телефона.');return}
  resetWorker();$('voiceLoad').disabled=true;busy=true;status('Загружаю модель распознавания. При первом запуске это может занять несколько минут…');
  try{
   worker=new Worker('./voice-worker.js',{type:'module'});
   timeout=setTimeout(()=>{resetWorker();status('Загрузка заняла слишком много времени. Попробуйте снова или введите текст вручную.')},300000);
   worker.onerror=()=>{resetWorker();status('Распознавание недоступно в этом браузере или сети. Можно ввести текст вручную.')};
   worker.onmessage=({data})=>{
    if(closed)return;
    if(data.type==='progress')status('Загружаю файлы модели: '+data.progress+'% текущего файла…');
    if(data.type==='ready'){clearTimeout(timeout);ready=true;busy=false;$('voiceStart').disabled=false;status('Модель готова. Нажмите «Начать запись» и разрешите микрофон.')}
    if(data.type==='text'){clearTimeout(timeout);busy=false;$('voiceText').value=data.text;parse();$('voiceStart').disabled=false;status(data.text.trim()?'Текст распознан. Проверьте название, дату, время и участников.':'Речь не распознана. Попробуйте короткую фразу ещё раз.')}
    if(data.type==='error'){resetWorker();status(data.message)}
   };
   worker.postMessage({type:'load'});
  }catch(_){resetWorker();status('Не удалось запустить распознавание. Можно ввести текст вручную.')}
 };
 $('voiceStart').onclick=async()=>{
  if(!ready||busy)return;busy=true;$('voiceStart').disabled=true;status('Ожидаю разрешение на микрофон…');
  try{
   const AC=window.AudioContext||window.webkitAudioContext;audioContext=new AC();await audioContext.resume();
   const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
   if(closed){acquired.getTracks().forEach(t=>t.stop());return}
   stream=acquired;const chunks=[];
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x));
   recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>{release();busy=false;$('voiceStop').disabled=true;$('voiceStart').disabled=!ready;status('Ошибка записи. Попробуйте снова.')};
   recorder.onstop=async()=>{
    release();$('voiceStop').disabled=true;if(closed)return;status('Распознаю запись на устройстве…');
    try{
     const blob=new Blob(chunks,{type:recorder.mimeType});
     if(blob.size<100)throw new Error('Empty');
     const decoded=await audioContext.decodeAudioData(await blob.arrayBuffer());
     if(decoded.duration<0.3)throw new Error('Short');
     const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
     const offline=new Offline(1,Math.ceil(Math.min(decoded.duration,46)*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
     const rendered=await offline.startRendering(),audio=rendered.getChannelData(0).slice();
     await audioContext.close();audioContext=null;if(closed)return;
     timeout=setTimeout(()=>{resetWorker();status('Распознавание заняло слишком много времени. Попробуйте более короткую запись.')},180000);
     worker.postMessage({type:'transcribe',audio},[audio.buffer]);
    }catch(_){if(audioContext)audioContext.close().catch(()=>{});audioContext=null;busy=false;$('voiceStart').disabled=!ready;status('Не удалось обработать запись. Попробуйте снова или введите текст вручную.')}
   };
   recorder.start();$('voiceStop').disabled=false;status('Идёт запись. Говорите коротко, затем нажмите «Остановить».');timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop()},45000);
  }catch(_){release();if(audioContext)audioContext.close().catch(()=>{});audioContext=null;busy=false;$('voiceStart').disabled=!ready;status('Нет доступа к микрофону. Разрешите его в настройках браузера или введите текст вручную.')}
 };
 $('voiceStop').onclick=()=>{if(recorder?.state==='recording')recorder.stop()};
 $('voiceForm').onsubmit=async e=>{
  e.preventDefault();const text=VoiceDraft.format({title:$('voiceTitle').value,date:$('voiceDate').value,time:$('voiceTime').value,people:[...$('voicePeople').querySelectorAll('input:checked')].map(x=>x.value),note:$('voiceNote').value});
  try{await navigator.clipboard.writeText(text);status('Карточка скопирована. Отправьте её в чат для внесения в общую таблицу. Пока ничего не опубликовано.')}
  catch(_){$('voiceText').value=text;$('voiceText').focus();$('voiceText').select();status('Выделен текст карточки — скопируйте его вручную. Пока ничего не опубликовано.')}
 };
 window.addEventListener('pagehide',close);
})();
