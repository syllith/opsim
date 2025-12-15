// tests/interpreter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import interpreter from '../src/engine/actions/interpreter.js';
import engine from '../src/engine/index.js';

const { createAndAdd } = zones;

test('interpreter can play a card (paying DON cost) via playCard action', () => {
  const s = createInitialState({});
  // Prepare costArea with 2 DONs
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  const d2 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1, d2);

  // Card in hand
  const card = createAndAdd(s, 'CHAR-INT', 'player', 'hand');
  card.cost = 2;

  const action = { type: 'playCard', instanceId: card.instanceId, destination: 'char', options: { payCost: true } };
  const res = interpreter.executeAction(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `playCard via interpreter failed: ${res.error}`);
  assert.strictEqual(res.paidCost, 2);
  const found = zones.findInstance(s, card.instanceId);
  assert.strictEqual(found.zone, 'char');
  const restedCount = s.players.player.costArea.filter(d => d && d.state === 'rested').length;
  assert.strictEqual(restedCount, 2);
});

test('interpreter can register a modifyStat via modifyStat action', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'CHAR-STAT', 'player', 'char');
  inst.basePower = 1000;

  const action = {
    type: 'modifyStat',
    stat: 'power',
    mode: 'add',
    amount: 1500,
    targetInstanceIds: [inst.instanceId],
    duration: 'permanent'
  };
  const res = interpreter.executeAction(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `modifyStat failed: ${res.error}`);
  // check via engine.getTotalPower
  const p = engine.getTotalPower(s, inst.instanceId, { isOwnerTurn: false });
  assert.strictEqual(p, 2500);
});

test('interpreter can perform giveDon action', () => {
  const s = createInitialState({});
  // Prepare DON in costArea
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1);
  const target = createAndAdd(s, 'CHAR-GD', 'player', 'char');

  const action = { type: 'giveDon', count: 1, target: target.instanceId, enterRested: true };
  const res = interpreter.executeAction(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `giveDon via interpreter failed: ${res.error}`);
  assert.strictEqual(res.moved, 1);
  const attached = target.attachedDons || [];
  assert.strictEqual(attached.length, 1);
  assert.strictEqual(attached[0].state, 'rested', 'attached DON should be rested');
});
