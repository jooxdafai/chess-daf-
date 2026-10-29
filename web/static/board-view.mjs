// Visual projections only. The server remains authoritative for rules and clocks.
export function projectMove(pieces,uci){
  const next={...pieces},from=uci.slice(0,2),to=uci.slice(2,4),piece=next[from];
  if(!piece)return next;
  delete next[from];
  if(piece.toLowerCase()==='p'&&from[0]!==to[0]&&!pieces[to]){
    const captured=to[0]+from[1];
    if(next[captured]===(piece==='P'?'p':'P'))delete next[captured];
  }
  if(piece.toLowerCase()==='k'&&from[0]==='e'&&Math.abs(to.charCodeAt(0)-from.charCodeAt(0))===2){
    const rookFrom=(to[0]==='g'?'h':'a')+from[1],rookTo=(to[0]==='g'?'f':'d')+from[1];
    if(next[rookFrom]===(piece==='K'?'R':'r')){next[rookTo]=next[rookFrom];delete next[rookFrom];}
  }
  next[to]=uci[4]?(piece===piece.toUpperCase()?uci[4].toUpperCase():uci[4]):piece;
  return next;
}

export function createBoardView(board,onSquare){
  const squares=new Map(),images=new Map(),animations=new WeakMap();
  let previous={},orientation=null;
  for(const file of 'abcdefgh')for(let rank=1;rank<=8;rank++){
    const sq=file+rank,button=document.createElement('button');button.type='button';button.dataset.square=sq;
    button.addEventListener('click',()=>onSquare(sq));squares.set(sq,button);
    for(const name of ['rank','file']){const coordinate=document.createElement('span');coordinate.className=`coord ${name==='file'?'file':''}`;coordinate.dataset.coord=name;button.append(coordinate);}
  }
  function render(pieces,{flipped=false,animate=true,move=''}={}){
    const turned=orientation!==flipped,changed=Object.keys({...previous,...pieces}).some(sq=>previous[sq]!==pieces[sq]);
    if(turned){
      const files=[...'abcdefgh'],ranks=[8,7,6,5,4,3,2,1];if(flipped){files.reverse();ranks.reverse();}
      for(const rank of ranks)for(const file of files){
        const b=squares.get(file+rank);board.append(b);
        const r=b.querySelector('[data-coord="rank"]'),f=b.querySelector('[data-coord="file"]');
        r.textContent=rank;r.hidden=file!==files[0];f.textContent=file;f.hidden=rank!==ranks.at(-1);
      }
    }
    if(changed){
      const old=[...images].map(([sq,img])=>({sq,img,piece:previous[sq],rect:img.getBoundingClientRect()})),used=new Set(),next=new Map();
      for(const [sq,piece]of Object.entries(pieces)){
        let entry=old.find(e=>!used.has(e)&&e.sq===sq&&e.piece===piece);
        if(!entry&&sq===move.slice(2,4))entry=old.find(e=>!used.has(e)&&e.sq===move.slice(0,2));
        if(entry){used.add(entry);next.set(sq,entry);}
      }
      // Stationary pieces have been claimed first; remaining matches are moved pieces.
      for(const [sq,piece]of Object.entries(pieces))if(!next.has(sq)){
        const entry=old.find(e=>!used.has(e)&&e.piece===piece);
        if(entry){used.add(entry);next.set(sq,entry);}
      }
      for(const entry of old){animations.get(entry.img)?.cancel();if(!used.has(entry))entry.img.remove();}
      images.clear();
      for(const [sq,piece]of Object.entries(pieces)){
        const entry=next.get(sq),img=entry?.img||document.createElement('img');
        const src=`static/pieces/${piece===piece.toUpperCase()?'w':'b'}${piece.toLowerCase()}.svg`;
        if(img.getAttribute('src')!==src)img.src=src;
        img.alt='';img.draggable=false;img.dataset.piece=piece;squares.get(sq).append(img);images.set(sq,img);
      }
      if(animate&&!turned&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        for(const [sq,entry]of next){
          const img=images.get(sq),to=img.getBoundingClientRect(),dx=entry.rect.left-to.left,dy=entry.rect.top-to.top;
          if(Math.abs(dx)+Math.abs(dy)<1)continue;
          img.style.zIndex='2';
          const motion=img.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:110,easing:'ease-out'});
          animations.set(img,motion);motion.finished.catch(()=>{}).finally(()=>{if(animations.get(img)===motion)img.style.zIndex='';});
        }
      }
    }else if(turned){for(const img of images.values())animations.get(img)?.cancel();}
    previous={...pieces};orientation=flipped;
    return squares;
  }
  return {render};
}
