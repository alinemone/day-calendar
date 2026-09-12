import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:360,height:950}});
try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),url=`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`,page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.querySelector('#today-weekday').textContent.length>0);
  await page.locator('#month-title').click();await page.locator('#jump-year').selectOption('1500');await page.getByRole('button',{name:'آذر',exact:true}).click();
  await page.locator('#note').fill('تکرار آزمایشی');await page.locator('#remind-toggle').check();await page.locator('#repeat-options summary').click();await page.locator('#repeat-mode').selectOption('daily');await page.locator('#repeat-end').selectOption('30');await page.locator('#note-form button[type=submit]').click();await page.locator('.saved-note').waitFor();
  let s=await worker.evaluate(async()=>Object.entries(await chrome.storage.local.get(null)).find(([k])=>k.startsWith('series:'))[1]);
  assert.equal(Math.round((new Date(s.end)-new Date(s.start))/86400000),29);assert.equal((await worker.evaluate(()=>chrome.alarms.getAll())).length,1);
  await page.locator('.saved-note .delete-note').click();await page.locator('#series-scope button[value=one]').click();await page.waitForFunction(()=>!document.querySelector('.saved-note'));
  await page.locator('#calendar .day').filter({hasText:/^۲$/}).first().click();await page.locator('.saved-note').waitFor();
  await page.locator('.saved-note').getByRole('button',{name:/^ویرایش یادداشت/}).click();await page.locator('#series-scope button[value=one]').click();await page.getByText('ویرایش یادداشت',{exact:true}).waitFor();await page.locator('#note').fill('ویرایش فقط این روز');await page.locator('#note-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.saved-note p').textContent==='ویرایش فقط این روز');
  await page.locator('.saved-note').getByRole('button',{name:/^ویرایش یادداشت/}).click();await page.locator('#series-scope button[value=all]').click();await page.getByText('ویرایش یادداشت',{exact:true}).waitFor();await page.locator('#note').fill('همه روزها');await page.locator('#repeat-end').selectOption('forever');await page.locator('#note-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.saved-note p').textContent==='همه روزها');
  s=await worker.evaluate(async()=>Object.entries(await chrome.storage.local.get(null)).find(([k])=>k.startsWith('series:'))[1]);assert.equal(s.end,null);assert.deepEqual(s.exceptions,{});
  await page.locator('.saved-note .delete-note').click();await page.locator('#series-scope button[value=all]').click();await page.waitForFunction(()=>!document.querySelector('.saved-note'));assert.equal((await worker.evaluate(()=>chrome.alarms.getAll())).length,0);
  await page.locator('#note').fill('هر شنبه و دوشنبه');await page.locator('#remind-toggle').check();await page.locator('#repeat-options summary').click();await page.locator('#repeat-mode').selectOption('weekly');await page.locator('#repeat-days input[value="0"]').check();await page.locator('#repeat-days input[value="2"]').check();await page.locator('#repeat-end').selectOption('forever');await page.locator('#message').waitFor({state:'hidden'});await page.screenshot({path:path.join(root,'screenshots','recurrence.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#note-form button[type=submit]').click();await page.getByText('ذخیره شد',{exact:true}).waitFor();
  s=await worker.evaluate(async()=>Object.entries(await chrome.storage.local.get(null)).find(([k])=>k.startsWith('series:'))[1]);assert.deepEqual(s.days,[0,2]);assert.equal(s.end,null);
  // Real Chrome alarm, all extension UI pages closed. Accelerate the worker clock only.
  const due=await worker.evaluate(async()=>{const key=Object.keys(await chrome.storage.local.get(null)).find(k=>k.startsWith('series:')),s=(await chrome.storage.local.get(key))[key];return {key,when:(await chrome.alarms.get(key)).scheduledTime};});
  await page.close();
  await worker.evaluate(async({key,when})=>{const realNow=Date.now;Date.now=()=>when;await chrome.alarms.create(key,{when:realNow()+600});},due);
  const deadline=Date.now()+12000;let fired=false;
  while(Date.now()<deadline){fired=await worker.evaluate(async key=>Object.values((await chrome.storage.local.get(key))[key].receipts||{}).some(r=>r.firedAt),due.key);if(fired)break;await new Promise(r=>setTimeout(r,250));}
  assert.equal(fired,true,'Series notification API must run without open panel');
  assert.equal((await worker.evaluate(()=>chrome.alarms.getAll())).length,1);
  assert.deepEqual(errors,[]);console.log('PASS: daily 30-day series, weekly forever, single/all edit/delete, real alarm + notification API with panel closed, next occurrence scheduled.');
}finally{await context.close();}
