// tests/replay.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { createReplay, replayAll, replayStep } from '../src/engine/persistence/replay.js';

// The interpreter.modifyStat action is used by tests (the repo already includes modifyStat).
// We verify that replayAll/replayStep actually apply that action to the cloned state.

test('replayAll applies modifyStat actions', () => {
  const s = createInitialState({ playerDeck: [] });
  const inst = createCardInstance('CHAR-X', 'player', 'char', s);
  s.players.player.char.push(inst);

  const action = {
    type: 'modifyStat',
    descriptor: {
      stat: 'power',
      mode: 'add',
      amount: 2000,
      targetInstanceIds: [inst.instanceId],
      duration: 'permanent',
      ownerId: 'player'
    }
  };

  const replay = createReplay(s, 12345, [action]);

  const finalState = replayAll(replay);

  assert.ok(Array.isArray(finalState.continuousEffects), 'continuousEffects array should exist');
  assert.strictEqual(finalState.continuousEffects.length, 1, 'one modifier should be present');
  const mod = finalState.continuousEffects[0];
  assert.strictEqual(mod.amount, 2000);
  assert.deepStrictEqual(mod.targetInstanceIds, [inst.instanceId]);
});

test('replayStep returns state after a given step and supports ActionEntry wrapper', () => {
  const s = createInitialState({ playerDeck: [] });
  const inst = createCardInstance('CHAR-Y', 'player', 'char', s);
  s.players.player.char.push(inst);

  const action1 = {
    type: 'modifyStat',
    descriptor: {
      stat: 'power',
      mode: 'add',
      amount: 2000,
      targetInstanceIds: [inst.instanceId],
      duration: 'permanent',
      ownerId: 'player'
    }
  };

  const action2 = {
    type: 'modifyStat',
    descriptor: {
      stat: 'power',
      mode: 'add',
      amount: 3000,
      targetInstanceIds: [inst.instanceId],
      duration: 'permanent',
      ownerId: 'player'
    }
  };

  // Use the ActionEntry wrapper shape for the second action to ensure wrapper handling works
  const entry1 = { sequence: 1, playerId: 'player', actionType: 'modifyStat', params: action1 };
  const entry2 = { sequence: 2, playerId: 'player', actionType: 'modifyStat', params: action2 };

  const replay = createReplay(s, 0, [entry1, entry2]);

  // After step 0: only first modifier applied
  const stateAfterStep0 = replayStep(replay, 0);
  assert.ok(Array.isArray(stateAfterStep0.continuousEffects), 'continuousEffects array should exist');
  assert.strictEqual(stateAfterStep0.continuousEffects.length, 1, 'after step 0 there should be 1 modifier');

  // After step 1: both modifiers applied
  const stateAfterStep1 = replayStep(replay, 1);
  assert.strictEqual(stateAfterStep1.continuousEffects.length, 2, 'after step 1 there should be 2 modifiers');

  // replayAll should equal step(1)
  const final = replayAll(replay);
  assert.strictEqual(final.continuousEffects.length, 2, 'replayAll should produce two modifiers');
});
