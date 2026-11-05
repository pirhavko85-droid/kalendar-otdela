const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'manual-sync/Code.gs'),'utf8');
function app(email='pirhavko85@gmail.com') {
 const script=new Map([['GITHUB_ACTIONS_TOKEN','test-secret']]),user=new Map([['SESSION',JSON.stringify({nonce:'valid',createdAt:Date.now()})]]),calls=[];
 let runs=[],locked=false;
 const store=m=>({getProperty:k=>m.get(k)||null,setProperty:(k,v)=>m.set(k,v)});
 const context={Date,JSON,Error,Session:{getActiveUser:()=>({getEmail:()=>email})},PropertiesService:{getScriptProperties:()=>store(script),getUserProperties:()=>store(user)},Utilities:{getUuid:()=> 'unique-request-id'},LockService:{getScriptLock:()=>({tryLock:()=>!locked,releaseLock:()=>{}})},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer test-secret');const body=url.includes('/jobs?')?{jobs:[{name:'publish / deploy',status:'in_progress'}]}:url.includes('/runs?')?{workflow_runs:runs}:{};return{getResponseCode:()=>options.method==='post'?204:200,getContentText:()=>options.method==='post'?'':JSON.stringify(body)}}}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,script,user,calls,setRuns:x=>{runs=x},setLocked:x=>{locked=x}};
}
test('manual sync denies missing or unauthorized Google identity before contacting GitHub',()=>{
 for(const email of ['','intruder@example.com']){const a=app(email);assert.throws(()=>a.context.startSync('valid'),/аккаунтом/);assert.equal(a.calls.length,0)}
});
test('manual sync rejects invalid or expired sessions without external effects',()=>{
 const a=app();assert.throws(()=>a.context.startSync('wrong'),/Сеанс/);a.user.set('SESSION',JSON.stringify({nonce:'valid',createdAt:Date.now()-3600001}));assert.throws(()=>a.context.startSync('valid'),/Сеанс/);assert.equal(a.calls.length,0);
});
test('operators dispatch only fixed main workflow and duplicates reuse queued work',()=>{
 const a=app('XAPUN655@gmail.com');assert.equal(a.context.startSync('valid').phase,'queued');
 const posts=()=>a.calls.filter(c=>c.options.method==='post');assert.equal(posts().length,1);assert.equal(posts()[0].url,'https://api.github.com/repos/pirhavko85-droid/kalendar-otdela/actions/workflows/sync-data.yml/dispatches');assert.deepEqual(JSON.parse(posts()[0].options.payload),{ref:'main',inputs:{request_id:'unique-request-id'}});
 assert.equal(a.context.startSync('valid').phase,'queued');assert.equal(posts().length,1);
});
test('status correlates the exact request, distinguishes publishing, failure and completion',()=>{
 const a=app('mirgorod231290@gmail.com');a.context.startSync('valid');
 a.setRuns([{id:4,display_title:'other',status:'completed',conclusion:'success'}]);assert.equal(a.context.getSyncStatus('valid').phase,'queued');
 a.setRuns([{id:5,display_title:'Manual sync unique-request-id',status:'in_progress'}]);assert.match(a.context.getSyncStatus('valid').message,/Публикуется/);
 a.setRuns([{id:5,display_title:'Manual sync unique-request-id',status:'completed',conclusion:'failure'}]);assert.equal(a.context.getSyncStatus('valid').phase,'failed');
 a.setRuns([{id:5,display_title:'Manual sync unique-request-id',status:'completed',conclusion:'success'}]);const result=a.context.getSyncStatus('valid');assert.equal(result.phase,'success');assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('missing token and concurrent dispatch fail without pretending the job was launched',()=>{
 const a=app();a.script.delete('GITHUB_ACTIONS_TOKEN');assert.throws(()=>a.context.startSync('valid'),/не настроен/);assert.equal(a.script.has('STATE'),false);
 const b=app();b.setLocked(true);assert.throws(()=>b.context.startSync('valid'),/оператор/);assert.equal(b.calls.length,0);
});
