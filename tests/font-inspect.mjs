import {chromium} from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:390,height:920}});
try{
let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await page.locator('#today-weekday').waitFor();await page.evaluate(()=>document.fonts.ready);
const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root:doc}=await cdp.send('DOM.getDocument');
for(const selector of ['#today-weekday','#today-date','#note','.day .number']){
 const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector});
 const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
 assert.ok(fonts.length>0,`${selector}: no rendered glyphs`);
 assert.ok(fonts.every(f=>f.isCustomFont&&f.familyName==='Vazirmatn'),`${selector}: wrong rendered font ${JSON.stringify(fonts)}`);
 console.log(`PASS ${selector}: rendered with Vazirmatn`);
}
await page.screenshot({path:path.join(root,'screenshots','font-check.png'),fullPage:true});
}finally{await context.close();}
