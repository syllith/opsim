// tests/donManager.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import donManager from '../src/engine/modifiers/donManager.js';
import { findInstance } from '../src/engine/core/zones.js';

test('giveDon moves DONs from costArea to target and updates givenDon', () => {
  const s = createInitialState({});
  // Prepare owner costArea with 3 DONs
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  const don2 = createCardInstance('DON', 'player', 'costArea', s);
  const don3 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1, don2, don3);

  // Create target character
  const target = createCardInstance('CHAR-X', 'player', 'char', s);
  s.players.player.char.push(target);

  // Give 2 DONs
  const res = donManager.giveDon(s, 'player', target.instanceId, 2);
  assert.ok(res.success, `giveDon failed: ${res.error}`);
  assert.strictEqual(res.moved, 2, 'moved should be 2');
  assert.strictEqual(res.newGivenCount, 2, 'givenDon should be 2');
  assert.strictEqual(s.players.player.costArea.length, 1, 'costArea should have 1 DON left');

  // Verify attached DON metadata
  const attachedIds = donManager.getAttachedDonIds(s, target.instanceId);
  assert.strictEqual(attachedIds.length, 2);
  for (const id of attachedIds) {
    const loc = findInstance(s, id);
    assert.strictEqual(loc.zone, 'attached', 'DON zone should be attached');
    assert.strictEqual(loc.instance.attachedTo, target.instanceId, 'attachedTo should be target id');
  }
});

test('giveDon partial move when insufficient DONs', () => {
  const s = createInitialState({});
  // Only 1 DON
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1);

  const target = createCardInstance('CHAR-Y', 'player', 'char', s);
  s.players.player.char.push(target);

  const res = donManager.giveDon(s, 'player', target.instanceId, 5); // request 5 but only 1 available
  assert.ok(res.success, `giveDon partial failed: ${res.error}`);
  assert.strictEqual(res.moved, 1);
  assert.strictEqual(res.newGivenCount, 1);
  assert.strictEqual(s.players.player.costArea.length, 0);
});

test('returnDonFromCard returns DONs back to costArea', () => {
  const s = createInitialState({});
  // Setup: attach 2 DONs
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  const don2 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1, don2);
  const target = createCardInstance('CHAR-Z', 'player', 'char', s);
  s.players.player.char.push(target);
  const give = donManager.giveDon(s, 'player', target.instanceId, 2);
  assert.ok(give.success && give.moved === 2);

  // Now return 1
  const ret = donManager.returnDonFromCard(s, target.instanceId, 1);
  assert.ok(ret.success, `return failed: ${ret.error}`);
  assert.strictEqual(ret.moved, 1);
  assert.strictEqual(ret.newGivenCount, 1);
  assert.strictEqual(s.players.player.costArea.length, 1, 'costArea should have 1 DON after return');
});

test('detachDon alias behaves same as returnDonFromCard', () => {
  const s = createInitialState({});
  const don = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don);
  const target = createCardInstance('CHAR-W', 'player', 'char', s);
  s.players.player.char.push(target);
  const give = donManager.giveDon(s, 'player', target.instanceId, 1);
  assert.ok(give.success && give.moved === 1);

  const det = donManager.detachDon(s, target.instanceId, 1);
  assert.ok(det.success, `detach failed: ${det.error}`);
  assert.strictEqual(det.moved, 1);
  assert.strictEqual(det.newGivenCount, 0);
  assert.strictEqual(s.players.player.costArea.length, 1);
});
