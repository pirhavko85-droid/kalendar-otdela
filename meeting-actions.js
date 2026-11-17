(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MeetingActions=api})(typeof globalThis==='undefined'?this:globalThis,function(){
 'use strict';
 const fields=['personId','type','start','end','days','status','basis','comment','linkedEvent'];
 const copy=x=>JSON.parse(JSON.stringify(x));
 const record=x=>x?Object.fromEntries(fields.map(k=>[k,String(x[k]??'')])):null;
 function planEdit(rows,input,newId){
  if(!rows.length)throw new Error('Мероприятие не найдено.');
  const selected=[...new Set(input.people.map(p=>p.id))];if(!selected.length)selected.push('');
  const used=new Set(),base=rows[0],group=base.linkedEvent||'EDIT-GRP-'+base.id;
  const days=Math.round((Date.parse(input.endDate)-Date.parse(input.date))/86400000)+1;
  const result=selected.map(personId=>{const source=rows.find(r=>r.personId===personId&&!used.has(r.id))||rows.find(r=>!used.has(r.id));if(source)used.add(source.id);return {...(source||base),id:source?source.id:newId(),personId,type:input.title,start:input.date,end:input.endDate,days,status:source?source.status:'План',basis:input.time,comment:input.note,linkedEvent:group}});
  return result.concat(rows.filter(r=>!used.has(r.id)).map(r=>({...r,status:'Отменена'})));
 }
 function operations(before,after,author){
  const old=new Map(before.map(x=>[x.id,x]));
  return after.map(x=>({collection:'events',id:x.id,before:record(old.get(x.id)),after:record(x),author})).filter(op=>JSON.stringify(op.before)!==JSON.stringify(op.after));
 }
 const edit=(rows,input,newId)=>operations(rows,planEdit(rows,input,newId),input.author);
 const cancel=(rows,author)=>operations(rows,rows.map(r=>({...r,status:'Отменена'})),author);
 function isPublished(request,rows){
  if(request.operations){return request.operations.length>0&&request.operations.every(op=>{const current=rows.find(r=>r.id===op.id);if(!current)return op.after?.status==='Отменена';const actual=record(current);return fields.filter(k=>!op.before||op.before[k]!==op.after[k]).every(k=>actual[k]===String(op.after[k]??''))})}
  const v=request.event;if(!v)return false;
  const people=(v.people||[]).map(p=>p.id),found=rows.filter(r=>String(r.type||'').trim().toLowerCase()===String(v.title).trim().toLowerCase()&&r.start===v.date&&(r.end||r.start)===(v.endDate||v.date)&&String(r.basis||'').trim()===v.time);
  return people.length?people.every(id=>found.some(r=>r.personId===id)):found.some(r=>!r.personId);
 }
 function migrateLegacy(source,isMeeting,newId){
  const store=copy(source),ops=Array.isArray(store.operations)?store.operations:[],meeting=op=>op.collection==='events'&&(isMeeting(op.before||{})||isMeeting(op.after||{}));
  const old=ops.filter(meeting),awaiting=store.awaitingPublished||[],stalePointer=!ops.length&&!!store.requestId;
  const changed=!!old.length||awaiting.some(meeting)||stalePointer;
  if(!changed)return {changed:false,store,requests:[]};
  store.operations=ops.filter(op=>!meeting(op));store.awaitingPublished=awaiting.filter(op=>!meeting(op));
  const requests=old.length?[{requestId:/^[a-f0-9-]{36}$/i.test(store.requestId||'')?store.requestId:newId(),action:old.every(op=>op.after?.status==='Отменена')?'cancel':'edit',operations:old,label:old[0].after?.type||old[0].before?.type||'Ранее отправленные изменения'}]:[];
  if(!store.operations.length){store.requestId=null;store.autoPaused=false;store.autoPull=false}
  return {changed:true,store,requests};
 }
 return {fields,record,planEdit,operations,edit,cancel,isPublished,migrateLegacy};
});
