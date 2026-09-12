import {dayKey,fromKey,addDays,weekIndex,reminderTime} from './calendar.js';
export function occurs(s,date){return date>=s.start&&(!s.end||date<=s.end)&&(s.mode==='daily'||s.days.includes(weekIndex(fromKey(date))));}
export function occurrence(s,date){
  if(!occurs(s,date)||s.exceptions?.[date]?.deleted)return null;
  const override=s.exceptions?.[date]||{},time=override.time||s.time;
  return {id:`${s.id}_${date}`,seriesId:s.id,date,title:override.text??s.text,time,when:reminderTime(date,time),remind:override.remind??s.remind,createdAt:s.createdAt,...s.receipts?.[date]};
}
export function nextOccurrence(s,after){
  if(!s.remind)return Object.keys(s.exceptions||{}).sort().map(date=>occurrence(s,date)).find(r=>r?.remind&&!r.firedAt&&r.when>after)||null;
  let date=dayKey(new Date(Math.max(after,fromKey(s.start).getTime()-12*3600000)));
  if(date<s.start)date=s.start;
  // A nonempty weekly rule always has an occurrence within 7 days, plus explicit exceptions.
  const limit=8+7*Object.keys(s.exceptions||{}).length;
  for(let i=0;i<limit;i++,date=dayKey(addDays(fromKey(date),1))){
    if(s.end&&date>s.end)return null;
    const r=occurrence(s,date);if(r&&r.remind&&!r.firedAt&&r.when>after)return r;
  }
  return null;
}
export function validateSeries(input){
  if(!['daily','weekly'].includes(input.mode))throw new Error('نوع تکرار معتبر نیست.');
  reminderTime(input.start,input.time);
  if(input.end){reminderTime(input.end,input.time);if(input.end<input.start)throw new Error('پایان باید بعد از شروع باشد.');}
  if(input.mode==='weekly'&&(!Array.isArray(input.days)||!input.days.length||input.days.some(d=>!Number.isInteger(d)||d<0||d>6)))throw new Error('حداقل یک روز هفته را انتخاب کنید.');
}
