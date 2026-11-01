export const difficultyNames=['مبتدئ مريح','تدريب خفيف','متوسط','قوي','أقصى قوة'];
export function opponentName(game){
  const level=game?.settings.level||1;
  return `${level<=2?'خصم تدريب':'Stockfish'} · ${difficultyNames[level-1]}`;
}
export function difficultyHelp(level){
  return level<=2?'خصم تدريبي مبسّط. في وضع التدريب، التلميحات باختيارك.':'صعوبة أعلى بمحرك Stockfish. المستوى المختار يبدأ مع الماتش الجديد.';
}
export function trainingDelay(game,elapsed=0){
  if(!game||game.result||game.settings.level>2)return 0;
  let target={0:1.2,60:.6,180:.9,600:1.2}[game.settings.seconds]||0;
  if(game.clocks){const remaining=game.clocks[game.turn];target=Math.min(target,Math.max(0,remaining/30),Math.max(0,remaining-.15));}
  return Math.max(0,target-Math.max(0,elapsed));
}
