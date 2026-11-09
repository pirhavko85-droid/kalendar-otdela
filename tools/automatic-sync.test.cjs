const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(saved={}){
 const elements=new Map(),windowListeners={},documentListeners={},timeouts=[],intervals=[],messages=[],storage=new Map(Object.entries(saved));
 function element(id=''){
  if(id&&elements.has(id))return elements.get(id);
  const e={id,value:id==='editKind'?'events':id==='departmentEditor'?'P':'',disabled:false,hidden:false,style:{},children:[],classList:{add(){},remove(){},contains(){return false}},append(...items){this.children.push(...items)},insertBefore(){},before(){},after(){},replaceChildren(){},querySelector(){return element()},remove(){const body=elements.get('body');if(body)body.children=body.children.filter(x=>x!==this)},addEventListener(){},querySelectorAll(){return[]},click(){if(!this.disabled)this.onclick?.()},setAttribute(){}};
  if(id)elements.set(id,e);return e;
 }
 const remote={people:[{id:'P',short:'Роман П.'}],events:[{id:'E',personId:'P',type:'До правки',start:'2026-11-09',end:'2026-11-09',status:'План',basis:'15:00',comment:'',linkedEvent:'G'}],tasks:[],birthdays:[]};
 let fail=false,fetches=0,uuid=0,hold=null;
 storage.set('key','shared-key');storage.set('departmentEditorV1','P');
 const c={db:storage.get('db')?JSON.parse(storage.get('db')):copy(remote),KEY:'db',SYNC_KEY:'key',document:{hidden:false,createElement:()=>element(),getElementById:element,querySelector:()=>element(),addEventListener:(k,f)=>documentListeners[k]=f},navigator:{onLine:true},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=>`${String(++uuid).padStart(8,'0')}-1111-1111-1111-111111111111`},
  setTimeout:(fn,ms)=>{const t={fn,ms,cancelled:false};timeouts.push(t);return t},clearTimeout:t=>{if(t)t.cancelled=true},setInterval:f=>{intervals.push(f);return intervals.length},clearInterval(){},Date,console,EventDraft:{moscowToday:()=> '2026-11-09'},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},alert(){},esc:String,fmt:String,todayISO:()=> '2026-11-09',uid:()=> 'new',person:id=>c.db.people.find(p=>p.id===id),renderAll(){},save(){storage.set('db',JSON.stringify(c.db))},
  syncEncrypted:async options=>{fetches++;if(hold)await hold;if(fail)return false;options.apply(copy(remote),copy(remote));return true},
 };
 c.window={addEventListener:(k,f)=>windowListeners[k]=f,dispatchEvent:e=>windowListeners[e.type]?.(e)};
 c.document.body=element('body');vm.createContext(c);vm.runInContext(fs.readFileSync('collaboration.js','utf8'),c);
 const peer={postMessage:data=>messages.push(copy(data))};
 function receive(type,extra={}){const frame=elements.get('last-frame');const src=frame?.src||findFrame();const channel=new URL(src).searchParams.get('channel');windowListeners.message({origin:'https://unit-script.googleusercontent.com',source:peer,data:{type,channel,...extra}})}
 function findFrame(){// The bridge is appended to body by connect().
  return c.document.body.children.find(e=>e.src)?.src;
 }
 return{c,remote,storage,elements,messages,windowListeners,intervals,timeouts,receive,fetches:()=>fetches,fail:v=>fail=v,hold:v=>hold=v,store:()=>JSON.parse(storage.get('departmentChangesV1'))};
}
async function flush(s){const queue=s.timeouts.splice(0);for(const timer of queue){if(timer.ms>1000){s.timeouts.push(timer);continue}if(!timer.cancelled)await timer.fn()}}
function acknowledge(s){s.receive('department-ready');s.receive('department-capabilities-result',{result:{version:2}});const sent=s.messages.findLast(m=>m.type==='department-changes');assert.ok(sent);s.receive('department-changes-result',{requestId:sent.requestId,result:{ok:true}});return sent}
test('local edits send automatically, old snapshots cannot undo confirmed edits, and polling continues',async()=>{
 const s=setup();s.c.db.events[0].type='После правки';s.c.save();await flush(s);
 const sent=acknowledge(s);assert.equal(sent.operations.length,1);await flush(s);
 assert.equal(s.c.db.events[0].type,'После правки');assert.equal(s.store().operations.length,0);assert.equal(s.store().awaitingPublished.length,1);
 const before=s.messages.length;for(let i=0;i<40;i++)await s.intervals[0]();assert.equal(s.messages.length,before);assert.equal(s.c.db.events[0].type,'После правки');
 s.remote.events[0].type='После правки';await s.intervals[0]();assert.equal(s.store().awaitingPublished.length,0);assert.match(s.elements.get('changeStatus').textContent,/опубликованы/);
});
test('pending publication survives reload and receives updates without navigating to import/export',async()=>{
 const op={collection:'events',id:'E',before:{},after:{personId:'P',type:'Новое',start:'2026-11-09',end:'2026-11-09',days:'',status:'План',basis:'15:00',comment:'',linkedEvent:'G'}};
 const local={people:[{id:'P',short:'Роман П.'}],events:[{id:'E',...op.after,modifiedAt:'2026-11-09T01:00:00Z'}],tasks:[],birthdays:[]};
 const c2=setup({db:JSON.stringify(local),departmentChangesV1:JSON.stringify({operations:[],requestId:null,awaitingPublished:[op]})});
 await flush(c2);assert.equal(c2.c.db.events[0].type,'Новое');assert.equal(c2.store().awaitingPublished.length,1);
 c2.remote.events[0].type='Новое';await c2.intervals[0]();assert.equal(c2.store().awaitingPublished.length,0);assert.equal(c2.c.db.events[0].type,'Новое');
});
test('append receipts use the actual published snapshot, survive reload, and retry failed fetches',async()=>{
 const s=setup();s.c.db.events.push({id:'new-local'});s.c.window.watchDepartmentEvent(['new-local']);await flush(s);
 assert.equal(s.store().receipts.length,1);s.fail(true);await s.intervals[0]();assert.equal(s.store().receipts.length,1);
 s.fail(false);s.remote.events.push({id:'new-local'});await s.intervals[0]();assert.equal(s.store().receipts.length,0);
});
test('an unanswered write is checked automatically instead of being blindly resubmitted',async()=>{
 const s=setup({departmentChangesV1:JSON.stringify({operations:[{collection:'events',id:'E',after:{type:'Новое'}}],requestId:'aaaaaaaa-1111-1111-1111-111111111111'})});
 await s.intervals[0]();s.receive('department-ready');assert.equal(s.messages.at(-1).type,'department-change-status');assert.equal(s.messages.some(m=>m.type==='department-changes'),false);
});
test('concurrent refreshes are serialized and never disable edit tracking during fetch',async()=>{
 const s=setup();let resolve;s.hold(new Promise(r=>resolve=r));const first=s.c.syncEncrypted(),second=await s.c.syncEncrypted();assert.equal(second,false);assert.equal(s.fetches(),1);
 s.c.db.events[0].type='Concurrent edit';s.c.save();assert.equal(s.c.db.events[0].type,'До правки');resolve();await first;assert.equal(s.store().operations.length,0);
 s.c.db.events[0].type='Tracked';s.c.save();assert.equal(s.store().operations.length,1);
});

