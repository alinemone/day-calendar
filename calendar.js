export const ZONE = 'Asia/Tehran';
export const DAY = 86400000;
export const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export const weekdays = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
export const fa = value => String(value).replace(/\d/g, n => '۰۱۲۳۴۵۶۷۸۹'[n]);
export const latin = value => String(value).replace(/[۰-۹٠-٩]/g, n => String(n.charCodeAt(0) - (n <= '٩' ? 1632 : 1776)));
const persian = new Intl.DateTimeFormat('en-u-ca-persian', {timeZone:ZONE,year:'numeric',month:'numeric',day:'numeric'});
export function parts(date) {
  const p = Object.fromEntries(persian.formatToParts(date).map(v => [v.type,v.value]));
  return {year:+p.year,month:+p.month,day:+p.day};
}
export function dayKey(date) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const o = Object.fromEntries(p.map(v=>[v.type,v.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
export const fromKey = key => new Date(`${key}T12:00:00+03:30`);
export const addDays = (date,n) => new Date(fromKey(dayKey(date)).getTime()+n*DAY);
export const weekIndex = date => (fromKey(dayKey(date)).getUTCDay()+1)%7;
export const fullDate = date => {const p=parts(date); return `${fa(p.day)} ${months[p.month-1]} ${fa(p.year)}`;};
export function fromPersian(year,month,day) {
  if (![year,month,day].every(Number.isInteger)||year<1200||year>1600||month<1||month>12||day<1||day>31) throw new Error('تاریخ معتبر بین سال‌های ۱۲۰۰ تا ۱۶۰۰ وارد کنید.');
  const target=year*10000+month*100+day;
  let lo=Math.floor(Date.UTC(year+621,0,1)/DAY), hi=Math.floor(Date.UTC(year+622,11,31)/DAY);
  while(lo<=hi) {
    const mid=Math.floor((lo+hi)/2), date=new Date(mid*DAY+12*3600000), p=parts(date), value=p.year*10000+p.month*100+p.day;
    if(value===target)return fromKey(dayKey(date));
    if(value<target)lo=mid+1;else hi=mid-1;
  }
  throw new Error('این روز در تقویم وجود ندارد.');
}
export function parseDate(value,calendar) {
  const match=latin(value).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if(!match)throw new Error('تاریخ را به شکل سال/ماه/روز وارد کنید.');
  const [y,m,d]=match.slice(1).map(Number);
  if(calendar==='persian')return fromPersian(y,m,d);
  const date=new Date(Date.UTC(y,m-1,d,12));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('تاریخ میلادی معتبر نیست.');
  const p=parts(date);if(p.year<1200||p.year>1600)throw new Error('تاریخ خارج از بازهٔ پشتیبانی است.');
  return fromKey(dayKey(date));
}
export function reminderTime(key,time) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('زمان معتبر نیست.');
  // All allowed reminders are future dates; Iran has used UTC+03:30 without DST since 2023.
  const result=new Date(`${key}T${time}:00+03:30`).getTime();
  if(!Number.isFinite(result)||dayKey(new Date(result))!==key)throw new Error('تاریخ معتبر نیست.');
  return result;
}
