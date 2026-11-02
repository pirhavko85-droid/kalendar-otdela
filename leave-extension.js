// Pure calculation shared by the holiday-extension view and its tests.
(function(root){
 function shift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
 function calculate(events,people,year,isNonwork,types){
  const first=year+'-01-01',last=year+'-12-31';
  return people.map((p,index)=>{
   const list=events.filter(e=>e.personId===p.id&&types.includes(e.type)&&e.start&&e.status!=='Отменена').map(e=>({start:e.start,end:e.end||e.start})).filter(e=>e.end>=e.start).sort((a,b)=>a.start.localeCompare(b.start));
   const merged=[];for(const e of list){const prev=merged[merged.length-1];if(prev&&e.start<=shift(prev.end,1)){if(e.end>prev.end)prev.end=e.end}else merged.push({...e})}
   const before=new Set(),after=new Set(),inside=new Set(),periods=[];
   for(const period of merged){if(period.end<first||period.start>last)continue;const record={...period,before:[],after:[],inside:[]};
    for(let day=period.start<first?first:period.start;day<=period.end&&day<=last;day=shift(day,1))if(isNonwork(day)){inside.add(day);record.inside.push(day)}
    for(let day=shift(period.start,-1);day>=first&&day<=last&&isNonwork(day);day=shift(day,-1)){before.add(day);record.before.unshift(day)}
    for(let day=shift(period.end,1);day>=first&&day<=last&&isNonwork(day);day=shift(day,1)){after.add(day);record.after.push(day)}
    periods.push(record);
   }
   const bonus=new Set([...before,...after]);for(const day of inside)bonus.delete(day);
   return {personId:p.id,index,periods,before:[...before].sort(),after:[...after].sort(),bonus:[...bonus].sort(),inside:[...inside].sort(),net:bonus.size-inside.size};
  }).sort((a,b)=>b.net-a.net||b.bonus.length-a.bonus.length||a.index-b.index);
 }
 root.LeaveExtension={calculate,shift};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.LeaveExtension;
})(typeof globalThis==='undefined'?this:globalThis);
