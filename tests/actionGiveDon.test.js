// tests/actionGiveDon.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { createAndAdd } from '../src/engine/core/zones.js';
import giveDonAction from '../src/engine/actions/giveDon.js';
import donManager from '../src/engine/modifiers/donManager.js';
import { findInstance } from '../src/engine/core/zones.js';

test('giveDon action moves DONs to leader and updates givenDon', () => {
  const s = createInitialState({});
  // Put 3 DONs into player's costArea
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  const d2 = createCardInstance('DON', 'player', 'costArea', s);
  const d3 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1, d2, d3);

  // Create leader
  const leader = createCardInstance('LEADER-A', 'player', 'leader', s);
  s.players.player.leader = leader;

  // Execute giveDon action: give 2 to leader
  const action = { type: 'giveDon', count: 2, target: leader.instanceId };
  const result = giveDonAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(result.success, `giveDon failed: ${result.error}`);
  assert.strictEqual(result.moved, 2, 'moved should be 2');
  assert.strictEqual(result.newGivenCount, 2, 'leader givenDon should be 2');
  assert.strictEqual(s.players.player.costArea.length, 1, 'costArea should have 1 left');
  // Verify attached DONs
  const attachedIds = donManager.getAttachedDonIds(s, leader.instanceId);
  assert.strictEqual(attachedIds.length, 2, 'two attached DONs');
  for (const id of attachedIds) {
    const loc = findInstance(s, id);
    assert.ok(loc, 'attached don findable');
    assert.strictEqual(loc.zone, 'attached', 'attached don must be in attached zone');
    assert.strictEqual(loc.parentInstance.instanceId, leader.instanceId);
  }
});

test('giveDon action with enterRested sets DON state to rested', () => {
  const s = createInitialState({});
  // one DON
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1);
  const target = createAndAdd(s, 'CHAR-1', 'player', 'char');

  const action = { type: 'giveDon', count: 1, target: target.instanceId, enterRested: true };
  const res = giveDonAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(res.success && res.moved === 1, 'expected success moving 1 don');

  // Find attached don and verify state
  const attachedIds = donManager.getAttachedDonIds(s, target.instanceId);
  assert.strictEqual(attachedIds.length, 1);
  const loc = findInstance(s, attachedIds[0]);
  assert.strictEqual(loc.instance.state, 'rested', 'attached DON should be rested');
});

test('giveDon action partial move when insufficient DONs', () => {
  const s = createInitialState({});
  // zero DONs in costArea
  const target = createAndAdd(s, 'CHAR-2', 'player', 'char');
  const action = { type: 'giveDon', count: 2, target: target.instanceId };
  const res = giveDonAction.execute(s, action, { activePlayer: 'player' });
  // donManager.giveDon returns success with moved 0; our action returns success with moved 0
  assert.ok(res.success, 'action should succeed even with moved 0 (partial semantics)');
  assert.strictEqual(res.moved, 0, 'moved should be 0 when no DONs');
});
