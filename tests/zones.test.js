// tests/zones.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  createCardInstance
} from '../src/engine/core/gameState.js';

import {
  findInstance,
  removeInstance,
  addToZone,
  moveToZone,
  createAndAdd
} from '../src/engine/core/zones.js';

test('findInstance locates an instance existing in deck', () => {
  const s = createInitialState({ playerDeck: ['A','B','C'] });
  const inst = s.players.player.deck[1];
  const found = findInstance(s, inst.instanceId);
  assert.ok(found, 'should find instance');
  assert.strictEqual(found.owner, 'player');
  assert.strictEqual(found.zone, 'deck');
  assert.strictEqual(found.index, 1);
});

test('removeInstance removes an instance and it is no longer findable', () => {
  const s = createInitialState({ playerDeck: ['A','B','C'] });
  const inst = s.players.player.deck[0];
  const removed = removeInstance(s, inst.instanceId);
  assert.strictEqual(removed.instanceId, inst.instanceId);
  const found = findInstance(s, inst.instanceId);
  assert.strictEqual(found, null, 'instance should no longer be found after removal');
});

test('addToZone adds to array zones at top, bottom, and index', () => {
  const s = createInitialState({ playerDeck: ['X'], opponentDeck: [] });
  // Create a fresh instance and add to player's hand
  const inst = createCardInstance('M', 'player', 'hand', s);
  let res = addToZone(s, 'player', 'hand', inst, { top: true });
  assert.ok(res.success, res.error);
  // It should be at index 0
  let found = findInstance(s, inst.instanceId);
  assert.strictEqual(found.zone, 'hand');
  assert.strictEqual(found.index, 0);

  // Add bottom
  const inst2 = createCardInstance('N', 'player', 'hand', s);
  res = addToZone(s, 'player', 'hand', inst2); // default bottom
  assert.ok(res.success, res.error);
  found = findInstance(s, inst2.instanceId);
  assert.strictEqual(found.zone, 'hand');
  // index should be >= 1
  assert.ok(found.index >= 1);

  // Insert at index
  const inst3 = createCardInstance('P', 'player', 'hand', s);
  res = addToZone(s, 'player', 'hand', inst3, { index: 1 });
  assert.ok(res.success, res.error);
  found = findInstance(s, inst3.instanceId);
  assert.strictEqual(found.zone, 'hand');
  assert.strictEqual(found.index, 1);
});

test('moveToZone moves between zones and updates owner/zone', () => {
  const s = createInitialState({ playerDeck: ['A','B','C'], opponentDeck: [] });
  const inst = s.players.player.deck[2]; // pick one from deck
  const moved = moveToZone(s, inst.instanceId, 'player', 'hand', { top: true });
  assert.ok(moved.success, moved.error);
  // Instance should now be in hand
  const found = findInstance(s, inst.instanceId);
  assert.strictEqual(found.zone, 'hand');
  assert.strictEqual(found.owner, 'player');
  // Ensure not in deck
  const stillInDeck = s.players.player.deck.find(d => d.instanceId === inst.instanceId);
  assert.strictEqual(stillInDeck, undefined, 'should no longer be in deck');
});

test('cannot add to leader zone if occupied', () => {
  const s = createInitialState({ playerLeaderId: 'L1' });
  // create second leader instance
  const inst = createCardInstance('L2', 'player', 'leader', s);
  const res = addToZone(s, 'player', 'leader', inst);
  assert.strictEqual(res.success, false, 'should fail when leader zone occupied');
});
