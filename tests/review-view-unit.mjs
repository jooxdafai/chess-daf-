import {test} from 'node:test';
import assert from 'node:assert/strict';
import {squarePoint,arrowPath,reviewTimeline,calloutPosition} from '../web/static/review-view.mjs';
const initial='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
test('review arrows use board coordinates in both orientations, including knight elbows',()=>{
 assert.deepEqual(squarePoint('a8'),{x:50,y:50});assert.deepEqual(squarePoint('h1',true),{x:50,y:50});
 assert.equal(arrowPath('e2e4'),'M 450 650 L 450 450');assert.equal(arrowPath('e2e4',true),'M 350 150 L 350 350');
 assert.equal(arrowPath('g1f3',false,true),'M 650 750 L 650 550 L 550 550');assert.equal(arrowPath('invalid'),'');
});
test('review modes retain exact server frames and separate actual explanation from the alternative',()=>{
 const record={fen_before:initial,uci:'e2e4',best_uci:'d2d4',label:'نقلة كويسة',explanation:'best explanation',
  played_frame:{uci:'e2e4',san:'e4',fen_before:initial,fen:'played',explanation:'actual explanation'},
  best_frames:[{uci:'d2d4',san:'d4',fen_before:initial,fen:'best',explanation:'best explanation'},{uci:'d7d5',san:'d5',fen_before:'best',fen:'reply',explanation:'reply explanation'}]};
 assert.deepEqual(reviewTimeline(record).map(f=>f.fen),[initial,'played',initial,'best','reply']);
 assert.equal(reviewTimeline(record,'played')[1].explanation,'actual explanation');
 assert.deepEqual(reviewTimeline(record,'best').map(f=>f.fen),[initial,'best','reply']);
 assert.deepEqual(reviewTimeline(record)[0].arrows.map(a=>a.kind),['played','best']);
 const same={...record,played_frame:{...record.played_frame,uci:'d2d4'}};assert.equal(reviewTimeline(same)[0].arrows.length,1);
});
test('on-board callout stays inside the board and prefers empty unhighlighted space',()=>{
 const spot=calloutPosition(initial,[{uci:'e2e4'},{uci:'d2d4'}],false);
 assert.equal(spot.score,0);assert.ok(spot.left>=0&&spot.left+45<=100&&spot.top>=0&&spot.top+26<=100);
});
