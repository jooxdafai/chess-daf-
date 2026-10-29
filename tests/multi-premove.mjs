import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
const releases=[];
async function choose(page,from,to){for(const sq of [from,to])await page.locator(`#board [data-square="${sq}"]`).click();}
async function fresh(mobile=false){const context=await browser.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1366,height:768}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);return {page,context,close:async()=>{assert.deepEqual(errors,[]);await context.close();}};}
async function botGate(page,number=1){let release,seen,calls=0;const hold=new Promise(r=>release=r),waiting=new Promise(r=>seen=r);releases.push(release);await page.route('**/api/games/*/bot',async route=>{if(++calls===number){seen();await hold;}await route.continue();});return {release,waiting};}
async function start(page){await page.locator('#new-game').click();await choose(page,'e2','e4');}
async function state(page){return page.evaluate(async()=>(await(await fetch('api/games')).json())[0]);}
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#hint').disabled);}
try{
 if(process.env.CHESS_MULTI_LIVE){
   const {page,close}=await fresh(),gate=await botGate(page);await start(page);await gate.waiting;
   await choose(page,'a2','a3');await choose(page,'h2','h3');assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'2');
   gate.release();await ready(page);const game=await state(page);assert.equal(game.moves[2].uci,'a2a3');assert.equal(game.moves[4].uci,'h2h3');assert.ok(await page.locator('#notice').isHidden());await close();
   console.log('PASS: two queued quiet moves on public/native engine.');
 }else{
 const page=await browser.newPage();await page.goto(base);
 let release,seen;const hold=new Promise(r=>release=r),waiting=new Promise(r=>seen=r);let first=true;
 releases.push(release);
 await page.route('**/api/games/*/bot',async route=>{if(first){first=false;seen();await hold;}await route.continue();});
 await page.locator('#new-game').click();await choose(page,'e2','e4');await waiting;
 await choose(page,'g1','f3');await choose(page,'f3','g5');await choose(page,'g5','h7');
 assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'3','successive choices must append, including a piece on its future square');
 const posted=[];page.on('request',r=>{if(r.url().endsWith('/move'))posted.push(r.postDataJSON().uci);});
 release();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
 const game=await page.evaluate(async()=>(await(await fetch('api/games')).json())[0]);
 assert.deepEqual(posted,['g1f3','f3g5','g5h7']);assert.deepEqual([2,4,6].map(i=>game.moves[i].uci),posted);
 assert.ok(await page.locator('#premove-bar').isHidden());assert.ok(await page.locator('#notice').isHidden());
 await page.close();
 {
  const {page,close}=await fresh(),gate=await botGate(page);await start(page);await gate.waiting;
  const before=await page.locator('#board').boundingBox();
  await choose(page,'g1','f3');await choose(page,'f3','g5');await choose(page,'g5','h7');
  await page.locator('#flip').click();assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'3');await page.locator('#flip').click();
  await page.locator('#undo-premove').click();assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'2');
  assert.equal(await page.locator('#board [data-square="g5"] img').getAttribute('data-piece'),'N');assert.equal(await page.locator('#board [data-square="h7"] .queue-order').count(),0);
  await page.locator('#cancel-premove').click();assert.ok(await page.locator('#premove-bar').isHidden());assert.deepEqual(await page.locator('#board').boundingBox(),before);
  assert.equal(await page.locator('#board [data-square="g1"] img').getAttribute('data-piece'),'N');gate.release();await ready(page);assert.equal((await state(page)).ply,2);await close();
 }
 {
  const {page,close}=await fresh(),gate=await botGate(page);await start(page);await gate.waiting;const posted=[];
  page.on('request',r=>{if(r.url().endsWith('/move'))posted.push(r.postDataJSON().uci);});
  await choose(page,'g1','f3');await choose(page,'a1','a8');await choose(page,'b1','c3');gate.release();await ready(page);
  assert.deepEqual(posted,['g1f3'],'an illegal middle move must discard all dependent moves');assert.equal((await state(page)).ply,4);assert.ok(await page.locator('#premove-bar').isHidden());assert.ok((await page.locator('#notice').textContent()).includes('قانونية'));await close();
 }
 {
  const {page,close}=await fresh(),gate=await botGate(page);await start(page);await gate.waiting;
  for(let i=0;i<8;i++)await choose(page,i%2?'f3':'g1',i%2?'g1':'f3');
  assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'8');assert.equal(await page.locator('#board [data-square="g1"] .queue-order').textContent(),'2·4·6·8');
  for(const [width,height]of [[960,540],[390,844]]){await page.setViewportSize({width,height});const controls=await page.locator('.board-controls').boundingBox();assert.ok(controls.y+controls.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.screenshot({path:'/tmp/chess-daf-queue-mobile.png'});await choose(page,'g1','f3');assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'8');
  await page.locator('#cancel-premove').click();gate.release();await ready(page);assert.equal((await state(page)).ply,2);await close();
 }
 {
  const {page,close}=await fresh(),gate=await botGate(page);await start(page);await gate.waiting;await choose(page,'g1','f3');await choose(page,'f3','g5');
  await page.reload();await ready(page);assert.equal((await state(page)).ply,2);assert.ok(await page.locator('#premove-bar').isHidden());gate.release();await close();
 }
 {
  const {page,context,close}=await fresh(true),gate=await botGate(page),touch=await context.newCDPSession(page);await start(page);await gate.waiting;await page.evaluate(()=>scrollTo(0,0));
  for(const [from,to]of [['g1','f3'],['f3','g5']]){const a=await page.locator(`#board [data-square="${from}"]`).boundingBox(),b=await page.locator(`#board [data-square="${to}"]`).boundingBox();
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:a.x+a.width/2,y:a.y+a.height/2}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:b.x+b.width/2,y:b.y+b.height/2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'2');gate.release();await ready(page);const game=await state(page);assert.equal(game.moves[2].uci,'g1f3');assert.equal(game.moves[4].uci,'f3g5');await close();
 }
 for(const kind of ['promotion','mate']){
  const {page,close}=await fresh();const seeded=await page.evaluate(async kind=>await(await fetch(`api/fixture/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json(),kind);
  await page.evaluate(id=>localStorage.setItem('chess-daf-game',id),seeded.id);const gate=await botGate(page);await page.reload();await gate.waiting;
  if(kind==='promotion'){await choose(page,'a7','a8');await page.locator('[data-promote="n"]').click();await choose(page,'h1','g1');}
  else{await choose(page,'b1','c3');await choose(page,'c3','d5');}
  assert.equal(await page.locator('#premove-bar').getAttribute('data-count'),'2');gate.release();await page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('انتهت'));
  const game=await state(page);assert.equal(game.ply,kind==='promotion'?2:1);assert.ok(await page.locator('#premove-bar').isHidden());await close();
 }
 console.log('PASS: dependent order, undo/all, invalid middle, cap/layout, reload, touch, promotion/draw and mate termination.');
 }
}finally{for(const release of releases)release();await browser.close();}
