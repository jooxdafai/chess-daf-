// Real pointer input: a drag must submit one move, not a pair of synthetic clicks.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
async function center(page,square){const r=await page.locator(`#board [data-square="${square}"]`).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};}
async function state(page){return page.evaluate(async()=> (await(await fetch('api/games')).json())[0]);}
async function fresh(mobile=false){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1366,height:768}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  return {page,close:async()=>{assert.deepEqual(errors,[]);await context.close();}};
}
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#hint').disabled);}
async function drag(page,from,to,release=true){
  const a=await center(page,from),b=typeof to==='string'?await center(page,to):to;
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});if(release)await page.mouse.up();
}
async function botGate(page){
  let release,seen;const gate=new Promise(r=>release=r),waiting=new Promise(r=>seen=r);let first=true;
  await page.route('**/api/games/*/bot',async route=>{if(first){first=false;seen();await gate;}await route.continue();});
  return {release,waiting};
}
async function touch(page,session,from,to,end='touchEnd'){
  const a=await center(page,from),b=await center(page,to);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});
  if(end)await session.send('Input.dispatchTouchEvent',{type:end,touchPoints:[]});
}
try{
  {
  const {page,close}=await fresh();await page.locator('[data-time="60"]').click();await page.locator('#new-game').click();await ready(page);
  let posted=0;page.on('request',r=>{if(r.url().endsWith('/move'))posted++;});
  const from=await center(page,'e2'),to=await center(page,'e4');
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});
  assert.equal(await page.locator('.drag-piece').count(),1,'the held piece must follow the pointer');
  assert.equal(await page.locator('.drag-target').getAttribute('data-square'),'e4');
  const ghost=await page.locator('.drag-piece').boundingBox();assert.ok(Math.abs(ghost.x+ghost.width/2-to.x)<1);
  await page.screenshot({path:'/tmp/chess-daf-drag-desktop.png'});
  await page.mouse.up();await page.waitForFunction(()=>document.querySelector('.move-row')&&!document.querySelector('.move-row').textContent.includes('—'));
  assert.equal((await state(page)).moves[0].uci,'e2e4');assert.equal(posted,1);
  assert.equal(await page.locator('.drag-piece').count(),0);await ready(page);
  await page.locator('#board [data-square="g1"]').click();await page.locator('#board [data-square="f3"]').click();await ready(page);
  assert.equal((await state(page)).moves[2].uci,'g1f3');assert.equal(posted,2,'legacy clicks still submit exactly once');
  await page.locator('#board [data-square="g2"]').focus();await page.keyboard.press('Enter');await page.locator('#board [data-square="g3"]').focus();await page.keyboard.press('Enter');await ready(page);
  assert.equal((await state(page)).moves[4].uci,'g2g3');assert.equal(posted,3,'keyboard activation remains usable after a drag');await close();
  }
  {
    const {page,close}=await fresh();await page.locator('#new-game').click();await ready(page);
    for(const [from,to]of [['e2','e5'],['e2','d2'],['e7','e5'],['e2',{x:-15,y:-15}]]){
      await drag(page,from,to);assert.equal((await state(page)).ply,0,'invalid/outside/opponent drags must not move');assert.equal(await page.locator('.drag-piece').count(),0);
    }
    for(const cancel of ['escape','flip','blur']){
      await drag(page,'g1','f3',false);assert.equal(await page.locator('.drag-piece').count(),1);
      if(cancel==='escape')await page.keyboard.press('Escape');
      if(cancel==='flip'){await page.locator('#flip').focus();await page.keyboard.press('Enter');}
      if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      assert.equal(await page.locator('.drag-piece').count(),0);await page.mouse.up();assert.equal((await state(page)).ply,0);
    }
    await drag(page,'g1','f3');await ready(page);assert.equal((await state(page)).moves[0].uci,'g1f3','flipped coordinates must still resolve correctly');await close();
  }
  {
    const {page,close}=await fresh();await page.locator('#color').selectOption('black');await page.locator('#new-game').click();await ready(page);
    await drag(page,'b8','c6');await ready(page);assert.equal((await state(page)).moves[1].uci,'b8c6');await close();
  }
  for(const stale of [false,true]){
    const {page,close}=await fresh(),gate=await botGate(page);await page.locator('#new-game').click();await ready(page);
    await drag(page,'e2','e4');await gate.waiting;await drag(page,'g1','f3',!stale);
    if(stale){assert.equal(await page.locator('.drag-piece').count(),1);gate.release();await ready(page);assert.equal(await page.locator('.drag-piece').count(),0);await page.mouse.up();assert.equal((await state(page)).ply,2,'reply during a drag cancels it instead of moving on a changed board');}
    else{assert.equal(await page.locator('#premove-bar').isVisible(),true);gate.release();await ready(page);const game=await state(page);assert.equal(game.moves[2].uci,'g1f3');assert.equal(game.ply,4);}
    await close();
  }
  {
    const {page,close}=await fresh(true),session=await page.context().newCDPSession(page),gate=await botGate(page);
    await page.locator('#new-game').click();await ready(page);await page.evaluate(()=>scrollTo(0,0));
    const scroll=await page.evaluate(()=>scrollY);
    await touch(page,session,'e2','e4','touchCancel');assert.equal(await page.locator('.drag-piece').count(),0);assert.equal((await state(page)).ply,0);
    await touch(page,session,'e2','e4');await gate.waiting;
    await touch(page,session,'g1','f3',null);assert.equal(await page.locator('.drag-piece').count(),1);await page.screenshot({path:'/tmp/chess-daf-drag-mobile.png'});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('#premove-bar').isVisible(),true);assert.equal(await page.evaluate(()=>scrollY),scroll,'moving a piece must not scroll the page');
    gate.release();await ready(page);assert.equal((await state(page)).moves[2].uci,'g1f3');assert.equal(await page.locator('.drag-piece').count(),0);await close();
  }
  if(!process.env.CHESS_DRAG_LIVE){
    const {page,close}=await fresh();const seeded=await page.evaluate(async()=>await(await fetch('api/fixture/promotion',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json());
    await page.evaluate(id=>localStorage.setItem('chess-daf-game',id),seeded.id);await page.reload();
    await page.waitForFunction(()=>!document.querySelector('#resign').disabled);await drag(page,'a7','a8');
    assert.equal(await page.locator('#promotion').isVisible(),true);await page.locator('[data-promote="n"]').click();
    await page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('انتهت'));
    assert.equal((await state(page)).moves[1].uci,'a7a8n');await close();
  }
  console.log('PASS: mouse/touch drag, exactly once, legacy clicks, invalid drops, cancel/flip/stale board, both colors, premove and local promotion.');
}finally{await browser.close();}
