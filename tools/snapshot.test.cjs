const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {spawnSync} = require('node:child_process');

test('task control survives encryption independently of urgency and migrates legacy status',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-sync-test-'));
 try{
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const baseline={people:[],events:[],tasks:[],birthdays:[]};
  const c=crypto.createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(baseline)))),c.final(),c.getAuthTag()]);
  const put=(name,obj)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(obj));
  put('baseline.json',{v:1,alg:'A256GCM',compressed:'gzip',iv:iv.toString('base64'),data:data.toString('base64')});
  put('key.json',{alg:'A256GCM',key:key.toString('base64')});
  const header=['ID задачи','Исполнитель ID','Исполнитель','Задача','Описание','Дата постановки','Срок исполнения','Приоритет','Статус','Дата выполнения','Постановщик','Комментарий','Просрочена','Дней до срока','Контроль'];
  const source={'Сотрудники':[['ID','ФИО','Краткое имя']],'События':[['ID события','Сотрудник ID','Сотрудник','Тип события']],'Дни рождения':[['Сотрудник ID','Сотрудник','Дата рождения']],
   'Задачи':[header,['a','','','Urgent','','','','Срочный','Новая','','','','','','Не на контроле'],['b','','','Controlled','','','','Обычный','В работе','','','','','','На контроле'],['c','','','Legacy','','','','Низкий','На контроле']]};
  const run=name=>{put('source.json',source);return spawnSync(process.execPath,[path.join(__dirname,'build-snapshot.cjs'),'--source',path.join(dir,'source.json'),'--key',path.join(dir,'key.json'),'--baseline',path.join(dir,'baseline.json'),'--out',path.join(dir,name)],{encoding:'utf8'})};
  let r=run('result.json');assert.equal(r.status,0,r.stderr);
  const env=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))),raw=Buffer.from(env.data,'base64');
  const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(env.iv,'base64'));d.setAuthTag(raw.subarray(-16));
  const out=JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(raw.subarray(0,-16)),d.final()])));
  assert.deepEqual(out.tasks.map(t=>[t.controlled,t.priority,t.status]),[[false,'Срочный','Новая'],[true,'Обычный','В работе'],[true,'Низкий','В работе']]);
  source['Задачи'][1][14]='неизвестно';r=run('invalid.json');assert.equal(r.status,1);assert.match(r.stderr,/Invalid task control/);
 }finally{
  if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('calendar-sync-test-'))throw Error('Unsafe temporary cleanup path');
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('snapshot: stable unchanged output, metadata accuracy and deletion protection',()=>{
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'calendar-sync-test-'));
 try {
  const key=crypto.randomBytes(32), iv=crypto.randomBytes(12);
  const db={people:[{id:'p',full:'Test',short:'Test',role:'',category:'',birthdate:''}],events:[],tasks:[],birthdays:[]};
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(db)))),cipher.final(),cipher.getAuthTag()]);
  const env={v:1,alg:'A256GCM',compressed:'gzip',iv:iv.toString('base64'),data:data.toString('base64')};
  const put=(name,obj)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(obj));
  put('baseline.json',env);put('key.json',{alg:'A256GCM',key:key.toString('base64')});
  const source={'Сотрудники':[['ID','ФИО','Краткое имя'],['p','Test','Test']], 'События':[['ID события','Сотрудник ID','Сотрудник','Тип события']], 'Задачи':[['ID задачи','Исполнитель ID','Исполнитель','Задача']], 'Дни рождения':[['Сотрудник ID','Сотрудник','Дата рождения']]};
  put('source.json',source);
  const run=(output,extra=[])=>spawnSync(process.execPath,[path.join(__dirname,'build-snapshot.cjs'),'--source',path.join(dir,'source.json'),'--key',path.join(dir,'key.json'),'--out',path.join(dir,output),'--baseline',path.join(dir,'baseline.json'),...extra],{encoding:'utf8'});
  let r=run('unchanged.json');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'unchanged.json'))),env);
  put('meta.json',{modifiedTime:'2026-11-01T09:00:00Z',lastModifyingUser:{displayName:'Operator'}});
  r=run('with-meta.json',['--metadata',path.join(dir,'meta.json')]);assert.equal(r.status,0,r.stderr);
  const next=JSON.parse(fs.readFileSync(path.join(dir,'with-meta.json'))),raw=Buffer.from(next.data,'base64');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(next.iv,'base64'));decipher.setAuthTag(raw.subarray(-16));
  const out=JSON.parse(zlib.gunzipSync(Buffer.concat([decipher.update(raw.subarray(0,-16)),decipher.final()])));
  assert.equal(out.meta.modifiedBy,'Operator');assert.equal(out.meta.sourceModifiedAt,'2026-11-01T09:00:00Z');
  put('baseline.json',next);r=run('second.json',['--metadata',path.join(dir,'meta.json')]);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'second.json'))),next);
  source['События'].push(['new-participant','p','Test','Совещание','06.11.2026','06.11.2026',1,'План','11:00','','','','','','meeting-group']);
  put('source.json',source);r=run('participant.json');assert.equal(r.status,0,r.stderr);
  const participantEnv=JSON.parse(fs.readFileSync(path.join(dir,'participant.json'))),participantRaw=Buffer.from(participantEnv.data,'base64');
  const participantDecipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(participantEnv.iv,'base64'));participantDecipher.setAuthTag(participantRaw.subarray(-16));
  const participantSnapshot=JSON.parse(zlib.gunzipSync(Buffer.concat([participantDecipher.update(participantRaw.subarray(0,-16)),participantDecipher.final()])));
  assert.equal(participantSnapshot.events[0].linkedEvent,'meeting-group');
  source['События'].pop();source['Сотрудники'].pop();put('source.json',source);r=run('bad.json');assert.equal(r.status,1);assert.match(r.stderr,/Source omits/);assert.equal(fs.existsSync(path.join(dir,'bad.json')),false);
 } finally {
  if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('calendar-sync-test-'))throw Error('Unsafe temporary cleanup path');
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('Google read rejects a table edited during export and reads full tab bounds',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-sync-test-'));
 try{
  const script=path.join(__dirname,'fetch-sheets.cjs');
  function run(drift,out){
   const code=`process.env.GOOGLE_ACCESS_TOKEN='fake-test-token'; process.argv=[process.execPath,${JSON.stringify(script)},${JSON.stringify(out)}];let n=0;global.fetch=async(url,opts)=>{if(opts.headers.Authorization!=='Bearer fake-test-token')throw Error('Missing token');let obj;if(url.includes('/drive/')){obj={id:'1q83XSPLXRd9Fgk20gSs601SX9LZWA1yQvkZQQEQ49KU',modifiedTime:(++n===2&&${drift})?'2026-11-02T00:00:00Z':'2026-11-01T00:00:00Z'}}else if(url.includes('values:batchGet')){if(!decodeURIComponent(url).includes('N999')||!decodeURIComponent(url).includes('S999'))throw Error('Truncated range');obj={valueRanges:[{values:[['a']]},{values:[['b']]},{values:[['c']]},{values:[['d']]}]}}else{obj={sheets:['Сотрудники','События','Дни рождения','Задачи'].map(title=>({properties:{title,gridProperties:{rowCount:999,columnCount:26}}}))}}return{ok:true,json:async()=>obj}};require(${JSON.stringify(script)});`;
   return spawnSync(process.execPath,['-e',code],{encoding:'utf8'});
  }
  let r=run(false,path.join(dir,'valid'));assert.equal(r.status,0,r.stderr);assert.ok(fs.existsSync(path.join(dir,'valid','source.json')));
  r=run(true,path.join(dir,'drift'));assert.equal(r.status,1);assert.match(r.stderr,/Table changed/);assert.equal(fs.existsSync(path.join(dir,'drift','source.json')),false);
 }finally{
  if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('calendar-sync-test-'))throw Error('Unsafe temporary cleanup path');
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
