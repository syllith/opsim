// tests/koAction.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import koAction from '../src/engine/actions/koAction.js';
import { findInstance } from '../src/engine/core/zones.js';
import replacement from '../src/engine/core/replacement.js';

test('ko action KOs a character on field', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C-KO', 'player', 'char', s);
  ch.basePower = 1000;
  s.players.player.char.push(ch);

  const res = koAction.execute(s, { type: 'ko', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(res.success);
  assert.ok(Array.isArray(res.results) && res.results.length === 1);
  const r = res.results[0];
  assert.strictEqual(r.instanceId, ch.instanceId);
  assert.strictEqual(r.status, 'koed');
  // Now the instance should be in trash
  const loc = findInstance(s, ch.instanceId);
  assert.ok(loc && loc.zone === 'trash', 'character should be in trash');
});

test('ko action skips leader target', () => {
  const s = createInitialState({});
  const leader = createCardInstance('LEAD', 'player', 'leader', s);
  s.players.player.leader = leader;

  const res = koAction.execute(s, { type: 'ko', target: leader.instanceId }, { activePlayer: 'player' });
  assert.ok(res.success);
  assert.ok(Array.isArray(res.results));
  assert.strictEqual(res.results[0].status, 'skipped');
});

test('ko action respects replacement effects (prevents KO)', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C-PREV', 'player', 'char', s);
  s.players.player.char.push(ch);

  // Register a replacement for wouldBeKO that targets this instance and has maxTriggers 1
  const eff = {
    event: 'wouldBeKO',
    targetSelector: { instanceId: ch.instanceId },
    duration: 'permanent',
    ownerId: 'player',
    maxTriggers: 1
  };
  const reg = replacement.registerReplacement(s, eff);
  assert.ok(reg.success && reg.id);

  // Execute ko action
  const res = koAction.execute(s, { type: 'ko', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(res.success);
  assert.ok(res.results && res.results.length === 1);
  const r = res.results[0];
  assert.strictEqual(r.status, 'replaced', 'replacement should have been applied and KO skipped');

  // Replacement should be removed (maxTriggers==1)
  const active = replacement.getActiveReplacements(s);
  assert.ok(!active.find(e => e.id === reg.id), 'replacement should be removed after applying');
  // Character should remain on field (not in trash)
  const loc = findInstance(s, ch.instanceId);
  assert.ok(loc && loc.zone === 'char', 'character should remain on field after replacement');
});
