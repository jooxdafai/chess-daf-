const $ = (selector) => document.querySelector(selector);
let game = null, selected = null, flipped = false, busy = false, pendingPromotion = null;
let seconds = 0;
let receivedAt = performance.now(), timeoutSync = false;
const pieceNames = {p:'بيدق',n:'حصان',b:'فيل',r:'رخ',q:'وزير',k:'ملك'};
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function notify(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.classList.toggle('error', error); node.hidden = !message;
}
async function api(path, body) {
  const response = await fetch(`api/${path}`, {method: body === undefined ? 'GET':'POST', headers: body === undefined ? {} : {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  if (response.redirected) { location.href = response.url; throw new Error('سجّل دخولك على Joo Flow علشان تكمّل'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'الاتصال اتقطع؛ حاول تاني');
  return data;
}
function position(fen) {
  const map = {}; fen.split(' ')[0].split('/').forEach((row,r) => { let file=0; for (const piece of row) { if (/\d/.test(piece)) file+=Number(piece); else map[`${'abcdefgh'[file++]}${8-r}`]=piece; } }); return map;
}
function drawBoard(fen=game?.fen || startFen) {
  const pieces=position(fen), board=$('#board'); board.replaceChildren();
  const files=[...'abcdefgh'], ranks=[8,7,6,5,4,3,2,1]; if(flipped){files.reverse();ranks.reverse();}
  const last=game?.moves.at(-1)?.uci || '';
  for(const rank of ranks) for(const file of files){
    const sq=file+rank, piece=pieces[sq], b=document.createElement('button'); b.type='button'; b.dataset.square=sq;
    b.className=`square ${(file.charCodeAt(0)-97+rank)%2===0?'dark':''}`;
    b.setAttribute('aria-label',`${sq}${piece ? ` ${piece===piece.toUpperCase()?'أبيض':'أسود'} ${pieceNames[piece.toLowerCase()]}`:''}`);
    b.classList.toggle('selected',sq===selected); b.classList.toggle('last',last.slice(0,2)===sq||last.slice(2,4)===sq);
    if(selected&&game?.legal_moves.some(m=>m.startsWith(selected+sq))){b.classList.add('legal');if(piece)b.classList.add('capture');}
    if(game?.check&&piece?.toLowerCase()==='k'&&(piece===piece.toUpperCase())===(game.turn==='white'))b.classList.add('in-check');
    if(piece){const img=document.createElement('img');img.src=`static/pieces/${piece===piece.toUpperCase()?'w':'b'}${piece.toLowerCase()}.svg`;img.alt='';img.draggable=false;b.append(img);}
    if(file===files[0]){const c=document.createElement('span');c.className='coord';c.textContent=rank;b.append(c);}
    if(rank===ranks.at(-1)){const c=document.createElement('span');c.className='coord file';c.textContent=file;b.append(c);}
    b.addEventListener('click',()=>onSquare(sq));board.append(b);
  }
}
function render(){
  drawBoard(); const list=$('#moves');list.replaceChildren();
  for(let i=0;i<(game?.moves.length||0);i+=2){const row=document.createElement('div');row.className='move-row';for(const text of [i/2+1,game.moves[i].san,game.moves[i+1]?.san||'—']){const s=document.createElement('span');s.textContent=text;row.append(s);}list.append(row);}
  if(!game?.moves.length){const p=document.createElement('p');p.className='empty-hint';p.textContent='أول نقلة مستنيّاك ♙';list.append(p);}list.scrollTop=list.scrollHeight;
  $('#game-status').textContent=game?.result ? `انتهت · ${game.result}`:game ? `${game.turn==='white'?'دور الأبيض':'دور الأسود'}${game.check?' · كش!':''}`:'اختار إعداداتك وابدأ';
  $('#position-label').textContent=game ? `النقلة ${Math.floor(game.ply/2)+1}`:'بداية جديدة، فرصة جديدة';
  $('#opponent-name').textContent=game ? `Stockfish · مستوى ${game.settings.level}`:'Stockfish';
  $('#opponent-status').textContent=game?.settings.mode==='match'?'ماتش من غير مساعدة':'وضع التدريب';
  controls(); clocks();
}
function accept(next){game=next;receivedAt=performance.now();timeoutSync=false;localStorage.setItem('chess-daf-game',game.id);render();}
function controls(){
  $('#hint').disabled=busy||!game||!!game.result||game.settings.mode!=='training'||game.turn!==game.settings.color;
  $('#resign').disabled=busy||!game||!!game.result;
  $('#new-game').disabled=busy;
}
function setBusy(value){busy=value;controls();}
function clocks(){
  const mine=game?.settings.color||'white', other=mine==='white'?'black':'white';
  for(const [id,side] of [['my-clock',mine],['opponent-clock',other]]){
    const node=$(`#${id}`);let value=game?.clocks?.[side];
    if(value!==undefined&&!game.result&&game.turn===side)value=Math.max(0,value-(performance.now()-receivedAt)/1000);
    node.textContent=value===undefined?'∞':`${Math.floor(Math.ceil(value)/60)}:${String(Math.ceil(value)%60).padStart(2,'0')}`;
    node.classList.toggle('active-clock',!!game&&!game.result&&game.turn===side);
    node.classList.toggle('low',value!==undefined&&value<10);
    if(value===0&&!game.result&&!busy&&!timeoutSync){timeoutSync=true;sync();}
  }
}
async function onSquare(square){
  if(!game||busy||game.result||game.turn!==game.settings.color)return;
  if(selected){const moves=game.legal_moves.filter(m=>m.startsWith(selected+square));if(moves.length){if(moves[0].length===5){pendingPromotion=moves;$('#promotion').hidden=false;return;}await play(moves[0]);return;}}
  selected=game.legal_moves.some(m=>m.startsWith(square))?square:null;drawBoard();
}
async function botTurn(){
  if(game&&!game.result&&game.turn!==game.settings.color){$('#opponent-status').textContent='بيفكّر…';accept(await api(`games/${game.id}/bot`,{}));}
}
async function play(uci){setBusy(true);try{selected=null;accept(await api(`games/${game.id}/move`,{uci,ply:game.ply}));notify('');await botTurn();}catch(e){notify(`${e.message} · اضغط تحديث للمحاولة تاني`,true);}finally{setBusy(false);}}
async function newGame(){setBusy(true);try{selected=null;flipped=$('#color').value==='black';accept(await api('games',{mode:$('#mode').value,color:$('#color').value,level:Number($('#level').value),seconds}));notify('بدأنا! اضغط على القطعة، وبعدين على مربع الوصول.');await botTurn();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
async function sync(){if(busy||!game)return;setBusy(true);try{accept(await api(`games/${game.id}`));await botTurn();notify('');}catch(e){notify(e.message,true);}finally{setBusy(false);}}
$('#new-game').addEventListener('click',()=>{if(game&&!game.result)$('#confirm-dialog').showModal();else newGame();});
$('#confirm-new').addEventListener('click',()=>{$('#confirm-dialog').close();newGame();});$('#cancel-new').addEventListener('click',()=>$('#confirm-dialog').close());
$('#flip').addEventListener('click',()=>{flipped=!flipped;drawBoard();});
$('#sync').addEventListener('click',sync);
$('#hint').addEventListener('click',async()=>{setBusy(true);try{const hint=await api(`games/${game.id}/hint`,{});selected=hint.uci.slice(0,2);drawBoard();notify(`جرّب ${hint.san}: من ${hint.uci.slice(0,2)} إلى ${hint.uci.slice(2,4)}. تقييم المحرك تقديري، مش ضمان للنتيجة.`);}catch(e){notify(e.message,true);}finally{setBusy(false);}});
$('#resign').addEventListener('click',async()=>{if(!confirm('تنهي الماتش بالاستسلام؟'))return;setBusy(true);try{accept(await api(`games/${game.id}/resign`,{}));notify('الماتش اتحفظ. نراجع ونتعلّم منه.');}catch(e){notify(e.message,true);}finally{setBusy(false);}});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{const move=pendingPromotion?.find(m=>m.endsWith(b.dataset.promote));$('#promotion').hidden=true;pendingPromotion=null;if(move)play(move);}));
document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{seconds=Number(b.dataset.time);document.querySelectorAll('[data-time]').forEach(n=>n.classList.toggle('selected',n===b));}));
function switchTab(tab){document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));for(const key of ['play','history','practice'])$(`#${key}-view`).hidden=key!==tab;}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{switchTab(b.dataset.tab);if(b.dataset.tab==='history')await history();}));
async function history(){try{const games=await api('games');const list=$('#history-list');list.replaceChildren();if(!games.length)list.textContent='لسه مفيش ماتشات. أول ماتش هو البداية.';for(const g of games){const row=document.createElement('div');row.className='history-item';const info=document.createElement('div');info.textContent=g.result?`النتيجة ${g.result}`:'ماتش محفوظ';const date=document.createElement('small');date.textContent=`${new Date(g.created_at*1000).toLocaleString('ar-EG')} · ${g.ply} نقلة`;info.append(date);const open=document.createElement('button');open.className='secondary';open.textContent='افتح الماتش ↗';open.addEventListener('click',async()=>{selected=null;flipped=g.settings.color==='black';accept(g);switchTab('play');await sync();});row.append(info,open);list.append(row);}}catch(e){notify(e.message,true);}}
drawBoard();
setInterval(clocks,200);
const saved=localStorage.getItem('chess-daf-game');
if(saved){try{accept(await api(`games/${encodeURIComponent(saved)}`));flipped=game.settings.color==='black';await sync();}catch(e){notify(e.message,true);}}