test('lost acknowledgement reconnects and checks the same request without a second write',async()=>{
 const s=setup();s.c.db.events[0].type='Новое';s.c.save();await flush(s);s.receive('department-ready');s.receive('department-capabilities-result',{result:{version:2}});
 const request=s.messages.find(m=>m.type==='department-changes').requestId;const timer=s.timeouts.find(t=>t.ms===45000&&!t.cancelled);timer.fn();
 await s.intervals[0]();s.receive('department-ready');assert.equal(s.messages.at(-1).type,'department-change-status');assert.equal(s.messages.at(-1).requestId,request);assert.equal(s.messages.filter(m=>m.type==='department-changes').length,1);
});
test('definitive conflict stops automatic resubmission while preserving local edits',async()=>{
 const s=setup();s.c.db.events[0].type='Новое';s.c.save();await flush(s);s.receive('department-ready');s.receive('department-capabilities-result',{result:{version:2}});
 const request=s.messages.find(m=>m.type==='department-changes').requestId;s.receive('department-changes-result',{requestId:request,result:{ok:false,phase:'rejected',message:'Конфликт'}});
 const n=s.messages.length;await s.intervals[0]();assert.equal(s.messages.length,n);assert.equal(s.store().operations.length,1);assert.equal(s.store().autoPaused,true);
});
test('an append resumes after reload with its original idempotency key',async()=>{
 const requestId='aaaaaaaa-1111-1111-1111-111111111111',event={title:'Тест',date:'2026-11-09',time:'15:00',people:[],author:'P'};
 const s=setup({departmentPendingEventV1:JSON.stringify({event,requestId})});vm.runInContext(fs.readFileSync('event-card.js','utf8'),s.c);
 await s.intervals[1]();s.receive('department-ready');const first=s.messages.find(m=>m.type==='department-add');assert.equal(first.requestId,requestId);assert.equal(first.event.title,'Тест');
 const timer=s.timeouts.findLast(t=>t.ms===45000&&!t.cancelled);timer.fn();s.windowListeners.online();s.receive('department-ready');const again=s.messages.filter(m=>m.type==='department-add');assert.equal(again.length,2);assert.equal(again[1].requestId,requestId);
 s.receive('department-result',{requestId,result:{ok:true,ids:['saved-id']}});assert.equal(s.storage.has('departmentPendingEventV1'),false);assert.equal(s.store().receipts[0].ids[0],'saved-id');
});

