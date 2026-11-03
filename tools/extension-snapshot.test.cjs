const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
test('encrypted snapshot preserves explicit extension dates and refuses invalid dates',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calendar-extension-'));
 try{
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),blank={people:[],events:[],tasks:[],birthdays:[]};
 const bytes=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(blank)))),cipher.final(),cipher.getAuthTag()]);
 const write=(p,obj)=>fs.writeFileSync(path.join(dir,p),JSON.stringify(obj));write('key.json',{alg:'A256GCM',key:key.toString('base64')});write('base.json',{v:1,alg:'A256GCM',compressed:'gzip',iv:iv.toString('base64'),data:bytes.toString('base64')});
 const source={'Сотрудники':[['ID','ФИО','Краткое имя']],'Дни рождения':[['Сотрудник ID','Сотрудник','Дата рождения']],'Задачи':[['ID задачи','Исполнитель ID','Исполнитель','Задача']],'События':[['ID события','Сотрудник ID','Сотрудник','Тип события','Дата начала','Дата окончания','Количество дней','Статус','Основание','Комментарий','Кто','Когда','Источник','Категория','Связанное событие','Замещение','Влияние','Пометка','Даты продления отпуска'],['example','','','Основной отпуск','31.05.2027','25.06.2027',26,'План','','','','','','','','','','','25.06.2027']]};
 function run(name){write('source.json',source);return spawnSync(process.execPath,['tools/build-snapshot.cjs','--source',path.join(dir,'source.json'),'--key',path.join(dir,'key.json'),'--baseline',path.join(dir,'base.json'),'--out',path.join(dir,name)],{encoding:'utf8'})}
 let r=run('valid.json');assert.equal(r.status,0,r.stderr);const env=JSON.parse(fs.readFileSync(path.join(dir,'valid.json'))),data=Buffer.from(env.data,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(env.iv,'base64'));d.setAuthTag(data.subarray(-16));const out=JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(data.subarray(0,-16)),d.final()])));assert.deepEqual(out.events[0].extensionDates,['2027-06-25']);
 source['События'][1][18]='26.06.2027';r=run('invalid.json');assert.equal(r.status,1);assert.match(r.stderr,/Invalid leave extension dates/);
 }finally{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('calendar-extension-'))throw Error('Unsafe temp path');fs.rmSync(dir,{recursive:true,force:true})}
});
