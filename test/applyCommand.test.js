// test/applyCommand.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../src/engine/index.js';

test('SETUP_READY flow: both players ready -> deal & dice', () => {
  const state = {
    players: [
      { socketId: 's1', deckIds: Array.from({length:10}).map((_,i)=>`A${i+1}`), handIds: [], lifeIds: [], donCount: 0 },
      { socketId: 's2', deckIds: Array.from({length:10}).map((_,i)=>`B${i+1}`), handIds: [], lifeIds: [], donCount: 0 }
    ],
    setup: {},
    turn: {}
  };

  // player 1 ready
  const res1 = engine.applyCommand(state, { type: 'SETUP_READY', clientSocketId: 's1' });
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.eventType, 'SetupReady');

  // player 2 ready -> completes setup
  const res2 = engine.applyCommand(res1.newState, { type: 'SETUP_READY', clientSocketId: 's2' });
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.eventType, 'SetupComplete');
  const newState = res2.newState;
  // confirm dealt 5 cards each
  assert.strictEqual(newState.players[0].handIds.length, 5);
  assert.strictEqual(newState.players[0].lifeIds.length, 5);
  assert.strictEqual(newState.players[1].handIds.length, 5);
  assert.strictEqual(newState.players[1].lifeIds.length, 5);
  assert.strictEqual(newState.setup.phase, 'hands');
  assert.ok(newState.setup.dice && Array.isArray(newState.setup.dice.rollsByIndex));
});

test('OPENING_HAND_CONFIRM -> complete and DRAW_CARD/DRAW_DON flow', () => {
  const baseState = {
    players: [
      { socketId: 's1', deckIds: ['a','b','c','d','e','f','g','h','i','j'], handIds: [], lifeIds: [], donCount: 0 },
      { socketId: 's2', deckIds: ['1','2','3','4','5','6','7','8','9','0'], handIds: [], lifeIds: [], donCount: 0 }
    ],
    setup: { phase: 'hands', handConfirmedBySocketId: {} },
    turn: { currentPlayerIndex: 0, turnNumber: 1, phase: 'Draw' }
  };

  // simulate deal (copying behavior)
  for (const p of baseState.players) {
    p.handIds = ['h1','h2','h3','h4','h5'];
    p.lifeIds = ['L1','L2','L3','L4','L5'];
  }

  // both confirm
  const st1 = engine.applyCommand(baseState, { type: 'OPENING_HAND_CONFIRM', clientSocketId: 's1' });
  assert.strictEqual(st1.valid, true);
  const st2 = engine.applyCommand(st1.newState, { type: 'OPENING_HAND_CONFIRM', clientSocketId: 's2' });
  assert.strictEqual(st2.valid, true);
  assert.strictEqual(st2.newState.setup.phase, 'complete');

  // Draw card for current player (s1)
  const drawRes = engine.applyCommand(st2.newState, { type: 'DRAW_CARD', clientSocketId: 's1' });
  assert.strictEqual(drawRes.valid, true);
  assert.strictEqual(drawRes.eventType, 'DrawCard');
  assert.strictEqual(drawRes.newState.turn.phase, 'Don');
  assert.ok(Array.isArray(drawRes.newState.players[0].handIds));

  // Draw DON
  const donRes = engine.applyCommand(drawRes.newState, { type: 'DRAW_DON', clientSocketId: 's1', payload: { amount: 2 } });
  assert.strictEqual(donRes.valid, true);
  assert.strictEqual(donRes.newState.players[0].donCount, 2);
  assert.strictEqual(donRes.newState.turn.phase, 'Main');

  // End turn
  const endRes = engine.applyCommand(donRes.newState, { type: 'END_TURN', clientSocketId: 's1' });
  assert.strictEqual(endRes.valid, true);
  assert.strictEqual(endRes.newState.turn.currentPlayerIndex, 1);
});
