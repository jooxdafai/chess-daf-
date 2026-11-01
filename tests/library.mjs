import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/');await page.locator('[data-tab="practice"]').click();
await page.locator('#library-board img').first().waitFor();assert.ok((await page.locator('#library-count').textContent()).includes('10000'));
await page.locator('#library-hint').click();await page.waitForFunction(()=>document.querySelector('#library-feedback').textContent.includes('١/٣'));
await page.locator('#library-hint').click();await page.locator('#library-hint').click();await page.locator('#library-arrows path').waitFor();
const current=await page.evaluate(async()=>{const r=await(await fetch('api/library')).json();return r.items[0];});
for(const sq of ['d3','e3'])await page.locator(`#library-board [data-square="${sq}"]`).click();
await page.waitForFunction(()=>document.querySelector('#library-feedback').textContent.includes('جرّب تاني'));
const a=await page.locator('#library-board [data-square="d3"]').boundingBox(),b=await page.locator('#library-board [data-square="d4"]').boundingBox();
await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();
await page.waitForFunction(()=>document.querySelector('#library-feedback').textContent.includes('صح!'));
await page.waitForFunction(()=>!document.querySelector('#library-hint').disabled);
await page.reload();await page.locator('[data-tab="practice"]').click();await page.locator('#library-board [data-square="d4"] img').waitFor();
for(const sq of ['f4','g5'])await page.locator(`#library-board [data-square="${sq}"]`).click();
await page.waitForFunction(()=>document.querySelector('#library-feedback').textContent.includes('كملت حل'));
await page.waitForFunction(()=>!document.querySelector('#library-solution').disabled);
await page.locator('#library-solution').click();await page.locator('#library-step').waitFor();await page.locator('#library-step').click();
await page.locator('#library-level').selectOption('5');await page.waitForFunction(()=>document.querySelector('#library-list button')?.textContent.includes('مستوى 5'));
for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const box=await page.locator('#library-board').boundingBox();assert.ok(Math.abs(box.width-box.height)<2);assert.equal(await page.locator('#library-board .square').count(),64);}
await page.screenshot({path:'/tmp/chess-library-mobile.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS library: count, levels, progressive hint, arrows, solution frames, mobile.');
}finally{await browser.close();}
