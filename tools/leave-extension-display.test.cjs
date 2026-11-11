const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function piece(from,to){return html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)))}
test('OP names use surname and initials while own department names remain unchanged',()=>{
 const ctx={person:()=>null};vm.runInNewContext(piece('function birthdayDisplayName','function nonworkBands')+';a=birthdayDisplayName({name:"Фамилия Имя Отчество",affiliation:"ОП"});b=birthdayDisplayName({name:"Юлия Г.",affiliation:"Наш отдел"})',ctx);assert.equal(ctx.a,'Фамилия И.О.');assert.equal(ctx.b,'Юлия Г.');
});
test('additional leave date is a blue cell and displayed as base days plus one in all lists',()=>{
 const ctx={eventDisplayDays:e=>e.days,esc:x=>String(x),person:()=>({short:'Сотрудник'}),effectiveEventStatus:()=> 'План',fmtShort:x=>x,fmtShortYear:x=>x,dayWord:()=> 'дней',daysInMonth:()=>30,overlapRange:()=>({start:1,end:25})};
 const ev={id:'sample',type:'Основной отпуск',personId:'p',start:'2027-05-31',end:'2027-06-25',days:26,extensionDates:['2027-06-25']};ctx.ev=ev;
 vm.runInNewContext(piece('function leaveExtensionDates','function monthItems')+piece('function monthItems','function renderLeaveCompactList')+';label=leaveDaysLabel(ev);cell=leaveCellClass(ev,"2027-06-25");normal=leaveCellClass(ev,"2027-06-24");mobile=monthMobileList([ev],2027,5,"leave");lanes=renderYearLanes([ev],2027,5,"leave");',ctx);
 assert.equal(ctx.label,'25 + 1 дн.');assert.equal(ctx.cell,'leave-extension');assert.equal(ctx.normal,'leave-main');assert.match(ctx.mobile,/25 \+ 1 дн\./);assert.match(ctx.mobile,/leave-extra-count/);assert.match(ctx.lanes,/year-extension-day/);
 const target={innerHTML:''};ctx.document={getElementById:()=>target};ctx.db={events:[ev]};vm.runInNewContext(piece('function renderLeaveCompactList','function leaveTypes')+';renderLeaveCompactList()',ctx);assert.match(target.innerHTML,/25 \+ 1 дн\./);
});

 test('travel occupies the final calendar days, never VBD or an unspecified plan',()=>{
 const ctx={};vm.runInNewContext(piece('function leaveExtensionDates','function monthItems'),ctx);
 for(const [end,n,start] of [['2026-07-18',4,'2026-07-15'],['2026-09-16',4,'2026-09-13'],['2026-09-09',2,'2026-09-08']]){
 const ev={type:'Основной отпуск',start:'2026-06-01',end,travelDays:n,extensionDates:[]};
 const dates=ctx.leaveTravelDates(ev);assert.equal(dates.length,n);assert.equal(dates[0],start);assert.equal(dates.at(-1),end);assert.equal(ctx.leaveCellClass(ev,end),'leave-extension leave-travel');
 }
 assert.equal(ctx.leaveTravelDates({type:'Отпуск ВБД',start:'2026-01-01',end:'2026-01-15',travelDays:2}).length,0);
 assert.equal(ctx.leaveTravelDates({type:'Основной отпуск',start:'2027-07-01',end:'2027-07-15'}).length,0);
 const saturday={type:'Основной отпуск',start:'2026-06-01',end:'2026-06-27',extensionDates:['2026-06-27'],status:'План'};assert.equal(ctx.leaveCellClass(saturday,'2026-06-27'),'leave-extension');assert.equal(ctx.leaveCellClass(saturday,'2026-06-26'),'leave-main');
 });
