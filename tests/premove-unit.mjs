import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidatePremoves,resolvePremove,appendPremove,projectQueue,MAX_PREMOVES} from '../web/static/premove.mjs';

test('only own pieces offer geometry-based future destinations',()=>{
  assert.deepEqual(candidatePremoves({g1:'N',e2:'P'},'white','g1').sort(),['g1f3','g1h3']);
  assert.deepEqual(candidatePremoves({g1:'N'},'black','g1'),[]);
  const pawn=candidatePremoves({e4:'P'},'white','e4');
  assert.ok(pawn.includes('e4d5')&&pawn.includes('e4e5')&&pawn.includes('e4f5'));
  assert.equal(pawn.includes('e4e6'),false);
});
test('both colors and all promotion choices are supported',()=>{
  assert.ok(candidatePremoves({b8:'n'},'black','b8').includes('b8c6'));
  for(const suffix of ['q','r','b','n'])assert.ok(candidatePremoves({a7:'P'},'white','a7').includes('a7a8'+suffix));
  assert.ok(candidatePremoves({e1:'K'},'white','e1').includes('e1g1'));
});
test('execution requires exactly the next own turn and current server legality',()=>{
  const queue={gameId:'one',ply:1,uci:'g1f3'};
  const game={id:'one',ply:2,result:null,turn:'white',settings:{color:'white'},legal_moves:['g1f3']};
  assert.equal(resolvePremove(queue,game),'g1f3');
  for(const changed of [{id:'two'},{ply:1},{ply:4},{result:'0-1'},{turn:'black'},{legal_moves:[]}])assert.equal(resolvePremove(queue,{...game,...changed}),null);
});
test('a bounded queue appends dependent moves from projected squares, with exact future plies',()=>{
 const game={id:'one',ply:1,result:null,turn:'black',settings:{color:'white'}},pieces={g1:'N',b1:'N'};
 const first=appendPremove([],game,pieces,'g1f3'),second=appendPremove(first,game,pieces,'f3g5');
 assert.deepEqual(second,[{gameId:'one',ply:1,uci:'g1f3'},{gameId:'one',ply:3,uci:'f3g5'}]);
 assert.deepEqual(projectQueue(pieces,second),{b1:'N',g5:'N'});assert.equal(pieces.g1,'N');
 assert.equal(appendPremove(first,{...game,id:'other'},pieces,'f3g5'),null);
 assert.equal(appendPremove(first,{...game,ply:3},pieces,'f3g5'),null);
 assert.equal(appendPremove([],{...game,turn:'white'},pieces,'g1f3'),null);
 assert.equal(appendPremove([],{...game,result:'0-1'},pieces,'g1f3'),null);
 assert.equal(appendPremove(first,game,pieces,'g1h3'),null,'the old source is empty in the projection');
 let queue=[];for(let i=0;i<MAX_PREMOVES;i++)queue=appendPremove(queue,game,pieces,i%2?'f3g1':'g1f3');
 assert.equal(queue.length,8);assert.equal(appendPremove(queue,game,pieces,'g1f3'),null);
 assert.deepEqual(projectQueue(pieces,second.slice(0,-1)),{b1:'N',f3:'N'});
 assert.equal(resolvePremove(second[0],{...game,ply:2,turn:'white',legal_moves:['g1f3']}),'g1f3');
 assert.equal(resolvePremove(second[1],{...game,ply:4,turn:'white',legal_moves:[]}),null);
});
