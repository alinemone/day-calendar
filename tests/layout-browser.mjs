import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const page=await context.newPage();
 for(const width of [300,360]){
  await page.setViewportSize({width,height:700});await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await page.waitForFunction(()=>document.querySelector('#today-date').textContent.length>0);await page.evaluate(()=>document.fonts.ready);
  const measure=()=>page.evaluate(()=>({calendar:document.querySelector('#calendar').getBoundingClientRect().top,tabs:document.querySelector('.tabs').getBoundingClientRect().top,width:document.querySelector('main').getBoundingClientRect().width,scroll:scrollY}));
  const before=await measure();await page.locator('#month-title').click();assert.deepEqual(await measure(),before,'Opening month menu must not shift the page');await page.keyboard.press('Escape');assert.deepEqual(await measure(),before);
  if(await page.locator('#calendar .day').count()===7)await page.locator('#week-toggle').click();
  const height=await page.locator('#calendar').evaluate(e=>e.offsetHeight);for(let i=0;i<12;i++){await page.locator('#next').click();assert.equal(await page.locator('#calendar').evaluate(e=>e.offsetHeight),height);}
  await page.locator('#remind-toggle').scrollIntoViewIfNeeded();const tools=await page.locator('.composer-tools').boundingBox();await page.locator('#remind-toggle').check();assert.deepEqual(await page.locator('.composer-tools').boundingBox(),tools);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.locator('#month-title').scrollIntoViewIfNeeded();await page.locator('#month-title').click();await page.screenshot({path:path.join(root,'screenshots','month-picker.png'),fullPage:true});
 console.log('PASS: month menu open/close preserves layout and scroll; 12 months retain height; reminder toggle stays stable; no overflow at 300/360px.');
}finally{await context.close();}
