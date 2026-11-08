const test=require('node:test'),assert=require('node:assert/strict');
const {parse,format,moscowToday}=require('../event-draft.js');
test('relative dates follow Moscow including year boundary',()=>{
 assert.equal(moscowToday(new Date('2026-12-31T22:00:00Z')),'2027-01-01');
 assert.equal(parse('Совещание послезавтра в 11:30','2026-12-31').date,'2027-01-02');
 assert.equal(parse('Встреча завтра в 11 часов','2026-11-08').time,'11:00');
});
test('explicit Russian dates validate instead of rolling into another month',()=>{
 assert.equal(parse('Совещание 9 ноября в 12:30','2026-11-08').date,'2026-11-09');
 assert.equal(parse('Совещание 31.02.2027 в 11:00','2026-11-08').date,'');
 assert.equal(parse('Совещание 29 февраля 2028 года','2026-11-08').date,'2028-02-29');
 assert.equal(parse('Совещание 9 ноября 2027 года','2026-11-08').date,'2027-11-09');
});
test('uncertain or conflicting date/time never silently invents a schedule',()=>{
 const d=parse('Совещание завтра 12 ноября в 11:70','2026-11-08');
 assert.equal(d.time,'');assert.ok(d.warning.some(x=>x.includes('различаются')));
 assert.equal(parse('Встреча в одиннадцать','2026-11-08').time,'');
 assert.equal(parse('Встреча в 5 вечера','2026-11-08').time,'17:00');
});
test('copy output is a request to write with selected participants, not a saved claim',()=>{
 const t=format({title:'Совещание',date:'2026-11-09',time:'11:00',people:['Павел Х.','Роман П.'],note:''});
 assert.ok(t.includes('09.11.2026'));assert.ok(t.includes('Павел Х., Роман П.'));
 assert.ok(t.includes('Проверь отсутствие дубля'));assert.ok(!t.includes('успешно сохранено'));
});
