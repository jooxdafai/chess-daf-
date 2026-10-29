const $ = (selector) => document.querySelector(selector);
let game = null, selected = null, flipped = false, busy = false, pendingPromotion = null;
let seconds = 0;
let receivedAt = performance.now(), timeoutSync = false;
let review = null, reviewCursor = -1, showBest = false, reviewBusy = false;
const reviewAttempted = new Set();
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
function drawBoard(fen) {
  fen=fen || (review&&reviewCursor>=0 ? review.moves[reviewCursor]?.[showBest?'best_fen':'fen_before']:null) || game?.fen || startFen;
  const pieces=position(fen), board=$('#board'); board.replaceChildren();
  const files=[...'abcdefgh'], ranks=[8,7,6,5,4,3,2,1]; if(flipped){files.reverse();ranks.reverse();}
  const last=review&&reviewCursor>=0 ? review.moves[reviewCursor]?.[showBest?'best_uci':'uci']||'' : game?.moves.at(-1)?.uci || '';
  for(const rank of ranks) for(const file of files){
    const sq=file+rank, piece=pieces[sq], b=document.createElement('button'); b.type='button'; b.dataset.square=sq;
    b.className=`square ${(file.charCodeAt(0)-97+rank)%2===0?'dark':''}`;
    b.setAttribute('aria-label',`${sq}${piece ? ` ${piece===piece.toUpperCase()?'أبيض':'أسود'} ${pieceNames[piece.toLowerCase()]}`:''}`);
    b.classList.toggle('selected',sq===selected); b.classList.toggle('last',last.slice(0,2)===sq||last.slice(2,4)===sq);
    if(selected&&game?.legal_moves.some(m=>m.startsWith(selected+sq))){b.classList.add('legal');if(piece)b.classList.add('capture');}
    if(reviewCursor<0&&game?.check&&piece?.toLowerCase()==='k'&&(piece===piece.toUpperCase())===(game.turn==='white'))b.classList.add('in-check');
    if(piece){const img=document.createElement('img');img.src=`static/pieces/${piece===piece.toUpperCase()?'w':'b'}${piece.toLowerCase()}.svg`;img.alt='';img.draggable=false;b.append(img);}
    if(file===files[0]){const c=document.createElement('span');c.className='coord';c.textContent=rank;b.append(c);}
    if(rank===ranks.at(-1)){const c=document.createElement('span');c.className='coord file';c.textContent=file;b.append(c);}
    b.addEventListener('click',()=>onSquare(sq));board.append(b);
  }
}
function render(){
  drawBoard(); const list=$('#moves');list.replaceChildren();
  for(let i=0;i<(game?.moves.length||0);i+=2){const row=document.createElement('div');row.className='move-row';const num=document.createElement('span');num.textContent=i/2+1;row.append(num);for(const index of [i,i+1]){const s=document.createElement(review?'button':'span');s.textContent=game.moves[index]?.san||'—';if(review&&review.moves[index]){s.className=`move-button ${review.moves[index].quality}`;s.addEventListener('click',()=>selectReview(index));}row.append(s);}list.append(row);}
  if(!game?.moves.length){const p=document.createElement('p');p.className='empty-hint';p.textContent='أول نقلة مستنيّاك ♙';list.append(p);}list.scrollTop=list.scrollHeight;
  $('#game-status').textContent=game?.result ? `انتهت · ${game.result}`:game ? `${game.turn==='white'?'دور الأبيض':'دور الأسود'}${game.check?' · كش!':''}`:'اختار إعداداتك وابدأ';
  $('#position-label').textContent=game ? `النقلة ${Math.floor(game.ply/2)+1}`:'بداية جديدة، فرصة جديدة';
  $('#opponent-name').textContent=game ? `Stockfish · مستوى ${game.settings.level}`:'Stockfish';
  $('#opponent-status').textContent=game?.settings.mode==='match'?'ماتش من غير مساعدة':'وضع التدريب';
  controls(); clocks();
}
function accept(next){if(next.id!==game?.id){review=null;reviewCursor=-1;showBest=false;$('#review-nav').hidden=true;}game=next;receivedAt=performance.now();timeoutSync=false;localStorage.setItem('chess-daf-game',game.id);render();}
function controls(){
  $('#hint').disabled=busy||!game||!!game.result||game.settings.mode!=='training'||game.turn!==game.settings.color;
  $('#resign').disabled=busy||!game||!!game.result;
  $('#new-game').disabled=busy||reviewBusy;
  $('#review-game').hidden=!game?.result;$('#review-game').disabled=busy||reviewBusy;
  $('#review-game').textContent=reviewBusy?'المحرك بيراجع النقلات…':'راجع الماتش معايا';
  $('#download-pgn').hidden=!game;
  if(game)$('#download-pgn').href=`api/games/${game.id}/pgn`;
  document.querySelectorAll('.nav').forEach(n=>n.disabled=busy);
}
function setBusy(value){busy=value;controls();if(!value&&game?.result&&game.ply&&!reviewAttempted.has(game.id))beginReview();}
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
$('#hint').addEventListener('click',async()=>{setBusy(true);try{const hint=await api(`games/${game.id}/hint`,{});selected=hint.uci.slice(0,2);drawBoard();const box=$('#coach-content');box.replaceChildren();const note=node('div','','coach-note');note.append(node('h3',`جرّب ${hint.san}`),node('p',hint.explanation));box.append(note);notify(`من ${hint.uci.slice(0,2)} إلى ${hint.uci.slice(2,4)} · تحليل سريع تقديري.`);}catch(e){notify(e.message,true);}finally{setBusy(false);}});
$('#resign').addEventListener('click',async()=>{if(!confirm('تنهي الماتش بالاستسلام؟'))return;setBusy(true);try{accept(await api(`games/${game.id}/resign`,{}));notify('الماتش اتحفظ. نراجع ونتعلّم منه.');}catch(e){notify(e.message,true);}finally{setBusy(false);}});
document.querySelectorAll('[data-promote]').forEach(b=>b.addEventListener('click',()=>{const move=pendingPromotion?.find(m=>m.endsWith(b.dataset.promote));$('#promotion').hidden=true;pendingPromotion=null;if(move)play(move);}));
document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{seconds=Number(b.dataset.time);document.querySelectorAll('[data-time]').forEach(n=>n.classList.toggle('selected',n===b));}));
function switchTab(tab){document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));for(const key of ['play','history','practice'])$(`#${key}-view`).hidden=key!==tab;}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{switchTab(b.dataset.tab);if(b.dataset.tab==='history')await history();if(b.dataset.tab==='practice')await practice();}));
async function history(){try{const games=await api('games');const list=$('#history-list');list.replaceChildren();if(!games.length)list.textContent='لسه مفيش ماتشات. أول ماتش هو البداية.';for(const g of games){const row=document.createElement('div');row.className='history-item';const info=document.createElement('div');info.textContent=g.result?`النتيجة ${g.result}`:'ماتش محفوظ';const date=document.createElement('small');date.textContent=`${new Date(g.created_at*1000).toLocaleString('ar-EG')} · ${g.ply} نقلة`;info.append(date);const open=document.createElement('button');open.className='secondary';open.textContent='افتح الماتش ↗';open.addEventListener('click',async()=>{selected=null;flipped=g.settings.color==='black';accept(g);switchTab('play');await sync();});row.append(info,open);list.append(row);}}catch(e){notify(e.message,true);}}
drawBoard();
function node(tag,text='',className=''){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
async function beginReview(){
  if(!game?.result||reviewBusy)return;
  const id=game.id;reviewAttempted.add(id);reviewBusy=true;controls();notify('بنراجع الماتش نقلة نقلة… ده ممكن ياخد شوية حسب طول الماتش.');
  try{const result=await api(`games/${id}/review`,{});if(game?.id!==id)return;review=result;render();if(review.moves.length){const first=review.moves.findIndex(m=>m.side===game.settings.color&&['mistake','blunder'].includes(m.quality));selectReview(first<0?0:first);}else notify('لسه مفيش نقلات نراجعها في الماتش ده.');}
  catch(e){notify(`${e.message} · تقدر تعيد المراجعة بالزر.`,true);}finally{reviewBusy=false;controls();}
}
function selectReview(index){
  if(!review?.moves[index])return;reviewCursor=index;showBest=false;selected=null;drawBoard();reviewDetails();
}
function reviewDetails(){
  const move=review.moves[reviewCursor], box=$('#coach-content');box.replaceChildren();
  const note=node('div','','coach-note');
  note.append(node('span',`مراجعة الماتش · مؤشر أداء تقريبي ${review.accuracy??'—'}/100`,'review-eyebrow'),node('h3',`${move.san} · ${move.label}`,`quality-text ${move.quality}`),node('p',`${move.side===game.settings.color?'نقلتك':'نقلة الخصم'} · الأفضل حسب التحليل: ${move.best_san}`),node('p',move.explanation));
  if(move.line.length)note.append(node('p',move.line.join(' → '),'variation'));
  const toggle=node('button',showBest?'ارجع للموقف قبل النقلة':'ورّيني النقلة المقترحة','secondary');toggle.id='show-best';toggle.addEventListener('click',()=>{showBest=!showBest;drawBoard();reviewDetails();});note.append(toggle);
  note.append(node('small',`الفرق عن أفضل اختيار: ${(move.loss/100).toFixed(2)} بيدق · عمق ${move.depth}. التكملة تقديرية وليست إجبارية.`,'review-disclaimer'));
  box.append(note);$('#review-nav').hidden=false;$('#review-position').textContent=`${reviewCursor+1} / ${review.moves.length}`;$('#review-prev').disabled=reviewCursor===0;$('#review-next').disabled=reviewCursor===review.moves.length-1;
  notify('المراجعة جاهزة. اضغط على أي نقلة، أو اتحرك بالأسهم علشان تفهم الماتش.');
}
$('#review-game').addEventListener('click',beginReview);
$('#review-prev').addEventListener('click',()=>selectReview(reviewCursor-1));$('#review-next').addEventListener('click',()=>selectReview(reviewCursor+1));
let puzzles=[], puzzle=null, puzzleSelected=null, puzzleBusy=false, puzzleSolved=false;
async function practice(){
  try{
    const [items,stats]=await Promise.all([api('practice'),api('progress')]);puzzles=items;
    const box=$('#practice-content');box.replaceChildren();
    const counters=node('div','','stats-grid');
    for(const [label,value,id] of [['ماتشات لعبتها',stats.games,'games-count'],['تمارين اتحلّت',stats.solved,'solved-count'],['حل بتلميح',stats.assisted,'assisted-count'],['متوسط آخر المراجعات',stats.average===null?'—':`${stats.average}/100`,'average-score']]){const card=node('div','','stat');const strong=node('strong',value);strong.id=id;card.append(strong,node('small',label));counters.append(card);}box.append(counters);
    const chart=node('div','','progress-chart');chart.append(node('h3','خطواتك في آخر 12 مراجعة'),node('p','مؤشر تقريبي لفهم النقلات، مش تصنيف شطرنج. كل نقطة ماتش اتراجع.'));if(stats.scores.length)chart.append(scoreChart(stats.scores));else chart.append(node('p','راجع أول ماتش علشان تبدأ تشوف تطوّرك هنا.'));if(stats.focus.length)chart.append(node('p',`خلّي تركيزك الجاي على: ${stats.focus.join('، ')}.`));box.append(chart);
    const layout=node('div','','practice-layout'),choices=node('div','','puzzle-choices');
    choices.append(node('h3','تمرين صغير كل مرة'));
    for(const item of items){const button=node('button',`${item.solved?'✓ ':''}${item.source==='starter'?'تدريب بداية':'من غلطاتك'} · ${item.side==='white'?'الأبيض':'الأسود'}`,'puzzle-choice');button.dataset.puzzle=item.id;button.addEventListener('click',()=>openPuzzle(item));choices.append(button);}
    const center=node('div','','puzzle-center'),board=node('div','','board');board.id='practice-board';board.setAttribute('aria-label','رقعة التدريب');const wrap=node('div','','board-wrap');wrap.append(board);center.append(wrap);
    const lesson=node('div','','puzzle-lesson');lesson.id='puzzle-lesson';layout.append(choices,center,lesson);box.append(layout);
    if(items.length)openPuzzle(items.find(p=>!p.solved)||items[0]);
  }catch(e){notify(e.message,true);}
}
function scoreChart(scores){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 115');svg.setAttribute('role','img');svg.setAttribute('aria-label','رسم مؤشر أداء آخر المباريات من صفر لمئة');
  for(const [y,label] of [[12,'100'],[55,'50'],[98,'0']]){const line=document.createElementNS(ns,'line');line.setAttribute('x1','25');line.setAttribute('x2','350');line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('stroke','#e3e7d9');svg.append(line);const text=document.createElementNS(ns,'text');text.setAttribute('x','2');text.setAttribute('y',y+4);text.textContent=label;svg.append(text);}
  const coords=scores.map((score,i)=>[scores.length===1?180:30+i*315/(scores.length-1),98-score*.86]);const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',coords.map(p=>p.join(',')).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','#487659');poly.setAttribute('stroke-width','2.5');svg.append(poly);
  for(const [x,y]of coords){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r','3.5');c.setAttribute('fill','#487659');svg.append(c);}return svg;
}
function openPuzzle(item){
  if(puzzleBusy)return;puzzle=item;puzzleSelected=null;puzzleSolved=item.solved;
  document.querySelectorAll('[data-puzzle]').forEach(b=>b.classList.toggle('selected',b.dataset.puzzle===item.id));
  const lesson=$('#puzzle-lesson');lesson.replaceChildren();lesson.append(node('span',item.source==='starter'?'نبدأ بالأساسيات':'موقف من ماتشك','eyebrow'),node('h3',item.prompt));const feedback=node('p',item.solved?'حلّيته قبل كده. جرّبه تاني لو حابب.':'اضغط على القطعة وبعدين مربع الوصول.');feedback.id='practice-feedback';feedback.setAttribute('role','status');lesson.append(feedback);
  const promo=node('select');promo.id='puzzle-promotion';promo.setAttribute('aria-label','ترقية البيدق في التدريب');for(const [v,t]of [['q','ترقية لوزير'],['r','ترقية لرخ'],['b','ترقية لفيل'],['n','ترقية لحصان']]){const option=node('option',t);option.value=v;promo.append(option);}lesson.append(promo);
  const hint=node('button','✧ ورّيني الاختيار','secondary');hint.id='puzzle-hint';hint.addEventListener('click',async()=>{puzzleBusy=true;hint.disabled=true;try{const data=await api(`practice/${puzzle.id}/hint`,{});puzzleSelected=data.uci.slice(0,2);drawPuzzle();feedback.textContent=`من ${data.uci.slice(0,2)} إلى ${data.uci.slice(2,4)}. ${data.explanation} · التمرين ده هيتسجّل بتلميح.`;}catch(e){feedback.textContent=e.message;}finally{puzzleBusy=false;hint.disabled=false;}});lesson.append(hint);drawPuzzle();
}
function drawPuzzle(){
  if(!puzzle)return;const board=$('#practice-board'),pieces=position(puzzle.fen),files=[...'abcdefgh'],ranks=[8,7,6,5,4,3,2,1];if(puzzle.side==='black'){files.reverse();ranks.reverse();}board.replaceChildren();
  for(const rank of ranks)for(const file of files){const sq=file+rank,piece=pieces[sq],b=node('button','','square');b.dataset.square=sq;b.setAttribute('aria-label',sq);if((file.charCodeAt(0)-97+rank)%2===0)b.classList.add('dark');b.classList.toggle('selected',sq===puzzleSelected);if(puzzleSelected&&puzzle.legal_moves.some(m=>m.startsWith(puzzleSelected+sq)))b.classList.add('legal');if(piece){const img=node('img');img.src=`static/pieces/${piece===piece.toUpperCase()?'w':'b'}${piece.toLowerCase()}.svg`;img.alt=pieceNames[piece.toLowerCase()];b.append(img);}b.addEventListener('click',()=>tryPuzzle(sq));board.append(b);}
}
async function tryPuzzle(square){
  if(puzzleBusy)return;
  const piece=position(puzzle.fen)[square];
  if(puzzleSelected&&puzzle.legal_moves.some(m=>m.startsWith(puzzleSelected+square))){
    const choices=puzzle.legal_moves.filter(m=>m.startsWith(puzzleSelected+square));const uci=choices.length>1?choices.find(m=>m.endsWith($('#puzzle-promotion').value)):choices[0];puzzleBusy=true;
    try{const result=await api(`practice/${puzzle.id}/attempt`,{uci});$('#practice-feedback').textContent=`${result.correct?'صح! ':'جرّب تاني. '}${result.explanation}`;
      if(result.correct&&!puzzleSolved){puzzleSolved=true;puzzle.solved=true;const stats=await api('progress');$('#solved-count').textContent=stats.solved;$('#assisted-count').textContent=stats.assisted;document.querySelector(`[data-puzzle="${puzzle.id}"]`).classList.add('solved');}
    }catch(e){$('#practice-feedback').textContent=e.message;}finally{puzzleBusy=false;puzzleSelected=null;drawPuzzle();}return;
  }
  puzzleSelected=piece&&(piece===piece.toUpperCase())===(puzzle.side==='white')?square:null;drawPuzzle();
}
document.addEventListener('keydown',e=>{if(review&&reviewCursor>=0&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){if(e.key==='ArrowLeft'){e.preventDefault();selectReview(reviewCursor+1);}if(e.key==='ArrowRight'){e.preventDefault();selectReview(reviewCursor-1);}}});
setInterval(clocks,200);
const saved=localStorage.getItem('chess-daf-game');
if(saved){try{accept(await api(`games/${encodeURIComponent(saved)}`));flipped=game.settings.color==='black';await sync();}catch(e){notify(e.message,true);}}
