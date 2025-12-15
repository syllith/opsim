// tests/modifyStat.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/engine/core/gameState.js';
import { createAndAdd } from '../src/engine/core/zones.js';
import { modifyStat } from '../src/engine/actions/modifyStat.js';

test('modifyStat registers an add modifier on target instance', () => {
  const s = createInitialState({ playerDeck: [] });
  // create a character instance for player
  const inst = createAndAdd(s, 'OP-CHAR', 'player', 'char');
  const desc = {
    stat: 'power',
    mode: 'add',
    amount: 2000,
    targetInstanceIds: [inst.instanceId],
    duration: 'thisTurn',
    ownerId: 'player'
  };
  const res = modifyStat(s, desc);
  assert.ok(res.success, `modifyStat failed: ${res.error}`);
  assert.ok(res.modifierId, 'modifierId expected');

  // Assert the modifier is present in continuousEffects array
  const mods = s.continuousEffects || [];
  const m = mods.find(m => m.id === res.modifierId);
  assert.ok(m, 'modifier must be registered');
  assert.strictEqual(m.stat, 'power');
  assert.strictEqual(m.mode, 'add');
  assert.strictEqual(m.amount, 2000);
  assert.deepStrictEqual(m.targetInstanceIds, [inst.instanceId]);
});

test('modifyStat generates unique modifier ids across calls', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'OP-CHAR', 'player', 'char');
  const res1 = modifyStat(s, {
    stat: 'power', mode: 'add', amount: 100, targetInstanceIds: [inst.instanceId], duration: 'thisTurn'
  });
  const res2 = modifyStat(s, {
    stat: 'power', mode: 'add', amount: 200, targetInstanceIds: [inst.instanceId], duration: 'thisTurn'
  });
  assert.ok(res1.success && res2.success);
  assert.notStrictEqual(res1.modifierId, res2.modifierId, 'modifierIds should be unique');
});

test('modifyStat rejects invalid mode', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'OP-CHAR', 'player', 'char');
  const res = modifyStat(s, {
    stat: 'power', mode: 'invalidMode', amount: 100, targetInstanceIds: [inst.instanceId], duration: 'thisTurn'
  });
  assert.strictEqual(res.success, false, 'modifyStat should fail for invalid mode');
  assert.ok(res.error);
});
