// tests/replacement.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import replacement from '../src/engine/core/replacement.js';

test('registerReplacement adds replacement to gameState', () => {
  const s = createInitialState({});
  const eff = {
    event: 'wouldBeKO',
    sourceInstanceId: null,
    targetSelector: { any: true },
    duration: 'thisTurn',
    ownerId: 'player'
  };
  const res = replacement.registerReplacement(s, eff);
  assert.ok(res.success, 'registerReplacement should succeed');
  assert.ok(res.id, 'returned id expected');
  const active = replacement.getActiveReplacements(s);
  assert.ok(Array.isArray(active) && active.length === 1, 'activeReplacements should have 1 entry');
  assert.strictEqual(active[0].id, res.id);
});

test('checkReplacements finds matching replacements by instanceId', () => {
  const s = createInitialState({});
  // Create an instance to target
  const ch = createCardInstance('CHAR', 'player', 'char', s);
  s.players.player.char.push(ch);

  const eff = {
    event: 'wouldBeKO',
    targetSelector: { instanceId: ch.instanceId },
    duration: 'thisTurn',
    ownerId: 'player'
  };
  const r = replacement.registerReplacement(s, eff);
  assert.ok(r.success);

  const chk = replacement.checkReplacements(s, 'wouldBeKO', { targetInstanceId: ch.instanceId });
  assert.ok(chk.hasReplacement, 'expected a replacement');
  assert.ok(Array.isArray(chk.effects) && chk.effects.length === 1);
  assert.strictEqual(chk.effects[0].id, r.id);
});

test('applyReplacement increments triggerCount and removes when maxTriggers reached', async () => {
  const s = createInitialState({});
  const eff = {
    event: 'wouldBeKO',
    targetSelector: { any: true },
    duration: 'permanent',
    ownerId: 'player',
    maxTriggers: 1
  };
  const r = replacement.registerReplacement(s, eff);
  assert.ok(r.success);
  // apply it
  const ares = await replacement.applyReplacement(s, r.id, 'accept');
  assert.ok(ares.success, 'applyReplacement should succeed');
  // after applying, since maxTriggers == 1, it should be removed
  const active = replacement.getActiveReplacements(s);
  assert.ok(!active.find(x => x.id === r.id), 'effect should be removed after exhausting maxTriggers');
});

test('expireReplacements removes thisTurn effects at turnEnd', () => {
  const s = createInitialState({});
  const eff = {
    event: 'wouldBeKO',
    targetSelector: { any: true },
    duration: 'thisTurn',
    ownerId: 'player'
  };
  const r = replacement.registerReplacement(s, eff);
  assert.ok(r.success);
  const before = replacement.getActiveReplacements(s).length;
  const exp = replacement.expireReplacements(s, 'turnEnd');
  assert.ok(exp.success);
  assert.strictEqual(exp.removed, 1, 'one replacement should be removed');
  const after = replacement.getActiveReplacements(s).length;
  assert.strictEqual(after, before - 1);
});
