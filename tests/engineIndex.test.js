// tests/engineIndex.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import engine from '../src/engine/index.js';
import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { modifyStat } from '../src/engine/actions/modifyStat.js';

test('getTotalPower applies add modifier via modifyStat', () => {
  const s = createInitialState({});
  const inst = createCardInstance('C-A', 'player', 'char', s);
  s.players.player.char.push(inst);
  // set base power directly on instance for now
  inst.basePower = 5000;

  // Register +2000 add modifier
  const res = modifyStat(s, {
    stat: 'power',
    mode: 'add',
    amount: 2000,
    targetInstanceIds: [inst.instanceId],
    duration: 'permanent',
    ownerId: 'player'
  });
  assert.ok(res.success, 'modifyStat expected to succeed');

  const p = engine.getTotalPower(s, inst.instanceId, { isOwnerTurn: false });
  assert.strictEqual(p, 7000, 'expected base + add modifier = 7000');
});

test('getTotalPower applies DON bonus when owner turn', () => {
  const s = createInitialState({});
  const inst = createCardInstance('C-B', 'player', 'char', s);
  inst.basePower = 3000;
  inst.givenDon = 2;
  s.players.player.char.push(inst);

  const p1 = engine.getTotalPower(s, inst.instanceId, { isOwnerTurn: true });
  assert.strictEqual(p1, 3000 + 2 * 1000, 'expected don bonus applied on owner turn');

  const p2 = engine.getTotalPower(s, inst.instanceId, { isOwnerTurn: false });
  assert.strictEqual(p2, 3000, 'expected no don bonus when not owner turn');
});
