import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidatePremoves,resolvePremove} from '../web/static/premove.mjs';

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
