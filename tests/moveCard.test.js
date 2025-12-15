// tests/moveCard.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/engine/core/gameState.js';
import { moveCard } from '../src/engine/actions/moveCard.js';
import zones from '../src/engine/core/zones.js';

test('moveCard moves instance from deck to hand', () => {
  const s = createInitialState({ playerDeck: ['A','B','C'] });
  const inst = s.players.player.deck[0];
  const res = moveCard(s, inst.instanceId, 'hand', { top: true });
  assert.ok(res.success, `move failed: ${res.error}`);
  const found = zones.findInstance(s, inst.instanceId);
  assert.strictEqual(found.zone, 'hand', 'instance should be in hand after move');
  assert.strictEqual(found.owner, 'player', 'owner should remain player');
});

test('moveCard changes owner when destination owner differs', () => {
  const s = createInitialState({ playerDeck: ['A','B'], opponentDeck: [] });
  const inst = s.players.player.deck[0];
  const res = moveCard(s, inst.instanceId, { owner: 'opponent', zone: 'hand', top: true });
  assert.ok(res.success, `move failed: ${res.error}`);
  const found = zones.findInstance(s, inst.instanceId);
  assert.strictEqual(found.owner, 'opponent', 'owner should be opponent after move');
  assert.strictEqual(found.zone, 'hand');
});

test('moveCard sets faceUp per options', () => {
  const s = createInitialState({ playerDeck: ['A'] });
  const inst = s.players.player.deck[0];
  const res = moveCard(s, inst.instanceId, 'hand', { faceUp: true });
  assert.ok(res.success, `move failed: ${res.error}`);
  const found = zones.findInstance(s, inst.instanceId);
  assert.strictEqual(found.instance.faceUp, true, 'faceUp should be true after move');
});

test('moveCard fails when adding to occupied leader slot', () => {
  const s = createInitialState({ playerLeaderId: 'L1', playerDeck: ['A'] });
  const inst = s.players.player.deck[0];
  const res = moveCard(s, inst.instanceId, { owner: 'player', zone: 'leader' });
  assert.strictEqual(res.success, false, 'moveCard should fail when leader occupied');
});
