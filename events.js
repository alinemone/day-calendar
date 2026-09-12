// Provider adapter: replacing the upstream API only requires changing fetchEvents.
const ENDPOINT='https://pnldev.com/api/calender';
const TTL=10*86400000,KEY='events-cache-v1';
export function normalizeEvents(payload,date){
  const result=payload?.result;
  if(!result||typeof result!=='object') return {date,holiday:false,events:[]};
  const events=Array.isArray(result.event)?result.event.filter(x=>typeof x==='string'&&x.trim()):[];
  return {date,holiday:result.holiday===true,events};
}
export async function fetchEvents(date,{signal}={}){
  const [year,month,day]=date.split('-');
  const response=await fetch(`${ENDPOINT}?year=${year}&month=${month}&day=${day}`,{signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`events http ${response.status}`);
  return normalizeEvents(await response.json(),date);
}
export async function fetchCalendarEvents(year,month,storage=globalThis.localStorage){
  const key=`${year}-${month||0}`,now=Date.now();let cache={};try{cache=JSON.parse(storage?.getItem(KEY)||'{}')}catch{}
  if(cache[key]&&cache[key].expires>now)return cache[key].days;
  const query=month?`?year=${year}&month=${month}`:`?year=${year}`;
  const response=await fetch(`${ENDPOINT}${query}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('events http');
  const raw=await response.json(),days={};const source=raw?.result||{};
  for(const [m,v] of Object.entries(source))for(const [d,item] of (month?[[m,v]]:Object.entries(v||{}))){const date=`${year}-${String(month||m).padStart(2,'0')}-${String(month?m:d).padStart(2,'0')}`;days[date]={date,holiday:item?.holiday===true,events:Array.isArray(item?.event)?item.event.filter(Boolean):[]};}
  try{cache[key]={expires:now+TTL,days};storage?.setItem(KEY,JSON.stringify(cache));}catch{}
  return days;
}
export function clearEventsCache(storage=globalThis.localStorage){try{storage?.removeItem(KEY)}catch{}}
