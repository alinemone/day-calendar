import {test} from 'node:test';
import assert from 'node:assert/strict';
import {occurs,occurrence,nextOccurrence,validateSeries} from '../recurrence.js';
import {dayKey,fromKey,addDays} from '../calendar.js';
const base={id:'test',start:'2026-09-12',end:null,mode:'daily',days:[],text:'یادآور',time:'09:00',remind:true,createdAt:1};
test('30 consecutive days inclusive, crossing month boundary',()=>{
  const s={...base,end:dayKey(addDays(fromKey(base.start),29))};let count=0;
  for(let i=0;i<35;i++)if(occurs(s,dayKey(addDays(fromKey(base.start),i))))count++;
  assert.equal(count,30);assert.equal(nextOccurrence(s,Date.parse('2026-10-12T00:00Z')),null);
});
test('Weekly Saturday/Monday and unlimited far future',()=>{
  const s={...base,mode:'weekly',days:[0,2]};validateSeries(s);
  assert.ok(occurs(s,'2026-09-12'));assert.ok(!occurs(s,'2026-09-13'));assert.ok(occurs(s,'2026-09-14'));
  assert.ok(nextOccurrence(s,Date.parse('2099-01-01T00:00Z')));
  assert.throws(()=>validateSeries({...s,days:[]}));
});
test('Single deletion, single edit and disabled occurrence do not affect siblings',()=>{
  const s={...base,exceptions:{'2026-09-12':{deleted:true},'2026-09-13':{text:'خاص',time:'23:59',remind:false}}};
  assert.equal(occurrence(s,'2026-09-12'),null);assert.equal(occurrence(s,'2026-09-13').title,'خاص');assert.equal(occurrence(s,'2026-09-14').title,base.text);
  assert.equal(nextOccurrence(s,Date.parse('2026-09-11T00:00Z')).date,'2026-09-14');
});

test('Sparse single reminders and skipped weekly occurrences',()=>{
  const notes={...base,remind:false,exceptions:{'2027-05-01':{remind:true}}};
  assert.equal(nextOccurrence(notes,Date.parse('2026-09-11T00:00Z')).date,'2027-05-01');
  const weekly={...base,mode:'weekly',days:[0],exceptions:{'2026-09-12':{deleted:true},'2026-09-19':{deleted:true},'2026-09-26':{deleted:true}}};
  assert.equal(nextOccurrence(weekly,Date.parse('2026-09-11T00:00Z')).date,'2026-10-03');
});
