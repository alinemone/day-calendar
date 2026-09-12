import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parts,fromPersian,dayKey,fromKey,parseDate,reminderTime,weekIndex,addDays} from '../calendar.js';
test('time.ir verified reference: 2026-09-12 is Saturday 1405/06/21',()=>{
  assert.deepEqual(parts(fromKey('2026-09-12')),{year:1405,month:6,day:21});
  assert.equal(weekIndex(fromKey('2026-09-12')),0);
  assert.equal(dayKey(fromPersian(1405,6,21)),'2026-09-12');
});
test('Nowruz and leap Esfand',()=>{
  assert.equal(dayKey(fromPersian(1403,1,1)),'2024-03-20');
  assert.equal(dayKey(fromPersian(1403,12,30)),'2025-03-20');
  assert.equal(dayKey(fromPersian(1404,1,1)),'2025-03-21');
  assert.throws(()=>fromPersian(1404,12,30));
  assert.throws(()=>fromPersian(1405,7,31));
});
test('Tehran midnight independent of host timezone',()=>{
  assert.equal(dayKey(new Date('2026-09-12T20:29:59Z')),'2026-09-12');
  assert.equal(dayKey(new Date('2026-09-12T20:30:00Z')),'2026-09-13');
  assert.equal(new Date(reminderTime('2026-09-13','00:00')).toISOString(),'2026-09-12T20:30:00.000Z');
  assert.throws(()=>reminderTime('2026-02-30','09:00'));
  assert.throws(()=>reminderTime('2026-09-13','25:00'));
});
test('Persian and Arabic digits; reject overflow and malformed dates',()=>{
  for(const input of ['۱۴۰۵/۰۶/۲۱','١٤٠٥/٠٦/٢١','1405-6-21'])assert.equal(dayKey(parseDate(input,'persian')),'2026-09-12');
  assert.throws(()=>parseDate('2025/02/29','gregorian'));
  assert.throws(()=>parseDate('2026/13/01','gregorian'));
  assert.throws(()=>parseDate('hello','persian'));
  assert.equal(dayKey(parseDate('2024/02/29','gregorian')),'2024-02-29');
});
test('Round trip every day 2020–2035',()=>{
  for(let date=fromKey('2020-01-01');dayKey(date)<'2036-01-01';date=addDays(date,1)){
    const p=parts(date);assert.equal(dayKey(fromPersian(p.year,p.month,p.day)),dayKey(date));
  }
});
