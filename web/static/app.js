const $ = (selector) => document.querySelector(selector);
let game = null, selected = null, flipped = false, busy = false, pendingPromotion = null;
let seconds = 0;
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
}
async function onSquare(square){
  if(!game||busy||game.result)return;
  if(selected){const moves=game.legal_moves.filter(m=>m.startsWith(selected+square));if(moves.length){if(moves[0].length===5){pendingPromotion=moves;$('#promotion').hidden=false;return;}await play(moves[0]);return;}}
  selected=game.legal_moves.some(m=>m.startsWith(square))?square:null;drawBoard();
}
async function play(uci){busy=true;try{game=await api(`games/${game.id}/move`,{uci,ply:game.ply});selected=null;notify('');render();}catch(e){notify(e.message,true);}finally{busy=false;}}
async function newGame(){busy=true;$('#new-game').disabled=true;try{game=await api('games',{});selected=null;flipped=false;notify('بدأنا! اضغط على القطعة، وبعدين على مربع الوصول.');render();}catch(e){notify(e.message,true);}finally{busy=false;$('#new-game').disabled=false;}}
$('#new-game').addEventListener('click',()=>{if(game&&!game.result)$('#confirm-dialog').showModal();else newGame();});
$('#confirm-new').addEventListener('click',()=>{$('#confirm-dialog').close();newGame();});$('#cancel-new').addEventListener('click',()=>$('#confirm-dialog').close());
$('#flip').addEventListener('click',()=>{flipped=!flipped;drawBoard();});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{const move=pendingPromotion?.find(m=>m.endsWith(b.dataset.promote));$('#promotion').hidden=true;pendingPromotion=null;if(move)play(move);}));
document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{seconds=Number(b.dataset.time);document.querySelectorAll('[data-time]').forEach(n=>n.classList.toggle('selected',n===b));}));
function switchTab(tab){document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));for(const key of ['play','history','practice'])$(`#${key}-view`).hidden=key!==tab;}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{switchTab(b.dataset.tab);if(b.dataset.tab==='history')await history();}));
async function history(){try{const games=await api('games');const list=$('#history-list');list.replaceChildren();if(!games.length)list.textContent='لسه مفيش ماتشات. أول ماتش هو البداية.';for(const g of games){const row=document.createElement('div');row.className='history-item';const info=document.createElement('div');info.textContent=g.result?`النتيجة ${g.result}`:'ماتش محفوظ';const date=document.createElement('small');date.textContent=`${new Date(g.created_at*1000).toLocaleString('ar-EG')} · ${g.ply} نقلة`;info.append(date);const open=document.createElement('button');open.className='secondary';open.textContent='افتح الماتش ↗';open.addEventListener('click',()=>{game=g;selected=null;render();switchTab('play');});row.append(info,open);list.append(row);}}catch(e){notify(e.message,true);}}
drawBoard();
