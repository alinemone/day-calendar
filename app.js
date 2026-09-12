import {fetchCalendarEvents,clearEventsCache} from './events.js';
import {occurrence,nextOccurrence} from './recurrence.js';
import {ZONE,months,weekdays,fa,parts,dayKey,fromKey,addDays,weekIndex,fullDate,fromPersian,parseDate} from './calendar.js';
const $=id=>document.getElementById(id), isExtension=!!globalThis.chrome?.runtime?.id;
let eventsData={},eventsState='idle',data={},selected=fromKey(dayKey(new Date())),view=parts(selected),weekly=true,preferencesLoaded=false,converted=null,draftDirty=false,messageTimer;
const drafts=new Map();
let editingNote=null,editingSeries=null,editScope=null;
function chooseScope(title){return new Promise(resolve=>{const dialog=$('series-scope');$('scope-title').textContent=title;dialog.returnValue='cancel';dialog.addEventListener('close',()=>resolve(['one','all'].includes(dialog.returnValue)?dialog.returnValue:null),{once:true});dialog.showModal();});}
function repeatDraft(){return {mode:$('repeat-mode').value,end:$('repeat-end').value,duration:$('repeat-duration').value,days:[...document.querySelectorAll('#repeat-days input:checked')].map(e=>+e.value)};}
function restoreRepeat(r){$('repeat-mode').value=r.mode;$('repeat-end').value=r.end;$('repeat-duration').value=r.duration;document.querySelectorAll('#repeat-days input').forEach(e=>e.checked=r.days.includes(+e.value));updateRepeat();}
function updateRepeat(){$('repeat-days').hidden=$('repeat-mode').value!=='weekly';$('repeat-end-row').hidden=$('repeat-mode').value==='none';$('repeat-duration').hidden=$('repeat-end').value!=='custom';}
function resetRepeat(){$('repeat-mode').querySelector('[value=none]').disabled=false;$('repeat-options').open=false;$('repeat-mode').disabled=false;$('repeat-end').disabled=false;$('repeat-duration').disabled=false;document.querySelectorAll('#repeat-days input').forEach(e=>{e.disabled=false;e.checked=false;});$('repeat-edit-hint').hidden=true;restoreRepeat({mode:'none',end:'30',duration:'30',days:[]});}
function loadRepeat(s,scope){resetRepeat();$('repeat-mode').querySelector('[value=none]').disabled=true;const duration=s.end?Math.round((fromKey(s.end)-fromKey(s.start))/86400000)+1:30;restoreRepeat({mode:s.mode,end:s.end?'custom':'forever',duration:String(duration),days:s.days});$('repeat-options').open=true;$('repeat-mode').disabled=scope==='one';if(scope==='one'){$('repeat-end').disabled=true;$('repeat-duration').disabled=true;document.querySelectorAll('#repeat-days input').forEach(e=>e.disabled=true);}$('repeat-edit-hint').hidden=false;$('repeat-edit-hint').textContent=scope==='one'?'فقط این روز تغییر می‌کند.':'از تاریخ شروع اصلی؛ تغییرات تکی قبلی بازنشانی می‌شوند.';}
function repeatPayload(){const r=repeatDraft(),start=editingSeries?data[`series:${editingSeries}`].start:dayKey(selected);const count=Number(r.end==='custom'?r.duration:r.end);if(r.end!=='forever'&&(!Number.isInteger(count)||count<1||count>36500))throw new Error('تعداد روز بین ۱ و ۳۶۵۰۰ باشد.');return {mode:r.mode,days:r.days,end:r.end==='forever'?null:dayKey(addDays(fromKey(start),count-1))};}
weekdays.forEach((name,i)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=String(i);label.append(input,document.createTextNode(name));$('repeat-days').append(label);});
$('repeat-options').addEventListener('change',()=>{draftDirty=true;updateRepeat();});
const creationClock=new Intl.DateTimeFormat('fa-IR',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function creationLabel(timestamp){
  if(!Number.isFinite(timestamp))return null;
  const date=new Date(timestamp);if(Number.isNaN(date.getTime()))return null;
  const label=document.createElement('time');label.className='created-time';label.dateTime=date.toISOString();
  label.textContent=`ثبت ${creationClock.format(date)}`;
  label.title=`ثبت در ${fullDate(date)}، ساعت ${creationClock.format(date)} به وقت تهران`;
  label.setAttribute('aria-label',label.title);return label;
}
const storage=isExtension?chrome.storage.local:{async get(){return JSON.parse(localStorage.getItem('rooz-preview')||'{}');},async set(values){data={...data,...values};localStorage.setItem('rooz-preview',JSON.stringify(data));},async remove(key){delete data[key];localStorage.setItem('rooz-preview',JSON.stringify(data));}};
function notesFor(date){
  const notes=Object.entries(data).filter(([key,n])=>key.startsWith('noteitem:')&&n.date===date).map(([key,n])=>({...n,key})).sort((a,b)=>a.createdAt-b.createdAt);
  // Read legacy notes in place: no destructive migration, even across multiple open panels.
  if(typeof data[`note:${date}`]==='string'&&data[`note:${date}`].trim())notes.unshift({key:`note:${date}`,text:data[`note:${date}`],date});
  return notes;
}
function updateComposer(){ document.querySelector('#note-form button[type="submit"]').textContent=editingNote?'ذخیره تغییرات':'ثبت';$('cancel-note').hidden=!editingNote;$('reminder-time-row').hidden=!$('remind-toggle').checked;const [hour,minute]=$('reminder-time').value.split(':');$('reminder-hour').value=hour;$('reminder-minute').value=minute; }
function renderNotes(){
  const list=$('day-notes');list.replaceChildren();
  const notes=[...notesFor(dayKey(selected)),...seriesFor(dayKey(selected)).filter(r=>!r.remind).map(r=>({...r,key:`series:${r.seriesId}`,text:r.title})),...reminders().filter(r=>r.date===dayKey(selected)).map(r=>({...r,key:r.seriesId?`series:${r.seriesId}`:`reminder:${r.id}`,text:r.title}))].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  for(const note of notes){
    const article=document.createElement('article');article.className='saved-note';article.dataset.kind=(note.key.startsWith('reminder:')||note.remind)?'reminder':'note';
    const text=document.createElement('p');text.textContent=note.text;if((note.key.startsWith('reminder:')||note.remind)){const clock=document.createElement('span');clock.className='item-alarm';clock.textContent=`${note.firedAt||note.expiredOnRestore?'یادآوری‌شده':'یادآوری'} · ${fa(note.time)}`;article.append(clock);}
    const actions=document.createElement('div');actions.className='note-actions';
    const created=creationLabel(note.createdAt);if(created)actions.append(created);
    const edit=document.createElement('button');edit.className='text-button';edit.textContent='ویرایش';edit.setAttribute('aria-label',`ویرایش یادداشت ${note.text.slice(0,40)}`);
    edit.addEventListener('click',async()=>{if(draftDirty){notify('ابتدا یادداشت در حال نوشتن را ذخیره کنید.');return;}if(note.seriesId){const scope=await chooseScope('ویرایش تکرار');if(!scope)return;editingSeries=note.seriesId;editScope=scope;loadRepeat(data[`series:${note.seriesId}`],scope);}else{editingSeries=null;editScope=null;resetRepeat();}editingNote=note.key;$('note').value=note.text;$('remind-toggle').checked=(note.key.startsWith('reminder:')||note.remind);$('reminder-time').value=note.time||'09:00';updateComposer();$('note-status').textContent='ویرایش یادداشت';$('note').focus({preventScroll:true});});
    const remove=document.createElement('button');remove.className='text-button delete-note';remove.textContent='حذف';remove.setAttribute('aria-label',`حذف یادداشت ${note.text.slice(0,40)}`);
    remove.addEventListener('click',async()=>{remove.disabled=true;try{if(note.seriesId){const scope=await chooseScope('حذف تکرار');if(!scope){remove.disabled=false;return;}await request({type:'delete-series',seriesId:note.seriesId,date:note.date,scope});}else if((note.key.startsWith('reminder:')||note.remind))await request({type:'delete',id:note.id});else await storage.remove(note.key);if(editingNote===note.key){editingNote=null;editingSeries=null;editScope=null;resetRepeat();draftDirty=false;$('note').value='';$('remind-toggle').checked=false;drafts.delete(note.date);updateComposer();}await refresh();notify('یادداشت حذف شد.');}catch{remove.disabled=false;notify('حذف انجام نشد؛ دوباره تلاش کنید.');}});
    actions.append(edit,remove);article.append(text,actions);list.append(article);
  }
}
function notify(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').hidden=true,4000);}
const series=()=>Object.entries(data).filter(([k])=>k.startsWith('series:')).map(([,s])=>s);
const seriesFor=date=>series().map(s=>occurrence(s,date)).filter(Boolean);
const reminders=()=>{const all=Object.entries(data).filter(([k])=>k.startsWith('reminder:')).map(([,r])=>r);for(const s of series()){const dates=new Set([dayKey(selected),...Object.keys(s.receipts||{}),...(s.nextDate?[s.nextDate]:[])]);let after=Date.now();for(let i=0;i<30;i++){const n=nextOccurrence(s,after);if(!n)break;dates.add(n.date);after=n.when;}for(const date of dates){const r=occurrence(s,date);if(r?.remind)all.push(r);}}return all.sort((a,b)=>a.when-b.when);};
let reminderFilter='due',markingSeen=false,homeTab='day',homeScroll=0;
const isUpcoming=r=>r.when>Date.now()&&!r.firedAt&&!r.expiredOnRestore;
const isUnread=r=>r.when<=Date.now()&&!r.seenAt&&!r.expiredOnRestore;
function renderAlerts(){
  const items=reminders(),unread=items.filter(isUnread).length;
  $('alert-count').hidden=!unread;$('alert-count').textContent=unread?fa(unread):'';
  $('upcoming-count').textContent=items.some(isUpcoming)?` (${fa(items.filter(isUpcoming).length)})`:'';
  document.querySelectorAll('[data-reminder-filter]').forEach(button=>{const active=button.dataset.reminderFilter===reminderFilter;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active)$('all-reminders').setAttribute('aria-labelledby',button.id);});
  renderReminders($('all-reminders'),items.filter(r=>reminderFilter==='upcoming'?isUpcoming(r):!isUpcoming(r)).sort((a,b)=>reminderFilter==='upcoming'?a.when-b.when:b.when-a.when),true);
}
async function markVisibleRemindersSeen(){
  if(markingSeen||reminderFilter!=='due'||$('alerts-panel').hidden)return;
  const ids=reminders().filter(isUnread).map(r=>r.id);if(!ids.length)return;
  markingSeen=true;
  try{if(isExtension)await request({type:'seen',ids});else{const now=Date.now();await storage.set(Object.fromEntries(ids.map(id=>[`reminder:${id}`,{...data[`reminder:${id}`],seenAt:now}])));}await refresh();}catch(error){notify(error.message);}finally{markingSeen=false;}
}
document.querySelectorAll('[data-reminder-filter]').forEach(button=>button.addEventListener('click',()=>{reminderFilter=button.dataset.reminderFilter;renderAlerts();markVisibleRemindersSeen();}));
async function request(message){if(!isExtension)throw new Error('برای اعلان واقعی، افزونه را در کروم نصب کنید.');const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'ثبت تغییر انجام نشد. دوباره تلاش کنید.');return result;}
function showTab(tab){
  if(tab==='alerts'){
    homeScroll=window.scrollY;closeMonthPicker();$('home-screen').hidden=true;$('alerts-panel').hidden=false;
    reminderFilter='due';renderAlerts();markVisibleRemindersSeen();window.scrollTo(0,0);$('back-home').focus({preventScroll:true});return;
  }
  homeTab=tab;$('home-screen').hidden=false;$('alerts-panel').hidden=true;
  for(const name of ['day','convert'])$(`${name}-panel`).hidden=name!==tab;
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
$('back-home').addEventListener('click',()=>{showTab(homeTab);window.scrollTo(0,homeScroll);$('open-alerts').focus({preventScroll:true});});
document.querySelector('.reminder-filters').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'due':e.key==='End'?'upcoming':reminderFilter==='due'?'upcoming':'due';const button=document.querySelector(`[data-reminder-filter="${next}"]`);button.click();button.focus();});
const gregorianHeader=new Intl.DateTimeFormat('fa-IR',{calendar:'gregory',timeZone:ZONE,year:'numeric',month:'long',day:'numeric'});
const hijriHeader=new Intl.DateTimeFormat('fa-IR',{calendar:'islamic-civil',timeZone:ZONE,year:'numeric',month:'long',day:'numeric'});
function renderToday(){const now=new Date();$('today-weekday').textContent=weekdays[weekIndex(now)];$('today-date').textContent=fullDate(now);$('today-gregorian').textContent=gregorianHeader.format(now)+' میلادی';$('today-gregorian').dateTime=dayKey(now);$('today-hijri').textContent=hijriHeader.format(now)+' قمری';}
let eventsRequestKey='',eventsGeneration=0;
function renderCalendar(){
  void loadEvents();
  $('week-toggle').textContent=weekly?'نمای ماهانه':'نمای هفتگی';
  document.querySelectorAll('.weekdays span').forEach((el,i)=>el.textContent=weekdays[i]);
  $('month-title').textContent=`${months[view.month-1]} ${fa(view.year)}`;$('calendar').replaceChildren();
  const first=fromPersian(view.year,view.month,1),start=weekly?addDays(selected,-weekIndex(selected)):addDays(first,-weekIndex(first));
  const length=weekly?7:42;
  for(let i=0;i<length;i++){
    const date=addDays(start,i),p=parts(date),key=dayKey(date),button=document.createElement('button');button.className='day';
    for(const [name,yes] of [['outside',p.month!==view.month],['friday',weekIndex(date)===6],['holiday',eventsData[key]?.holiday===true],['today',key===dayKey(new Date())],['selected',key===dayKey(selected)]])button.classList.toggle(name,yes);
    button.setAttribute('aria-label',`${weekdays[weekIndex(date)]} ${fullDate(date)}`);button.setAttribute('aria-pressed',String(key===dayKey(selected)));if(key===dayKey(new Date()))button.setAttribute('aria-current','date');
    const number=document.createElement('span');number.className='number';number.textContent=fa(p.day);button.append(number);
    const dots=document.createElement('span');dots.className='dots';
    if(notesFor(key).length||seriesFor(key).some(r=>!r.remind)){const dot=document.createElement('i');dot.className='note-dot';dots.append(dot);}
    if([...reminders(),...seriesFor(key)].some(r=>r.date===key&&(r.remind??true)&&!r.firedAt&&!r.expiredOnRestore)){const dot=document.createElement('i');dot.className='reminder-dot';dots.append(dot);}
    button.append(dots);button.addEventListener('click',()=>selectDay(date));$('calendar').append(button);
  }
  $('prev').disabled=view.year===1200&&view.month===1;$('next').disabled=view.year===1600&&view.month===12;
}
function selectDay(date,navigate=true){if(parts(date).year<1200||parts(date).year>1600)return;if(draftDirty)drafts.set(dayKey(selected),{text:$('note').value,key:editingNote,remind:$('remind-toggle').checked,time:$('reminder-time').value,repeat:repeatDraft(),series:editingSeries,scope:editScope});selected=date;view=parts(date);const draft=drafts.get(dayKey(selected));draftDirty=!!draft;editingNote=draft?.key??null;editingSeries=draft?.series??null;editScope=draft?.scope??null;resetRepeat();if(editingSeries&&data[`series:${editingSeries}`])loadRepeat(data[`series:${editingSeries}`],editScope);if(draft?.repeat)restoreRepeat(draft.repeat);$('note').value=draft?.text??'';$('remind-toggle').checked=draft?.remind??false;$('reminder-time').value=draft?.time||'09:00';updateComposer();$('note-status').textContent=draftDirty?'تغییرات ذخیره نشده':'';renderCalendar();renderDay();if(navigate)showTab('day');}
function renderDay(){const e=eventsData[dayKey(selected)];$('selected-title').textContent=fullDate(selected);$('selected-relative').textContent=dayKey(selected)===dayKey(new Date())?'امروز':weekdays[weekIndex(selected)];renderNotes();const line=$('day-events');line.replaceChildren();if(e?.events?.length||e?.holiday){line.className='event-line';if(e.holiday){const label=document.createElement('p');label.className='event-holiday';label.textContent='تعطیل';line.append(label);}for(const title of e.events||[]){const row=document.createElement('p');row.textContent=title;line.append(row);}}else line.className='event-line empty-events';}
function renderReminders(container,items,all){
  container.replaceChildren();if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent=all?'هنوز یادآوری ندارید.':'برای این روز یادآوری ثبت نشده.';container.append(p);return;}
  for(const r of items){const row=document.createElement('div');row.className=`reminder${r.firedAt?' done':''}`;const time=document.createElement('time');time.textContent=fa(r.time);const content=document.createElement('div');content.className='content';const title=document.createElement('strong');title.textContent=r.title;const detail=document.createElement('small');detail.textContent=`${all?fullDate(fromKey(r.date))+' · ':''}${r.expiredOnRestore?'گذشته · بازیابی‌شده':r.firedAt?'اعلان ارسال شد':r.when<Date.now()?'در انتظار ارسال':'در انتظار یادآوری'}`;content.append(title,detail);const created=creationLabel(r.createdAt);if(created)content.append(created);const del=document.createElement('button');del.className='delete';del.textContent='×';del.setAttribute('aria-label',`حذف یادآور ${r.title}`);del.addEventListener('click',async()=>{try{if(r.seriesId){const scope=await chooseScope('حذف تکرار');if(!scope)return;await request({type:'delete-series',seriesId:r.seriesId,date:r.date,scope});}else await request({type:'delete',id:r.id});await refresh();notify('یادآور حذف شد.');}catch(e){notify(e.message);}});row.append(time,content,del);container.append(row);}
}
async function loadEvents(force=false){
  const years=[view.year];if(view.year!==parts(selected).year)years.push(parts(selected).year);
  const key=years.join(':');if(!force&&key===eventsRequestKey)return;
  eventsRequestKey=key;const generation=++eventsGeneration;
  try{
    const results=await Promise.all(years.map(year=>fetchCalendarEvents(year)));
    if(generation!==eventsGeneration)return;
    eventsData=Object.fromEntries(results.flatMap(result=>Object.entries(result).map(([date,item])=>{const [y,m,d]=date.split('-').map(Number);return [dayKey(fromPersian(y,m,d)),item];})));
    eventsState='ok';
  }catch(error){if(generation!==eventsGeneration)return;eventsData={};eventsState='error';console.warn('Calendar events unavailable:',error.message);}
  renderCalendar();renderDay();
}
async function refresh(){data=await storage.get(null);if(!preferencesLoaded){weekly=data.viewMode!=='month';preferencesLoaded=true;}renderCalendar();renderDay();renderAlerts();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
$('open-alerts').addEventListener('click',()=>showTab('alerts'));
$('today').addEventListener('click',()=>selectDay(fromKey(dayKey(new Date()))));
function closeMonthPicker(focus=false){$('month-picker').hidden=true;$('month-title').setAttribute('aria-expanded','false');if(focus)$('month-title').focus({preventScroll:true});}
function renderMonthChoices(){
  $('jump-months').replaceChildren(...months.map((name,index)=>{
    const button=document.createElement('button');button.type='button';button.textContent=name;
    button.setAttribute('aria-pressed',String(index+1===view.month&&+$('jump-year').value===view.year));
    button.addEventListener('click',()=>{
      const date=fromPersian(+$('jump-year').value,index+1,1);
      weekly=false;closeMonthPicker();selectDay(date);
      storage.set({viewMode:'month'}).catch(()=>notify('ذخیره تنظیمات انجام نشد.'));
      document.querySelector('#calendar .selected')?.focus({preventScroll:true});
    });return button;
  }));
}
$('month-title').addEventListener('click',()=>{
  if(!$('month-picker').hidden){closeMonthPicker();return;}
  fillChoices('jump-year',Array.from({length:401},(_,i)=>1200+i),fa,view.year);renderMonthChoices();
  $('month-picker').hidden=false;$('month-title').setAttribute('aria-expanded','true');$('jump-year').focus({preventScroll:true});
});
$('jump-year').addEventListener('change',renderMonthChoices);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('month-picker').hidden){e.preventDefault();closeMonthPicker(true);}});
document.addEventListener('click',e=>{if(!$('month-picker').hidden&&!$('month-picker').contains(e.target)&&!$('month-title').contains(e.target))closeMonthPicker();});
for(const [id,delta] of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{if(weekly){selectDay(addDays(selected,delta*7));return;}let month=view.month+delta,year=view.year;if(month<1){month=12;year--;}if(month>12){month=1;year++;}view={year,month};renderCalendar();});
$('week-toggle').addEventListener('click',()=>{weekly=!weekly;storage.set({viewMode:weekly?'week':'month'}).catch(()=>notify('ذخیره تنظیمات انجام نشد.'));view=parts(selected);$('week-toggle').textContent=weekly?'نمای ماهانه':'نمای هفتگی';renderCalendar();});
$('note').addEventListener('input',()=>{draftDirty=true;$('note-status').textContent='تغییرات ذخیره نشده';});
$('remind-toggle').addEventListener('change',()=>{draftDirty=true;updateComposer();});
for(const [id,length] of [['reminder-hour',24],['reminder-minute',60]]){
  $(id).replaceChildren(...Array.from({length},(_,i)=>{const value=String(i).padStart(2,'0');return new Option(fa(value),value);}));
  $(id).addEventListener('change',()=>{$('reminder-time').value=`${$('reminder-hour').value}:${$('reminder-minute').value}`;draftDirty=true;});
}
$('cancel-note').addEventListener('click',()=>{editingNote=null;editingSeries=null;editScope=null;resetRepeat();draftDirty=false;drafts.delete(dayKey(selected));$('note').value='';$('remind-toggle').checked=false;$('note-status').textContent='';updateComposer();});
$('note-form').addEventListener('submit',async e=>{
  e.preventDefault();const date=dayKey(selected),value=$('note').value,key=editingNote??`noteitem:${crypto.randomUUID()}`,button=e.submitter;
  if(!value.trim()){notify('متن یادداشت را وارد کنید.');return;}button.disabled=true;
  try{
    if(isExtension&&(editingSeries||$('repeat-mode').value!=='none')){await request({type:'save-series',sourceKey:editingSeries?null:editingNote,seriesId:editingSeries,scope:editScope,date,text:value,remind:$('remind-toggle').checked,time:$('reminder-time').value,...repeatPayload()});}else if(isExtension)await request({type:'save-item',key:editingNote,date,text:value,remind:$('remind-toggle').checked,time:$('reminder-time').value});else {if($('remind-toggle').checked)throw new Error('یادآوری فقط در افزونه فعال است.');await storage.set({[key]:key.startsWith('note:')?value:{date,text:value,createdAt:data[key]?.createdAt??Date.now()}});}
    const draft=drafts.get(date);if(draft?.text===value)drafts.delete(date);
    if(dayKey(selected)===date&&$('note').value===value){draftDirty=false;editingNote=null;editingSeries=null;editScope=null;resetRepeat();$('note').value='';$('remind-toggle').checked=false;drafts.delete(date);updateComposer();$('note-status').textContent='ذخیره شد';}
    await refresh();
  }catch(error){notify(error.message||'ذخیره انجام نشد.');}finally{button.disabled=false;}
});
window.addEventListener('beforeunload',e=>{if(draftDirty||drafts.size){e.preventDefault();e.returnValue='';}});
const gregorianMonths=['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
function fillChoices(id,values,label,wanted){const select=$(id);select.replaceChildren(...values.map(value=>new Option(label(value),String(value))));select.value=String(values.includes(+wanted)?+wanted:values[Math.max(0,values.length-1)]);}
function validConversionDays(year,month){
  if($('calendar-type').value==='persian'){
    let length=month<=6?31:30;
    if(month===12){try{fromPersian(year,12,30);}catch{length=29;}}
    return Array.from({length},(_,i)=>i+1);
  }
  const length=new Date(Date.UTC(year,month,0)).getUTCDate(),days=[];
  for(let day=1;day<=length;day++){const p=parts(new Date(Date.UTC(year,month-1,day,12)));if(p.year>=1200&&p.year<=1600)days.push(day);}
  return days;
}
function updateConversionChoices(month=$('convert-month').value,day=$('convert-day').value){
  const year=+$('convert-year').value,validMonths=[];
  for(let m=1;m<=12;m++)if(validConversionDays(year,m).length)validMonths.push(m);
  const names=$('calendar-type').value==='persian'?months:gregorianMonths;
  fillChoices('convert-month',validMonths,m=>$('calendar-type').value==='gregorian'?`${m}-${names[m-1]}`:names[m-1],month);
  fillChoices('convert-day',validConversionDays(year,+$('convert-month').value),fa,day);
  $('convert-result').textContent='';$('go-converted').hidden=true;
}
function initializeConverter(date=new Date()){
  const persian=$('calendar-type').value==='persian',p=persian?parts(date):Object.fromEntries(dayKey(date).split('-').map((value,i)=>[['year','month','day'][i],+value]));
  const start=persian?1200:1821,end=persian?1600:2222;
  fillChoices('convert-year',Array.from({length:end-start+1},(_,i)=>start+i),fa,p.year);updateConversionChoices(p.month,p.day);
}
$('calendar-type').addEventListener('change',()=>initializeConverter(converted||new Date()));
$('convert-year').addEventListener('change',()=>updateConversionChoices());
$('convert-month').addEventListener('change',()=>updateConversionChoices());
$('convert-day').addEventListener('change',()=>{$('convert-result').textContent='';$('go-converted').hidden=true;});
$('convert-form').addEventListener('submit',e=>{e.preventDefault();try{converted=parseDate(`${$('convert-year').value}/${$('convert-month').value}/${$('convert-day').value}`,$('calendar-type').value);$('convert-result').className='';$('convert-result').textContent=$('calendar-type').value==='persian'?`${dayKey(converted)}\n${new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,dateStyle:'full'}).format(converted)}`:`${fullDate(converted)}\n${weekdays[weekIndex(converted)]}`;$('go-converted').hidden=false;}catch(error){$('convert-result').className='error';$('convert-result').textContent=error.message;$('go-converted').hidden=true;}});
initializeConverter();
$('go-converted').addEventListener('click',()=>selectDay(converted));
try{await refresh();selectDay(selected);renderToday();if(isExtension){chrome.storage.onChanged.addListener(async(changes,area)=>{if(area!=='local')return;await refresh();});await request({type:'sync'});const dateParam=new URLSearchParams(location.search).get('date');if(dateParam&&/^\d{4}-\d{2}-\d{2}$/.test(dateParam))selectDay(fromKey(dateParam));const id=new URLSearchParams(location.search).get('reminder');if(id&&data[`reminder:${id}`])selectDay(fromKey(data[`reminder:${id}`].date));}}catch(error){notify(error.message);}
let lastToday=dayKey(new Date());setInterval(()=>{renderToday();renderAlerts();markVisibleRemindersSeen();const today=dayKey(new Date());if(today!==lastToday){const follow=dayKey(selected)===lastToday;lastToday=today;if(follow)selectDay(fromKey(today),false);else{renderCalendar();renderDay();}}},15000);

$('clear-events').addEventListener('click',async()=>{clearEventsCache();eventsData={};await loadEvents(true);renderCalendar();renderDay();notify('کش مناسبت‌ها پاک شد.');});
