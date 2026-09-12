import {reminderTime} from './calendar.js';
import {occurrence,nextOccurrence,validateSeries} from './recurrence.js';
async function scheduleSeries(s){
  const name=`series:${s.id}`,next=nextOccurrence(s,Date.now());
  const updated={...s,nextDate:next?.date||null};
  await chrome.storage.local.set({[name]:updated});
  if(next)await chrome.alarms.create(name,{when:next.when});else await chrome.alarms.clear(name);
}
async function deliverSeries(id){
  const key=`series:${id}`,s=(await chrome.storage.local.get(key))[key];if(!s)return;
  const r=s.nextDate?occurrence(s,s.nextDate):null;
  if(r&&r.remind&&!r.firedAt&&r.when<=Date.now()){
    await chrome.notifications.create(`series:${r.id}`,{type:'basic',iconUrl:'assets/icon128.png',title:'روز · یادآوری',message:r.title,contextMessage:r.time,priority:2});
    s.receipts={...s.receipts,[r.date]:{firedAt:Date.now()}};
  }
  await scheduleSeries(s);
}
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(console.error);return task;};
async function deliver(id) {
  const key=`reminder:${id}`, data=await chrome.storage.local.get(key), r=data[key];
  if(!r||r.firedAt||r.expiredOnRestore||r.when>Date.now())return;
  await chrome.notifications.create(`rooz:${id}`,{type:'basic',iconUrl:'assets/icon128.png',title:'روز · یادآوری',message:r.title,contextMessage:`${r.time} · به وقت تهران`,priority:2});
  await chrome.storage.local.set({[key]:{...r,firedAt:Date.now()}});
}
async function reconcile() {
  const all=await chrome.storage.local.get(null);
  for(const [key,r] of Object.entries(all))if(key.startsWith('reminder:')&&!r.firedAt&&!r.expiredOnRestore) {
    if(r.when<=Date.now())await deliver(r.id);
    else if(!await chrome.alarms.get(`rooz:${r.id}`))await chrome.alarms.create(`rooz:${r.id}`,{when:r.when});
  }
  for(const [key,s] of Object.entries(all))if(key.startsWith('series:'))await deliverSeries(s.id);
}
async function handle(message) {
  if(message.type==='save-series'){
    const sourceKey=message.sourceKey;
    if(sourceKey&&!/^(noteitem|note|reminder):[\w-]+$/.test(sourceKey))throw new Error('شناسه نامعتبر است.');
    const source=sourceKey?(await chrome.storage.local.get(sourceKey))[sourceKey]:null;
    if(sourceKey&&!source)throw new Error('این مورد حذف شده است.');
    const old=message.seriesId?(await chrome.storage.local.get(`series:${message.seriesId}`))[`series:${message.seriesId}`]:null;
    if(message.seriesId&&!old)throw new Error('این تکرار حذف شده است.');
    const text=String(message.text||'').trim();if(!text||text.length>10000)throw new Error('متن معتبر وارد کنید.');
    if(old&&message.scope==='one'){
      if(!occurrence(old,message.date))throw new Error('روز معتبر نیست.');
      if(message.remind&&reminderTime(message.date,message.time)<=Date.now())throw new Error('زمان یادآوری باید در آینده باشد.');
      const s={...old,exceptions:{...old.exceptions,[message.date]:{text,time:message.time,remind:!!message.remind}},receipts:{...old.receipts}};
      delete s.receipts[message.date];await scheduleSeries(s);return {};
    }
    const s={id:old?.id||crypto.randomUUID(),start:old?.start||message.date,end:message.end||null,mode:message.mode,days:message.days||[],text,time:message.time,remind:!!message.remind,createdAt:old?.createdAt||Date.now(),exceptions:{},receipts:old?.receipts||{}};
    validateSeries(s);
    if(s.remind&&!nextOccurrence(s,Date.now()))throw new Error('این بازه هیچ یادآوری آینده‌ای ندارد.');
    if(!old&&s.remind&&reminderTime(s.start,s.time)<=Date.now())throw new Error('زمان شروع یادآوری باید در آینده باشد.');
    if(source?.createdAt)s.createdAt=source.createdAt;
    await scheduleSeries(s);
    if(sourceKey){await chrome.storage.local.remove(sourceKey);if(sourceKey.startsWith('reminder:')){await chrome.alarms.clear(`rooz:${sourceKey.slice(9)}`);await chrome.notifications.clear(`rooz:${sourceKey.slice(9)}`);}}
    return {};
  }
  if(message.type==='delete-series'){
    const key=`series:${message.seriesId}`,s=(await chrome.storage.local.get(key))[key];if(!s)return {};
    if(message.scope==='one'){s.exceptions={...s.exceptions,[message.date]:{deleted:true}};await scheduleSeries(s);await chrome.notifications.clear(`series:${s.id}_${message.date}`);}
    else{await chrome.storage.local.remove(key);await chrome.alarms.clear(key);for(const date of Object.keys(s.receipts||{}))await chrome.notifications.clear(`series:${s.id}_${date}`);}
    return {};
  }
  if(message.type==='save-item'){
    const text=String(message.text||'').trim();if(!text||text.length>10000)throw new Error('متن باید بین ۱ تا ۱۰۰۰۰ نویسه باشد.');
    const oldKey=message.key;
    if(oldKey&&!/^(noteitem|note|reminder):[\w-]+$/.test(oldKey))throw new Error('شناسه نامعتبر است.');
    const old=oldKey?(await chrome.storage.local.get(oldKey))[oldKey]:null;
    if(oldKey&&!old)throw new Error('این مورد حذف شده است.');
    const date=oldKey?.startsWith('note:')?oldKey.slice(5):old?.date||message.date;
    reminderTime(date,'12:00');
    const id=oldKey&&!oldKey.startsWith('note:')?oldKey.split(':')[1]:crypto.randomUUID();
    const createdAt=typeof old==='object'&&old?.createdAt?old.createdAt:Date.now();
    let key,value;
    if(message.remind){
      const when=reminderTime(date,message.time),same=oldKey?.startsWith('reminder:')&&old.when===when;
      if(when<=Date.now()&&!same)throw new Error('زمان یادآوری باید در آینده باشد.');
      key=`reminder:${id}`;value={id,title:text,date,time:message.time,when,createdAt,firedAt:same?old.firedAt:null,seenAt:same?old.seenAt:null,expiredOnRestore:same?!!old.expiredOnRestore:false};
      if(!value.firedAt&&!value.expiredOnRestore)await chrome.alarms.create(`rooz:${id}`,{when});
    }else{key=oldKey?.startsWith('note:')?oldKey:`noteitem:${id}`;value=key.startsWith('note:')?text:{date,text,createdAt};}
    try{await chrome.storage.local.set({[key]:value});}catch(error){if(message.remind){if(oldKey?.startsWith('reminder:')&&!old.firedAt)await chrome.alarms.create(`rooz:${id}`,{when:old.when});else await chrome.alarms.clear(`rooz:${id}`);}throw error;}
    if(oldKey&&oldKey!==key)await chrome.storage.local.remove(oldKey);
    if(!message.remind&&oldKey?.startsWith('reminder:')){await chrome.alarms.clear(`rooz:${id}`);await chrome.notifications.clear(`rooz:${id}`);}
    return {key};
  }
  if(message.type==='seen'){
    const now=Date.now(),updates={};
    for(const id of (Array.isArray(message.ids)?message.ids:[]).slice(0,500)){
      if(id.includes('_')){const [seriesId,date]=id.split('_'),key=`series:${seriesId}`,s=updates[key]||(await chrome.storage.local.get(key))[key],r=s&&occurrence(s,date);if(r&&r.when<=now){updates[key]={...s,receipts:{...s.receipts,[date]:{...s.receipts?.[date],seenAt:now}}};}continue;}
      const key=`reminder:${id}`,r=(await chrome.storage.local.get(key))[key];
      if(r&&r.when<=now&&!r.expiredOnRestore&&!r.seenAt)updates[key]={...r,seenAt:now};
    }
    if(Object.keys(updates).length)await chrome.storage.local.set(updates);return {};
  }
  if(message.type==='sync'){await reconcile();return {};}
  if(message.type==='add'){
    const title=String(message.title||'').trim(), when=reminderTime(message.date,message.time);
    if(!title||title.length>180)throw new Error('عنوان یادآور را وارد کنید.');
    if(when<=Date.now())throw new Error('برای یادآور، زمانی در آینده انتخاب کنید.');
    const id=crypto.randomUUID(),r={id,title,date:message.date,time:message.time,when,createdAt:Date.now(),firedAt:null};
    await chrome.storage.local.set({[`reminder:${id}`]:r});
    try{await chrome.alarms.create(`rooz:${id}`,{when});}catch(error){await chrome.storage.local.remove(`reminder:${id}`);throw error;}
    return {reminder:r};
  }
  if(message.type==='delete') {
    await chrome.storage.local.remove(`reminder:${message.id}`);
    await chrome.alarms.clear(`rooz:${message.id}`);
    await chrome.notifications.clear(`rooz:${message.id}`);
    return {};
  }
  throw new Error('درخواست نامعتبر است.');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  serial(()=>handle(message)).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith('series:'))serial(()=>deliverSeries(alarm.name.slice(7)));else if(alarm.name.startsWith('rooz:'))serial(()=>deliver(alarm.name.slice(5)));});
chrome.runtime.onInstalled.addListener(()=>{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});serial(reconcile);});
chrome.runtime.onStartup.addListener(()=>{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});serial(reconcile);});
chrome.notifications.onClicked.addListener(id=>{
  if(id.startsWith('series:')){const item=id.slice(7);serial(()=>handle({type:'seen',ids:[item]}));chrome.tabs.create({url:chrome.runtime.getURL(`sidepanel.html?date=${encodeURIComponent(item.split('_')[1])}`)});return;}
  if(id.startsWith('rooz:')){serial(()=>handle({type:'seen',ids:[id.slice(5)]}));chrome.tabs.create({url:chrome.runtime.getURL(`sidepanel.html?reminder=${encodeURIComponent(id.slice(5))}`)});}
});
serial(reconcile);
// Retire only the old cloud feature's metadata and timer; keep all user records.
serial(async()=>{await chrome.alarms.clear('rooz-drive-backup');await chrome.storage.local.remove('driveState');});
