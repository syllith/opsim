// tests/replacementEffectAction.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import replacementEffectAction from '../src/engine/actions/replacementEffectAction.js';
import replacement from '../src/engine/core/replacement.js';

test('replacementEffectAction registers replacement via action', () => {
  const s = createInitialState({});
  // simple action: wouldBeKO for any target, thisTurn
  const action = {
    type: 'replacementEffect',
    event: 'wouldBeKO',
    duration: 'thisTurn',
    target: { any: true },
    maxTriggers: 1,
    actions: [{ type: 'noop' }],
  };
  const res = replacementEffectAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `action failed: ${res.error}`);
  assert.ok(res.id, 'expected replacement id');
  const active = replacement.getActiveReplacements(s);
  assert.ok(Array.isArray(active) && active.length === 1, 'expected one active replacement');
  assert.strictEqual(active[0].id, res.id);
  assert.strictEqual(active[0].event, 'wouldBeKO');
  assert.strictEqual(active[0].duration, 'thisTurn');
});

test('replacementEffectAction registers replacement with source and owner', () => {
  const s = createInitialState({});
  const card = createCardInstance('SRC', 'player', 'char', s);
  s.players.player.char.push(card);
  const action = {
    type: 'replacementEffect',
    event: 'wouldBeKO',
    duration: 'permanent',
    target: { instanceId: card.instanceId },
    maxTriggers: 1,
    actions: [{ type: 'noop' }]
  };
  const res = replacementEffectAction.execute(s, action, { activePlayer: 'player', thisCard: card });
  assert.ok(res.success && res.id);
  const active = replacement.getActiveReplacements(s);
  const eff = active.find(e => e.id === res.id);
  assert.ok(eff, 'replacement should be registered');
  assert.strictEqual(eff.ownerId, 'player');
  assert.strictEqual(eff.sourceInstanceId, card.instanceId);
  assert.strictEqual(eff.maxTriggers, 1);
});
