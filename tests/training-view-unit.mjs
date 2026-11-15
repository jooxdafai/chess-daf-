import {test} from 'node:test';
import assert from 'node:assert/strict';
import {opponentName,trainingDelay} from '../web/static/training-view.mjs';
test('easy response pacing stays short in bullet, slows untimed play and shrinks near flag fall',()=>{
 const game={settings:{level:1,seconds:0},turn:'black',result:null,clocks:null};
 assert.equal(trainingDelay(game,.2),1);game.settings.seconds=60;game.clocks={white:50,black:60};
 assert.equal(trainingDelay(game,.1),.5);game.clocks.black=3;assert.equal(trainingDelay(game,.1),0);
 assert.equal(trainingDelay(game,3),0);game.settings.level=3;assert.equal(trainingDelay(game,0),0);
 game.settings.level=1;game.result='1-0';assert.equal(trainingDelay(game,0),0);
 assert.equal(game.clocks.white,50,'pacing must not alter the authoritative clocks');
});
test('opponent identity describes the simplified easy policy honestly',()=>{
 assert.ok(opponentName({settings:{level:1}}).startsWith('خصم تدريب'));
 assert.ok(opponentName({settings:{level:3}}).startsWith('Stockfish'));
});
