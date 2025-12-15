// tests/playCard.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import { playCard } from '../src/engine/actions/playCard.js';

const { findInstance, addToZone, createAndAdd } = zones;

test('playCard rests DONs equal to cost and moves card to char', () => {
  const s = createInitialState({});
  // Create three DONs in costArea
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  const don2 = createCardInstance('DON', 'player', 'costArea', s);
  const don3 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1, don2, don3);

  // Create a card in hand with cost 2
  const inst = createAndAdd(s, 'CHAR-PLAY', 'player', 'hand');
  inst.cost = 2;

  // Play the card paying cost
  const res = playCard(s, inst.instanceId, 'char', { payCost: true });
  assert.ok(res.success, `playCard failed: ${res.error}`);
  assert.strictEqual(res.paidCost, 2, 'should have paid 2 DONs');

  // Verify instance now in char
  const found = findInstance(s, inst.instanceId);
  assert.strictEqual(found.zone, 'char', 'instance must be placed in char');

  // Verify two DONs were rested
  const rested = s.players.player.costArea.filter(d => d && d.state === 'rested').length;
  assert.strictEqual(rested, 2, 'two DONs should be rested in costArea');
});

test('playCard fails when insufficient available DONs', () => {
  const s = createInitialState({});
  // Only one DON, and it's already rested
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  don1.state = 'rested';
  s.players.player.costArea.push(don1);

  // Card in hand cost 2
  const inst = createAndAdd(s, 'CHAR-PLAY-2', 'player', 'hand');
  inst.cost = 2;

  const res = playCard(s, inst.instanceId, 'char', { payCost: true });
  assert.strictEqual(res.success, false, 'playCard must fail when insufficient DONs');
  assert.ok(res.error, 'error message expected');

  // Ensure card still in hand
  const found = findInstance(s, inst.instanceId);
  assert.strictEqual(found.zone, 'hand', 'card should remain in hand on failure');
});
