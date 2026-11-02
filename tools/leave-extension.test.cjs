const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {calculate}=require('../leave-extension.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const cal=html.slice(html.indexOf('const PROD_NONWORK_2026='),html.indexOf("const KEY='"));
const ctx={};vm.runInNewContext(cal+';nonwork=d=>productionDayInfo(d).nonwork;',ctx);
const people=[{id:'a'},{id:'b'}],types=['Отпуск'];
const event=(start,end,personId='a')=>({personId,type:'Отпуск',start,end,status:'План'});
function result(events,year=2026){return calculate(events,people,year,ctx.nonwork,types).find(r=>r.personId==='a')}
test('extension credits boundary weekends and debits weekends inside leave',()=>{
 const r=result([event('2026-10-05','2026-10-16')]);assert.equal(r.bonus.length,4);assert.equal(r.inside.length,2);assert.equal(r.net,2);
});
test('overlapping and adjacent leave periods are merged; shared bonus days count once',()=>{
 const r=result([event('2026-10-05','2026-10-09'),event('2026-10-12','2026-10-16')]);assert.equal(r.bonus.length,6);assert.equal(r.net,6);
 const merged=result([event('2026-10-05','2026-10-08'),event('2026-10-08','2026-10-09'),event('2026-10-10','2026-10-16')]);assert.equal(merged.periods.length,1);assert.equal(merged.net,2);
});
test('production holidays count as loss inside, and working Saturdays stop boundary bonus',()=>{
 const r=result([event('2027-01-01','2027-01-10')],2027);assert.equal(r.inside.length,10);assert.equal(r.bonus.length,0);assert.equal(r.net,-10);
 const transfer=result([event('2027-02-22','2027-02-26')],2027);assert.deepEqual(transfer.before,['2027-02-21']);assert.equal(transfer.inside.length,2);
});
test('cross-year dates are counted only in selected year, cancelled leave excluded, ranking descending',()=>{
 const r=result([event('2026-12-28','2027-01-08')],2027);assert.equal(r.inside.length,8);assert.equal(r.bonus.length,2);assert.equal(r.net,-6);
 const cancelled={...event('2026-10-05','2026-10-09'),status:'Отменена'};assert.equal(result([cancelled]).periods.length,0);
 const ranked=calculate([event('2026-10-05','2026-10-09','b')],people,2026,ctx.nonwork,types);assert.equal(ranked[0].personId,'b');
});
function summerResult(events,year=2027){return calculate(events,people,year,ctx.nonwork,types,{from:'06-01',to:'08-31'}).find(r=>r.personId==='a')}
test('summer debits only June-August dates for leave crossing May and June',()=>{
 const r=summerResult([event('2027-05-31','2027-06-24')]);assert.equal(r.inside.length,7);assert.equal(r.bonus.length,0);assert.equal(r.net,-7);
 assert.equal(r.periods[0].start,'2027-05-31');
});
test('summer preserves actual leave boundaries across August-September and omits outside dates',()=>{
 const r=summerResult([event('2027-08-30','2027-09-03')]);assert.deepEqual(r.bonus,['2027-08-28','2027-08-29']);assert.equal(r.inside.length,0);assert.equal(r.net,2);
 assert.equal(summerResult([event('2027-01-01','2027-01-15')]).periods.length,0);
});
test('summer shares the same overlap and shared-weekend deduplication as annual totals',()=>{
 const r=summerResult([event('2027-07-05','2027-07-09'),event('2027-07-12','2027-07-16'),event('2027-07-05','2027-07-08')]);assert.equal(r.bonus.length,6);assert.equal(r.net,6);
 const annual=result([event('2027-07-05','2027-07-09')],2027);const seasonal=summerResult([event('2027-07-05','2027-07-09')]);assert.equal(annual.net,seasonal.net);
});
