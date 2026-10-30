const validMove=uci=>typeof uci==='string'&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci);
export function squarePoint(square,flipped=false){
  if(!/^[a-h][1-8]$/.test(square))return null;
  let x=(square.charCodeAt(0)-97)*100+50,y=(8-Number(square[1]))*100+50;
  if(flipped){x=800-x;y=800-y;}return {x,y};
}
export function arrowPath(uci,flipped=false,knight=false){
  if(!validMove(uci))return '';
  const a=squarePoint(uci.slice(0,2),flipped),b=squarePoint(uci.slice(2,4),flipped);
  if(knight&&Math.abs(a.x-b.x)*Math.abs(a.y-b.y)===20000){
    const corner=Math.abs(a.x-b.x)>Math.abs(a.y-b.y)?{x:b.x,y:a.y}:{x:a.x,y:b.y};
    return `M ${a.x} ${a.y} L ${corner.x} ${corner.y} L ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
function pieces(fen){const map={};fen.split(' ')[0].split('/').forEach((row,r)=>{let f=0;for(const p of row){if(/\d/.test(p))f+=Number(p);else map['abcdefgh'[f++]+(8-r)]=p;}});return map;}
export function reviewTimeline(record,mode='compare'){
  const best=(record.best_frames||[]).slice(0,5).filter(f=>validMove(f.uci)&&f.fen&&f.fen_before),actual=record.played_frame;
  const playedArrow=actual&&validMove(actual.uci)?{uci:actual.uci,kind:'played',fen:record.fen_before}:null;
  const bestArrow=best[0]?{uci:best[0].uci,kind:'best',fen:record.fen_before}:null;
  const base={fen:record.fen_before,uci:'',title:'قارن النقلتين',explanation:best.length?`البديل: ${record.explanation}`:actual?.explanation||'',arrows:[playedArrow,bestArrow].filter(Boolean)};
  if(playedArrow?.uci===bestArrow?.uci){base.arrows=[bestArrow];base.title='نفس اختيار المحرك';}
  const played=actual?{...actual,title:`${record.actor||'اللي اتلعب'}: ${actual.san} · ${record.label}`,arrows:[playedArrow].filter(Boolean)}:null;
  const bestStart={...base,title:'نجرب البديل',explanation:record.explanation,arrows:[bestArrow].filter(Boolean)};
  const line=best.map((f,i)=>({...f,title:i?`تكملة المحرك: ${f.san}`:`البديل: ${f.san}`,arrows:[{uci:f.uci,kind:'best',fen:f.fen_before}]}));
  if(mode==='played')return [{...base,title:record.actor||'اللي اتلعب',explanation:actual?.explanation||'',arrows:[playedArrow].filter(Boolean)},played].filter(Boolean);
  if(mode==='best')return [bestStart,...line];
  return [base,played,bestStart,...line].filter(Boolean);
}
export function calloutPosition(fen,arrows,flipped,width=45,height=26){
  const occupied=Object.keys(pieces(fen)).map(sq=>squarePoint(sq,flipped));
  const important=arrows.flatMap(a=>[a.uci.slice(0,2),a.uci.slice(2,4)]).map(sq=>squarePoint(sq,flipped));
  let best={left:2.5,top:30,score:Infinity};
  for(const top of [Math.min(30,97.5-height),Math.min(56.5,97.5-height),3.5,97.5-height])for(const left of [2.5,97.5-width]){
    const inside=p=>p&&p.x>=left*8&&p.x<=(left+width)*8&&p.y>=top*8&&p.y<=(top+height)*8;
    const score=occupied.filter(inside).length+important.filter(inside).length*100;
    if(score<best.score)best={left,top,score};
  }return best;
}

export function createReviewPlayer({svg,callout,controls,flipped,onFrame}){
  const ns='http://www.w3.org/2000/svg';let record=null,frames=[],step=0,mode='compare',timer=null,playing=false;
  const make=(name,attributes={})=>{const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attributes))e.setAttribute(k,v);return e;};
  function pause(){clearTimeout(timer);timer=null;playing=false;controls.play.textContent='▶';controls.play.setAttribute('aria-pressed','false');controls.play.setAttribute('aria-label','تشغيل الشرح');}
  function paint(){
    const frame=frames[step];if(!frame)return;
    svg.replaceChildren();svg.toggleAttribute('hidden',false);callout.hidden=false;
    const defs=make('defs');svg.append(defs);
    for(const kind of ['played','best']){
      const marker=make('marker',{id:`review-head-${kind}`,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:4,markerHeight:4,orient:'auto'});
      marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 Z',fill:kind==='best'?'#b7e581':'#ffbe72'}));defs.append(marker);
    }
    for(const arrow of frame.arrows){
      const path=arrowPath(arrow.uci,flipped(),pieces(arrow.fen)[arrow.uci.slice(0,2)]?.toLowerCase()==='n');
      if(!path)continue;
      const group=make('g',{'class':`review-arrow ${arrow.kind}`});
      group.append(make('path',{d:path,'data-kind':arrow.kind,'data-from':arrow.uci.slice(0,2),'data-to':arrow.uci.slice(2,4),pathLength:1,'marker-end':`url(#review-head-${arrow.kind})`}));svg.append(group);
    }
    svg.setAttribute('aria-label',frame.arrows.map(a=>`${a.kind==='best'?'البديل':'اللي اتلعب'}: ${a.uci.slice(0,2)} إلى ${a.uci.slice(2,4)}`).join(' · '));
    const boardRect=svg.getBoundingClientRect(),wrapRect=svg.parentElement.getBoundingClientRect();
    const compact=boardRect.width<300,width=compact?68:45,height=compact?42:26;
    const placement=calloutPosition(frame.fen,frame.arrows,flipped(),width,height);
    callout.style.left=`${boardRect.left-wrapRect.left+placement.left*boardRect.width/100}px`;
    callout.style.top=`${boardRect.top-wrapRect.top+placement.top*boardRect.height/100}px`;
    callout.style.width=`${width*boardRect.width/100}px`;callout.style.maxHeight=`${height*boardRect.height/100}px`;callout.dataset.compact=compact;
    callout.replaceChildren();const title=document.createElement('strong'),text=document.createElement('p');title.textContent=frame.title;
    const legend=document.createElement('div');legend.className='review-legend';
    for(const kind of new Set(frame.arrows.map(a=>a.kind))){const key=document.createElement('span');key.className=kind;key.textContent=kind==='best'?'● البديل':'● اللي اتلعب';legend.append(key);}
    const explanation=frame.explanation||'',limit=compact?90:155;text.textContent=explanation.length>limit?explanation.slice(0,limit).replace(/\s+\S*$/,'')+'…':explanation;callout.title=explanation;callout.append(title,legend,text);
    callout.dataset.mode=mode;callout.dataset.step=step;
    for(const animation of callout.getAnimations())animation.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)callout.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
  }
  function show(){
    const frame=frames[step];if(!frame)return;
    onFrame({...frame,mode,step,count:frames.length});paint();
    controls.progress.textContent=`${step} / ${frames.length-1}`;
    controls.back.disabled=step===0;controls.next.disabled=step===frames.length-1;controls.mode.value=mode;
  }
  function schedule(){timer=setTimeout(()=>{timer=null;if(!playing)return;if(step<frames.length-1){step++;show();}if(step===frames.length-1)pause();else schedule();},1300);}
  function play(){if(!frames.length)return;if(playing){pause();return;}if(step===frames.length-1){step=0;show();}playing=true;controls.play.textContent='❚❚';controls.play.setAttribute('aria-pressed','true');controls.play.setAttribute('aria-label','إيقاف الشرح');schedule();}
  function load(next,nextMode='compare'){pause();record=next;mode=nextMode;step=0;frames=reviewTimeline(record,mode);show();}
  controls.mode.addEventListener('change',()=>{if(record)load(record,controls.mode.value);});
  controls.back.addEventListener('click',()=>{pause();step=Math.max(0,step-1);show();});
  controls.next.addEventListener('click',()=>{pause();step=Math.min(frames.length-1,step+1);show();});
  controls.replay.addEventListener('click',()=>{pause();step=0;show();});controls.play.addEventListener('click',play);
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  new ResizeObserver(()=>{if(frames.length)paint();}).observe(svg);
  return {load,pause,refresh:()=>{pause();paint();},setMode:value=>{if(record)load(record,value);},
    clear:()=>{pause();record=null;frames=[];step=0;svg.replaceChildren();svg.toggleAttribute('hidden',true);callout.hidden=true;}};
}
