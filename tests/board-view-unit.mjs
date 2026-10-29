import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectMove} from '../web/static/board-view.mjs';
test('visual projections handle capture, castle, en passant and promotion without mutating the confirmed position',()=>{
 const original={e4:'P',d5:'p',a1:'R'};
 assert.deepEqual(projectMove(original,'e4d5'),{d5:'P',a1:'R'});assert.equal(original.e4,'P');
 assert.deepEqual(projectMove({e1:'K',h1:'R',a1:'R'},'e1g1'),{g1:'K',f1:'R',a1:'R'});
 assert.deepEqual(projectMove({e8:'k',h8:'r',a8:'r'},'e8c8'),{c8:'k',d8:'r',h8:'r'});
 assert.deepEqual(projectMove({e5:'P',d5:'p'},'e5d6'),{d6:'P'});
 assert.deepEqual(projectMove({a7:'P'},'a7a8n'),{a8:'N'});
 assert.deepEqual(projectMove({b2:'p'},'b2b1r'),{b1:'r'});
});
