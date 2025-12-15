// tests/turnController.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { refreshPhase, donPhase } from '../src/engine/core/turnController.js';
import donManager from '../src/engine/modifiers/donManager.js';
import { findInstance, createAndAdd } from '../src/engine/core/zones.js';

test('refreshPhase returns attached DONs from leader and sets costArea DONs active', () => {
  const s = createInitialState({});
  // Create 2 DONs in costArea
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  const don2 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1, don2);

  // Create leader and attach 2 DONs
  const leader = createCardInstance('LEADER-A', 'player', 'leader', s);
  s.players.player.leader = leader;
  // Attach via donManager.giveDon to ensure consistent behavior
  const gres = donManager.giveDon(s, 'player', leader.instanceId, 2);
  assert.ok(gres.success && gres.moved === 2);

  // Now run refreshPhase, which should return attached DONs to costArea and set them active
  const res = refreshPhase(s, 'player');
  assert.ok(res.success, `refreshPhase failed: ${res.errors.join(',')}`);
  assert.strictEqual(res.returnedTotal >= 2, true, 'should have returned at least 2 DONs');

  // Leader should have zero givenDon
  assert.strictEqual((s.players.player.leader.givenDon || 0), 0, 'leader givenDon should be 0 after refresh');

  // costArea should contain DONs and they should be active (state === 'active')
  const costDonActiveCount = s.players.player.costArea.filter(d => d && d.state === 'active').length;
  assert.ok(costDonActiveCount >= 2, `expected at least 2 active DONs in costArea, found ${costDonActiveCount}`);
});

test('donPhase places 2 DONs (1 if first player) from donDeck to costArea and sets faceUp', () => {
  const s = createInitialState({});
  // Populate donDeck with 3 dons
  const d1 = createCardInstance('DON', 'player', 'donDeck', s);
  const d2 = createCardInstance('DON', 'player', 'donDeck', s);
  const d3 = createCardInstance('DON', 'player', 'donDeck', s);
  s.players.player.donDeck.push(d1, d2, d3);

  // Non-first player -> should place 2
  let res = donPhase(s, 'player', false);
  assert.ok(res.success && res.placed === 2, `expected place 2 dons, got ${res.placed}`);
  assert.strictEqual(s.players.player.costArea.length, 2, 'costArea should have 2 dons');
  // Those dons should be faceUp
  assert.strictEqual(s.players.player.costArea[0].faceUp, true);
  assert.strictEqual(s.players.player.costArea[1].faceUp, true);

  // Now if first player true and donDeck has at least 1 left: place only 1
  s.players.player.donDeck.push(d3); // ensure one left
  res = donPhase(s, 'player', true);
  assert.ok(res.success && res.placed === 1, 'first player should place 1 don');
});
