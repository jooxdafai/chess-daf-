import {projectMove} from './board-view.mjs';
export const MAX_PREMOVES=8;
// Potential destinations only. The server's new legal_moves list decides execution.
export function candidatePremoves(pieces,color,from){
  const piece=pieces[from];
  if(!piece||(piece===piece.toUpperCase())!==(color==='white'))return [];
  const result=[],files='abcdefgh',x=files.indexOf(from[0]),y=Number(from[1]),type=piece.toLowerCase();
  for(let tx=0;tx<8;tx++)for(let ty=1;ty<=8;ty++){
    const to=files[tx]+ty,target=pieces[to],dx=Math.abs(tx-x),dy=Math.abs(ty-y);
    if(!dx&&!dy||target&&(target===target.toUpperCase())===(color==='white'))continue;
    let possible=false;
    if(type==='n')possible=dx*dy===2;
    if(type==='b')possible=dx===dy;
    if(type==='r')possible=dx===0||dy===0;
    if(type==='q')possible=dx===dy||dx===0||dy===0;
    if(type==='k')possible=Math.max(dx,dy)===1||(from===(color==='white'?'e1':'e8')&&dy===0&&dx===2);
    if(type==='p'){
      const forward=(ty-y)*(color==='white'?1:-1);
      possible=(forward===1&&dx<=1)||(forward===2&&dx===0&&y===(color==='white'?2:7));
    }
    if(possible){
      if(type==='p'&&(ty===1||ty===8))for(const suffix of ['q','r','b','n'])result.push(from+to+suffix);
      else result.push(from+to);
    }
  }
  return result;
}

export function resolvePremove(queued,game){
  return queued&&game&&queued.gameId===game.id&&!game.result&&game.ply===queued.ply+1
    &&game.turn===game.settings.color&&game.legal_moves.includes(queued.uci)?queued.uci:null;
}

export function projectQueue(pieces,queue){
  return queue.reduce((view,item)=>projectMove(view,item.uci),{...pieces});
}

export function appendPremove(queue,game,pieces,uci){
  if(!game||game.result||game.turn===game.settings.color||queue.length>=MAX_PREMOVES)return null;
  if(queue.some((item,i)=>item.gameId!==game.id||item.ply!==game.ply+i*2))return null;
  const view=projectQueue(pieces,queue),from=uci.slice(0,2);
  if(!candidatePremoves(view,game.settings.color,from).includes(uci))return null;
  return [...queue,{gameId:game.id,ply:game.ply+queue.length*2,uci}];
}
