// Deploy as USER_ACCESSING, access ANYONE (signed-in Google users).
// Keep this project private. Operators get the web app URL, never editor access.
const SYNC_REPO = 'pirhavko85-droid/kalendar-otdela';
const SYNC_WORKFLOW = 'sync-data.yml';
const SYNC_ALLOWED = ['pirhavko85@gmail.com','mirgorod231290@gmail.com','xapun655@gmail.com'];

function operator_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || !SYNC_ALLOWED.includes(email)) throw new Error('Войдите в Google под разрешённым аккаунтом отдела.');
  return email;
}
function github_(route, method, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_ACTIONS_TOKEN');
  if (!token) throw new Error('Запуск ещё не настроен. Сообщите Роману.');
  const options = {method:method || 'get', muteHttpExceptions:true, followRedirects:false,
    headers:{Authorization:'Bearer '+token, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
  if (payload) { options.contentType='application/json'; options.payload=JSON.stringify(payload); }
  const response = UrlFetchApp.fetch('https://api.github.com/repos/'+SYNC_REPO+route,options);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('GitHub не выполнил запрос (HTTP '+code+'). Сообщите Роману.');
  const body = response.getContentText();
  return body ? JSON.parse(body) : {};
}
function nonce_(nonce) {
  operator_();
  const stored = PropertiesService.getUserProperties().getProperty('SESSION');
  const session = stored ? JSON.parse(stored) : {};
  if (!nonce || nonce !== session.nonce || Date.now()-session.createdAt > 3600000) throw new Error('Сеанс истёк. Обновите страницу запуска.');
}
function state_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('STATE') || 'null');
}
function getSyncStatus(nonce) {
  nonce_(nonce);
  const state = state_();
  if (!state) return {phase:'idle',message:'Можно запустить обновление таблицы.'};
  let run;
  if (state.runId) run=github_('/actions/runs/'+state.runId);
  else {
    const runs=github_('/actions/workflows/'+SYNC_WORKFLOW+'/runs?event=workflow_dispatch&branch=main&per_page=30').workflow_runs || [];
    run=runs.find(x=>x.display_title==='Manual sync '+state.requestId);
  }
  if (!run) return {phase:Date.now()-state.createdAt>900000?'failed':'queued',message:Date.now()-state.createdAt>900000?'Запуск не найден в GitHub. Сообщите Роману.':'Запрос принят. Ожидаю запуск GitHub.'};
  const result={phase:'running',message:'Google-таблица читается, данные проверяются.',runId:run.id};
  if (run.status==='completed') {
    result.phase=run.conclusion==='success'?'success':'failed';
    result.message=result.phase==='success'?'Обновление завершено. Вернитесь в дашборд и нажмите «Получить свежие данные».':'Обновление не завершилось успешно. Прежние данные сохранены. Сообщите Роману.';
  } else if (run.status==='queued'||run.status==='waiting'||run.status==='requested') {
    result.phase='queued'; result.message='Обновление в очереди GitHub. Страница проверит результат автоматически.';
  } else {
    const jobs=github_('/actions/runs/'+run.id+'/jobs?per_page=20').jobs || [];
    if (jobs.some(x=>x.name.indexOf('publish')!==-1 && x.status!=='queued')) result.message='Публикуется новая версия данных на сайте.';
  }
  return result;
}
function startSync(nonce) {
  nonce_(nonce);
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Другой оператор уже запускает обновление. Попробуйте через несколько секунд.');
  try {
    const old=state_();
    if (old) {
      const status=getSyncStatus(nonce);
      if (['queued','running'].includes(status.phase)) return status;
      if (Date.now()-old.createdAt<60000) return {phase:'cooldown',message:'Предыдущее обновление завершено. Повторный запуск доступен через минуту после предыдущего запроса.'};
    }
    const state={requestId:Utilities.getUuid(),createdAt:Date.now()};
    github_('/actions/workflows/'+SYNC_WORKFLOW+'/dispatches','post',{ref:'main',inputs:{request_id:state.requestId}});
    PropertiesService.getScriptProperties().setProperty('STATE',JSON.stringify(state));
    return {phase:'queued',message:'Запрос принят. Ожидаю запуск GitHub.'};
  } finally { lock.releaseLock(); }
}
function doGet() {
  try {
    const email=operator_();
    const nonce=Utilities.getUuid();
    PropertiesService.getUserProperties().setProperty('SESSION',JSON.stringify({nonce:nonce,createdAt:Date.now()}));
    const page=HtmlService.createHtmlOutputFromFile('Page').getContent();
    return HtmlService.createHtmlOutput(page.replace('__SESSION__',JSON.stringify({email:email,nonce:nonce}))).setTitle('Обновление календаря отдела').addMetaTag('viewport','width=device-width, initial-scale=1');
  } catch (_) {
    return HtmlService.createHtmlOutput('<h2>Обновление календаря отдела</h2><p>Войдите под Google-аккаунтом отдела: Романа, Павла или Юлии. Если выбран другой аккаунт, откройте ссылку под нужным аккаунтом.</p>').setTitle('Требуется аккаунт отдела');
  }
}
