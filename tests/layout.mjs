// Geometry regression: board, both clocks and controls must fit a desktop viewport.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.CHESS_PLAYWRIGHT_MODULE||'@playwright/test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18972/';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const sizes=[[1366,768],[2000,1050],[1440,900],[1280,720],[1024,600],[960,540],[1920,650]];
async function desktopCheck(label){
  const metrics=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    return {viewport:{width:innerWidth,height:innerHeight},scrollHeight:document.documentElement.scrollHeight,
      board:rect('#board'),topClock:rect('#opponent-clock'),bottomClock:rect('#my-clock'),controls:rect('.board-controls'),
      newGame:rect('#new-game'),setup:rect('.setup'),coach:rect('.coach')};
  });
  for(const key of ['board','topClock','bottomClock','controls','newGame','setup','coach']){
    const r=metrics[key],v=metrics.viewport;
    assert.ok(r.top>=-1&&r.bottom<=v.height+1,`${label}: ${key} clipped vertically: ${JSON.stringify(metrics)}`);
    assert.ok(r.left>=-1&&r.right<=v.width+1,`${label}: ${key} clipped horizontally`);
  }
  assert.ok(Math.abs(metrics.board.width-metrics.board.height)<1,`${label}: board must stay square`);
  assert.ok(metrics.board.width>=200,`${label}: desktop board became too small`);
  assert.ok(metrics.scrollHeight<=metrics.viewport.height+1,`${label}: game page must not need vertical scrolling`);
}
try{
  await page.setViewportSize({width:1366,height:768});await page.goto(base);
  for(const [width,height]of sizes){await page.setViewportSize({width,height});await desktopCheck(`${width}x${height} initial`);}
  await page.setViewportSize({width:1366,height:768});
  await page.locator('#new-game').click();
  await page.locator('#board [data-square="e2"]').click();await page.locator('#board [data-square="e4"]').click();
  await page.waitForFunction(()=>document.querySelector('.move-row')&&!document.querySelector('.move-row').textContent.includes('—'));
  await page.locator('#hint').click();await page.waitForFunction(()=>!document.querySelector('#hint').disabled);
  for(const [width,height]of sizes){await page.setViewportSize({width,height});await desktopCheck(`${width}x${height} with notice`);}
  await page.setViewportSize({width:1366,height:768});
  await page.screenshot({path:'/tmp/chess-daf-fit-laptop.png',fullPage:true});
  page.on('dialog',d=>d.accept());await page.locator('#resign').click();await page.locator('#show-best').waitFor();
  for(const [width,height]of sizes){await page.setViewportSize({width,height});await desktopCheck(`${width}x${height} review`);}
  await page.setViewportSize({width:960,height:540});await page.screenshot({path:'/tmp/chess-daf-fit-short.png',fullPage:true});
  await page.locator('.coach').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  await page.locator('#review-next').click();await desktopCheck('review navigation after sidebar scroll');
  await page.locator('#promotion').evaluate(e=>{e.hidden=false;});
  const popup=await page.locator('#promotion').boundingBox();
  for(const button of await page.locator('#promotion [data-promote]').all()){
    const r=await button.boundingBox();
    assert.ok(r.x>=popup.x-1&&r.x+r.width<=popup.x+popup.width+1,'promotion choices must not be clipped on the smaller board');
  }
  await page.locator('#promotion').evaluate(e=>{e.hidden=true;});
  for(const [width,height]of [[390,844],[360,640],[768,1024],[844,390]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no horizontal overflow ${width}x${height}`);
    const b=await page.locator('#board').boundingBox();assert.ok(Math.abs(b.width-b.height)<1,'mobile board stays square');
    if(width<500){const bottom=await page.locator('.board-controls').boundingBox();assert.ok(bottom.y+bottom.height<=height+1,`mobile board/clocks/controls must fit ${width}x${height}`);}
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/chess-daf-fit-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'مبارياتي',exact:true}).click();await page.locator('#history-list .history-item').first().waitFor();
  await page.getByRole('button',{name:'تدرّب',exact:true}).click();await page.locator('#practice-board img').last().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop height fit, square board, visible clocks/controls/new-game, notice/review states, sidebar scroll, mobile/tablet and other tabs.');
}finally{await browser.close();}
