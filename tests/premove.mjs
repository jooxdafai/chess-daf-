import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
async function fresh(){const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await page.goto(base);return {context,page};}
async function gate(page,failure=false){let release,seen;const waiting=new Promise(r=>{seen=r;});const blocked=new Promise(r=>{release=r;});let first=true;
  await page.route('**/api/games/*/bot',async route=>{if(first){first=false;seen();await blocked;if(failure){await route.fulfill({status:503,json:{error:'Fixture connection failure'}});return;}}await route.continue();});return {waiting,release};}
async function start(page){await page.locator('#new-game').click();await page.locator('#board [data-square="e2"]').click();await page.locator('#board [data-square="e4"]').click();}
async function queue(page,from,to){assert.equal(await page.locator(`#board [data-square="${from}"]`).isEnabled(),true,'own pieces must remain selectable during the opponent request');await page.locator(`#board [data-square="${from}"]`).click();await page.locator(`#board [data-square="${to}"]`).click();}
async function state(page){return await page.evaluate(async()=>{const all=await(await fetch('api/games')).json();return all[0];});}
try{
  {
    const {context,page}=await fresh();const block=await gate(page);let posted=0;
    page.on('request',r=>{if(r.url().endsWith('/move')&&r.postDataJSON()?.uci==='g1f3')posted++;});
    await page.locator('[data-time="60"]').click();await start(page);await block.waiting;await queue(page,'g1','f3');
    assert.equal(await page.locator('#premove-bar').isVisible(),true);
    assert.equal(await page.locator('#board .premove-target').getAttribute('data-square'),'f3');
    await page.locator('#flip').click();assert.equal(await page.locator('#premove-bar').isVisible(),true);
    await page.setViewportSize({width:960,height:540});
    const controls=await page.locator('.board-controls').boundingBox();assert.ok(controls.y+controls.height<=540);
    await page.screenshot({path:'/tmp/chess-daf-premove-short.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    const mobile=await page.locator('.board-controls').boundingBox();assert.ok(mobile.y+mobile.height<=844);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'/tmp/chess-daf-premove-mobile.png',fullPage:true});
    block.release();await page.waitForFunction(()=>document.querySelectorAll('.move-row').length===2&&!document.querySelectorAll('.move-row')[1].textContent.includes('—'));
    const game=await state(page);assert.equal(game.moves[2].uci,'g1f3');assert.equal(game.settings.seconds,60);assert.ok(game.clocks.white>0&&game.clocks.white<=60);assert.equal(posted,1);assert.equal(await page.locator('#premove-bar').isHidden(),true);await context.close();
  }
  for(const cancel of ['button','escape','rightclick']){
    const {context,page}=await fresh();const block=await gate(page);await start(page);await block.waiting;await queue(page,'g1','f3');
    if(cancel==='button')await page.locator('#cancel-premove').click();
    if(cancel==='escape')await page.keyboard.press('Escape');
    if(cancel==='rightclick')await page.locator('#board').click({button:'right'});
    assert.equal(await page.locator('#premove-bar').isHidden(),true);block.release();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
    assert.equal((await state(page)).ply,2);await context.close();
  }
  {
    const {context,page}=await fresh();const block=await gate(page);await start(page);await block.waiting;
    await queue(page,'g1','f3');await queue(page,'b1','c3');block.release();
    await page.waitForFunction(()=>document.querySelectorAll('.move-row').length===2&&!document.querySelector('#hint').disabled);
    assert.equal((await state(page)).moves[2].uci,'b1c3','the latest choice replaces, rather than appends to, the queue');await context.close();
  }
  {
    const {context,page}=await fresh();const block=await gate(page);await start(page);await block.waiting;await queue(page,'a1','a8');block.release();
    await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
    assert.equal((await state(page)).ply,2);assert.equal(await page.locator('#premove-bar').isHidden(),true);
    assert.ok((await page.locator('#notice').textContent()).includes('قانونية'));await context.close();
  }
  {
    const {context,page}=await fresh();const block=await gate(page,true);await start(page);await block.waiting;await queue(page,'g1','f3');block.release();
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Fixture connection failure'));
    assert.equal(await page.locator('#premove-bar').isHidden(),true,'failed requests must clear queued moves');
    await page.locator('#sync').click();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
    assert.equal((await state(page)).ply,2,'resync must not replay the cleared move');await context.close();
  }
  if(!process.env.CHESS_PREMOVE_LIVE){
    const conditional=await fresh();const first=await gate(conditional.page);await start(conditional.page);await first.waiting;
    await queue(conditional.page,'e4','d5');first.release();
    await conditional.page.waitForFunction(()=>document.querySelectorAll('.move-row').length===2&&!document.querySelector('#hint').disabled);
    assert.equal((await state(conditional.page)).moves[2].uci,'e4d5','a capture into a square currently empty can become legal');await conditional.context.close();
    const {context,page}=await fresh();await start(page);await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
    const block=await gate(page);await page.locator('#board [data-square="e4"]').click();await page.locator('#board [data-square="d5"]').click();await block.waiting;
    await queue(page,'d5','d6');block.release();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
    const game=await state(page);assert.equal(game.ply,4);assert.equal(game.moves[3].uci,'d8d5');assert.equal(await page.locator('#premove-bar').isHidden(),true);await context.close();
  }
  {
    const {context,page}=await fresh();const block=await gate(page);await page.locator('#color').selectOption('black');await page.locator('#new-game').click();await block.waiting;
    await queue(page,'b8','c6');block.release();await page.waitForFunction(()=>document.querySelectorAll('.move-row').length===2&&!document.querySelector('#hint').disabled);
    assert.equal((await state(page)).moves[1].uci,'b8c6');await context.close();
  }
  if(!process.env.CHESS_PREMOVE_LIVE){
    const {context,page}=await fresh();const created=await page.evaluate(async()=>await(await fetch('api/fixture/promotion',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json());
    await page.evaluate(id=>localStorage.setItem('chess-daf-game',id),created.id);const block=await gate(page);await page.reload();await block.waiting;
    await queue(page,'a7','a8');await page.locator('[data-promote="n"]').click();block.release();
    await page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('انتهت'));
    const game=await state(page);assert.equal(game.moves[1].uci,'a7a8n');assert.equal(await page.locator('#premove-bar').isHidden(),true);await context.close();
    const mate=await fresh();const seeded=await mate.page.evaluate(async()=>await(await fetch('api/fixture/mate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json());
    await mate.page.evaluate(id=>localStorage.setItem('chess-daf-game',id),seeded.id);const ending=await gate(mate.page);await mate.page.reload();await ending.waiting;
    await queue(mate.page,'b1','c3');const reviewed=mate.page.waitForResponse(r=>r.url().endsWith('/review'));ending.release();
    await mate.page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('انتهت'));
    assert.equal((await reviewed).status(),200,'mate review must remain available in the local fixture');
    assert.equal((await state(mate.page)).ply,1,'no queued move after checkmate');assert.equal(await mate.page.locator('#premove-bar').isHidden(),true);await mate.context.close();
  }
  console.log('PASS: queued once, flip/short layout, three cancellation paths, illegal/captured-source discard, black play and promotion (fixture cases local only).');
}finally{await browser.close();}
