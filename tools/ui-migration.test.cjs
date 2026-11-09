const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('retired sync tests disappear from legacy browser data without removing work events', () => {
 const html=fs.readFileSync('index.html','utf8');
 const start=html.indexOf('const RETIRED_TEST_EVENTS=');
 const end=html.indexOf('let db=normalizeDisplayData(load());',start);
 const retired=['SYNC-TEST-20261030-1800','MEET-TEST-1234-R','SYNC-CONTROL-20261030-1700-PRV','SYNC-TEST-20261101','MEET-20261106-1500-TESTCOMP','MEET-20261106-1600-UNKNOWN'];
 const work={id:'work-event',type:'Рабочее совещание',start:'2026-11-04'};
 const context={input:{people:[],tasks:[],birthdays:[],events:[...retired.map(id=>({id,type:'Тест',start:'2026-10-30'})),work]}};
 vm.runInNewContext(html.slice(start,end)+';result=normalizeDisplayData(input)',context);
 assert.equal(context.result.events.some(e=>retired.includes(e.id)),false);
 assert.equal(context.result.events.find(e=>e.id===work.id).type,work.type);
 assert.equal(context.result.events.filter(e=>e.id===work.id).length,1);
});

test('legacy migrations preserve an explicitly edited or cancelled shared event',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('const RETIRED_TEST_EVENTS='),end=html.indexOf('let db=normalizeDisplayData(load());',start);
 const edited={id:'MEET-004-P',personId:'ПРВ',type:'Исправленное название',start:'2026-11-12',end:'2026-11-13',basis:'16:00',status:'Отменена',modifiedAt:'2026-11-09T00:00:00Z'};
 const c={input:{people:[],tasks:[],birthdays:[],events:[edited]}};vm.runInNewContext(html.slice(start,end)+';result=normalizeDisplayData(input)',c);
 const actual=c.result.events.find(e=>e.id===edited.id);for(const k of Object.keys(edited))assert.equal(actual[k],edited[k]);
});
