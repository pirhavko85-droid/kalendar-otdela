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
 assert.equal(ctx.label,'25 + 1 дн.');assert.equal(ctx.cell,'leave-extension');assert.equal(ctx.normal,'leave-main');assert.match(ctx.mobile,/25 \+ 1 дн\./);assert.match(ctx.mobile,/leave-extension-key/);assert.match(ctx.lanes,/year-extension-day/);
 const target={innerHTML:''};ctx.document={getElementById:()=>target};ctx.db={events:[ev]};vm.runInNewContext(piece('function renderLeaveCompactList','function leaveTypes')+';renderLeaveCompactList()',ctx);assert.match(target.innerHTML,/25 \+ 1 дн\./);
});