test('an already applied cancellation resolves from the published snapshot without resending',async()=>{
 const s=setup();s.c.db.events[0].status='Отменена';s.c.save();await flush(s);s.receive('department-ready');s.receive('department-capabilities-result',{result:{version:2}});
 const sent=s.messages.find(m=>m.type==='department-changes');s.receive('department-changes-result',{requestId:sent.requestId,result:{ok:false,phase:'rejected',message:'Конфликт'}});
 s.remote.events[0].status='Отменена';s.remote.events[0].comment='Более позднее уточнение другого автора';
 const n=s.messages.length;await s.c.window.retryDepartmentSync();await new Promise(r=>setImmediate(r));
 assert.equal(s.store().operations.length,0);assert.equal(s.store().autoPaused,false);assert.equal(s.messages.length,n);assert.equal(s.c.db.events[0].comment,s.remote.events[0].comment);assert.match(s.elements.get('changeStatus').textContent,/уже сохранены/);
});

test('a true conflict refreshes without overwriting local edits or resending the rejected write',async()=>{
 const s=setup();s.c.db.events[0].basis='17:00';s.c.save();await flush(s);s.receive('department-ready');s.receive('department-capabilities-result',{result:{version:2}});
 const sent=s.messages.find(m=>m.type==='department-changes');s.receive('department-changes-result',{requestId:sent.requestId,result:{ok:false,phase:'rejected',message:'Конфликт'}});
 s.remote.events[0].basis='18:00';const n=s.messages.length;await s.c.syncEncrypted();
 assert.equal(s.c.db.events[0].basis,'17:00');assert.equal(s.store().operations.length,1);assert.equal(s.messages.length,n);
 s.c.confirm=()=>false;await s.c.window.acceptDepartmentVersion();assert.equal(s.store().operations.length,1);
 s.c.confirm=()=>true;await s.c.window.acceptDepartmentVersion();assert.equal(s.store().operations.length,0);assert.equal(s.c.db.events[0].basis,'18:00');
 const backup=JSON.parse(s.storage.get('departmentConflictBackupV1'));assert.equal(backup.db.events[0].basis,'17:00');assert.equal(backup.changes.operations.length,1);assert.equal(s.messages.length,n);
});

test('paused conflict reconciliation survives reload and does not infer success from stale data',async()=>{
 const first=setup();first.c.db.events[0].status='Отменена';first.c.save();const state=first.store();state.autoPaused=true;
 const s=setup({db:JSON.stringify(first.c.db),departmentChangesV1:JSON.stringify(state)});await flush(s);
 assert.equal(s.store().operations.length,1);assert.equal(s.c.db.events[0].status,'Отменена');assert.equal(s.messages.length,0);
 s.remote.events[0].status='Отменена';await s.c.syncEncrypted();assert.equal(s.store().operations.length,0);assert.equal(s.messages.length,0);
});
