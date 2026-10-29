// Pointer input only; the caller owns chess legality and all network writes.
export function attachBoardDrag(board,{canStart,canDrop,positionKey,onStart,onDrop,onCancel}){
  let held=null,suppressClick=false;
  const squareAt=(x,y)=>{
    const square=document.elementFromPoint(x,y)?.closest('[data-square]');
    return square&&board.contains(square)?square:null;
  };
  function clear(){
    const previous=held;held=null;
    previous?.ghost?.remove();board.classList.remove('dragging');
    board.querySelectorAll('.drag-source,.drag-target').forEach(s=>s.classList.remove('drag-source','drag-target'));
    if(previous&&board.hasPointerCapture(previous.id))board.releasePointerCapture(previous.id);
    return previous;
  }
  function cancel(){if(clear()?.active)onCancel();}
  board.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    suppressClick=false;cancel();
    const square=event.target.closest('[data-square]'),image=square?.querySelector('img');
    if(!square||!board.contains(square)||!image||!canStart(square.dataset.square))return;
    held={id:event.pointerId,from:square.dataset.square,key:positionKey(),x:event.clientX,y:event.clientY,
      image:image.cloneNode(),size:image.getBoundingClientRect().width,active:false};
  });
  window.addEventListener('pointermove',event=>{
    if(!held||event.pointerId!==held.id)return;
    if(held.key!==positionKey()||!canStart(held.from)){cancel();return;}
    if(!held.active){
      if(Math.hypot(event.clientX-held.x,event.clientY-held.y)<6)return;
      held.active=true;suppressClick=true;board.setPointerCapture(held.id);
      onStart(held.from);
      held.ghost=held.image;held.ghost.className='drag-piece';held.ghost.setAttribute('aria-hidden','true');
      held.ghost.style.width=`${held.size}px`;held.ghost.style.height=`${held.size}px`;
      document.body.append(held.ghost);board.classList.add('dragging');
      board.querySelector(`[data-square="${held.from}"]`)?.classList.add('drag-source');
    }
    event.preventDefault();
    held.ghost.style.transform=`translate3d(${event.clientX-held.size/2}px,${event.clientY-held.size/2}px,0)`;
    board.querySelector('.drag-target')?.classList.remove('drag-target');
    const target=squareAt(event.clientX,event.clientY);
    if(target&&canDrop(held.from,target.dataset.square))target.classList.add('drag-target');
  },{passive:false});
  window.addEventListener('pointerup',event=>{
    if(!held||event.pointerId!==held.id)return;
    const current=held.key===positionKey(),target=squareAt(event.clientX,event.clientY),previous=clear();
    if(!previous.active)return; // A tap keeps the existing click/keyboard behavior.
    event.preventDefault();
    if(current&&target&&canStart(previous.from)&&canDrop(previous.from,target.dataset.square))onDrop(previous.from,target.dataset.square);
    else onCancel();
  });
  window.addEventListener('pointercancel',event=>{if(held?.id===event.pointerId)cancel();});
  board.addEventListener('lostpointercapture',event=>{if(event.target===board&&held?.id===event.pointerId)cancel();});
  window.addEventListener('blur',cancel);
  board.addEventListener('click',event=>{
    if(suppressClick&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}
  },true);
  board.addEventListener('dragstart',event=>event.preventDefault());
  return {cancel};
}
