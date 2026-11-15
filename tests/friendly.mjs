import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 assert.equal(await page.locator('#level').inputValue(),'1','the interface must start with a comfortable beginner');
 assert.equal(await page.locator('#mode').inputValue(),'training');assert.ok(await page.locator('[data-time="0"]').evaluate(e=>e.classList.contains('selected')));
 let release,seen,first=true;const held=new Promise(r=>release=r),waiting=new Promise(r=>seen=r);
 await page.route('**/api/games/*/bot',async route=>{if(first){first=false;seen();await held;}await route.continue();});
 await page.locator('#new-game').click();await page.locator('#board [data-square="e2"]').click();const started=Date.now();await page.locator('#board [data-square="e4"]').click();
 assert.ok((await page.locator('#opponent-name').textContent()).includes('خصم تدريب'));
 await page.waitForFunction(()=>document.querySelector('#opponent-status').textContent.includes('خصم التدريب'));
 const quiet=page.waitForResponse(r=>r.url().endsWith('/bot'));await waiting;assert.ok(Date.now()-started>=900,'untimed beginner response should give time to see the board');release();await quiet;await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
 assert.ok(await page.locator('#hint').isEnabled());
 await page.locator('#level').selectOption('3');assert.ok((await page.locator('#opponent-name').textContent()).includes('خصم تدريب'),'changing the menu must not silently strengthen the current game');
 await page.locator('#new-game').click();await page.locator('#confirm-new').click();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
 assert.ok((await page.locator('#opponent-name').textContent()).includes('Stockfish'));
 assert.deepEqual(errors,[]);console.log('PASS: beginner default, untimed training, honest opponent label, paced status, optional hints and manual difficulty on a new game.');
}finally{await browser.close();}
