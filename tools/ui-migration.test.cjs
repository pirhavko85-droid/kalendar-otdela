const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('retired sync tests disappear from legacy browser data without removing work events', () => {
 const html=fs.readFileSync('index.html','utf8');
 const start=html.indexOf('const RETIRED_TEST_EVENTS=');
 const end=html.indexOf('let db=normalizeDisplayData(load());',start);
 const retired=['SYNC-TEST-20261030-1800','MEET-TEST-1234-R','SYNC-CONTROL-20261030-1700-PRV','SYNC-TEST-20261101'];
 const work={id:'work-event',type:'Рабочее совещание',start:'2026-11-04'};
 const context={input:{people:[],tasks:[],birthdays:[],events:[...retired.map(id=>({id,type:'Тест',start:'2026-10-30'})),work]}};
 vm.runInNewContext(html.slice(start,end)+';result=normalizeDisplayData(input)',context);
 assert.equal(context.result.events.some(e=>retired.includes(e.id)),false);
 assert.equal(context.result.events.find(e=>e.id===work.id).type,work.type);
 assert.equal(context.result.events.filter(e=>e.id===work.id).length,1);
});
