import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#new-game').click();for(const square of ['e2','e4'])await page.locator(`#board [data-square="${square}"]`).click();
 await page.waitForFunction(()=>!document.querySelector('#hint').disabled);page.on('dialog',d=>d.accept());
 const response=page.waitForResponse(r=>r.url().endsWith('/review'));await page.locator('#resign').click();const received=await response;assert.equal(received.status(),200,'the engine review must be available');const review=await received.json();
 await page.locator('#show-best').waitFor();
 assert.equal(await page.locator('#review-arrows path[data-kind]').count(),review.moves[0].uci===review.moves[0].best_uci?1:2,'review must draw both moves, deduplicating the same recommendation');
 assert.ok(await page.locator('#review-arrows').isVisible());
 assert.ok(await page.locator('#review-callout').isVisible());
 assert.ok((await page.locator('#review-callout').textContent()).length>20);
 assert.equal(await page.locator('#review-position').getAttribute('dir'),'ltr');
 async function boardMatches(fen){
   const expected={};fen.split(' ')[0].split('/').forEach((row,r)=>{let f=0;for(const p of row){if(/\d/.test(p))f+=Number(p);else expected['abcdefgh'[f++]+(8-r)]=p;}});
   const actual=await page.locator('#board .square img').evaluateAll(imgs=>Object.fromEntries(imgs.map(img=>[img.parentElement.dataset.square,img.dataset.piece])));
   assert.deepEqual(actual,expected,'visible pieces must match the verified review frame');
 }
 await boardMatches(review.moves[0].fen_before);
 let writes=0;page.on('request',r=>{if(r.url().endsWith('/move'))writes++;});
 await page.locator('#review-mode').selectOption('played');await page.locator('#review-step').click();await boardMatches(review.moves[0].played_frame.fen);
 assert.ok((await page.locator('#review-callout').textContent()).includes(review.moves[0].played_frame.san));
 await page.locator('#review-mode').selectOption('best');await page.locator('#review-step').click();await boardMatches(review.moves[0].best_frames[0].fen);
 const path=await page.locator('#review-arrows path[data-kind="best"]').getAttribute('d');await page.locator('#flip').click();
 assert.notEqual(await page.locator('#review-arrows path[data-kind="best"]').getAttribute('d'),path);await boardMatches(review.moves[0].best_frames[0].fen);
 await page.locator('#review-mode').selectOption('compare');await page.locator('#review-play').click();
 await page.waitForFunction(()=>document.querySelector('#review-callout').dataset.step==='1');await page.locator('#review-play').click();
 const stopped=await page.locator('#review-step-label').textContent();await page.waitForTimeout(1450);assert.equal(await page.locator('#review-step-label').textContent(),stopped,'pause cancels scheduled playback');
 await page.locator('#review-replay').click();assert.equal(await page.locator('#review-callout').getAttribute('data-step'),'0');
 await page.locator('#review-next').click();assert.equal(await page.locator('#review-position').textContent(),`2 / ${review.moves.length}`);
 await page.locator('#review-prev').click();assert.equal(await page.locator('#review-position').textContent(),`1 / ${review.moves.length}`);
 for(const [width,height]of [[1366,768],[960,540],[390,844],[360,640],[768,1024]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const b=await page.locator('#board').boundingBox(),s=await page.locator('#review-arrows').boundingBox(),c=await page.locator('#review-callout').boundingBox(),nav=await page.locator('#review-nav').boundingBox();
   assert.ok(Math.abs(b.x-s.x)<1&&Math.abs(b.y-s.y)<1&&Math.abs(b.width-s.width)<1&&Math.abs(b.height-s.height)<1);
   assert.ok(c.x>=b.x&&c.x+c.width<=b.x+b.width+1&&c.y>=b.y&&c.y+c.height<=b.y+b.height+1);
   const paragraph=await page.locator('#review-callout p').boundingBox();assert.ok(paragraph.y<c.y+c.height-8,'short boards must still show the explanation, not only its title');
   assert.ok(nav.y+nav.height<=height+1,'review controls must fit');
   if([1366,960,390].includes(width))await page.screenshot({path:`/tmp/chess-daf-board-review-${width}.png`,animations:'disabled'});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#review-step').click();
 assert.equal(await page.locator('#review-arrows').evaluate(e=>e.getAnimations({subtree:true}).length),0);
 assert.equal(await page.locator('#review-callout').evaluate(e=>e.getAnimations().length),0);
 assert.equal(writes,0,'review playback must not submit game moves');assert.ok(await page.locator('#notice').isHidden());
 await page.locator('#review-play').click();await page.locator('#new-game').click();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
 await page.waitForTimeout(1450);assert.ok(await page.locator('#review-arrows').isHidden());assert.ok(await page.locator('#review-callout').isHidden());assert.ok(await page.locator('#review-nav').isHidden());
 assert.deepEqual(errors,[]);
 console.log('PASS: on-board review, exact frames, orientation, replay/step/pause, responsive geometry, reduced motion, read-only playback and new-game cleanup.');
}finally{await browser.close();}
