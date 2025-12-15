// tests/attachDon.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import attachDonAction from '../src/engine/actions/attachDon.js';
import donManager from '../src/engine/modifiers/donManager.js';
import { findInstance } from '../src/engine/core/zones.js';

test('attachDon from costArea attaches DON to target', () => {
  const s = createInitialState({});
  // put 2 DONs into costArea
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  const d2 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1, d2);
  // target char
  const t = createCardInstance('CHAR-T', 'player', 'char', s);
  s.players.player.char.push(t);

  const action = { type: 'attachDon', target: t.instanceId, count: 2 };
  const res = attachDonAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `attachDon failed: ${res.error}`);
  assert.strictEqual(res.moved, 2);
  assert.strictEqual((t.attachedDons || []).length, 2);
});

test('attachDon move between cards', () => {
  const s = createInitialState({});
  // create two chars
  const src = createCardInstance('SRC', 'player', 'char', s);
  const dst = createCardInstance('DST', 'player', 'char', s);
  s.players.player.char.push(src, dst);
  // create DON and attach to src via donManager
  const d = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d);
  const g = donManager.giveDon(s, 'player', src.instanceId, 1);
  assert.ok(g.success && g.moved === 1);
  // Now move 1 DON from src to dst
  const action = { type: 'attachDon', target: dst.instanceId, selector: { instanceId: src.instanceId }, count: 1 };
  const res = attachDonAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(res.success, `attachDon between cards failed: ${res.error}`);
  assert.strictEqual(res.moved, 1);
  assert.strictEqual((src.attachedDons || []).length, 0);
  assert.strictEqual((dst.attachedDons || []).length, 1);
});

test('attachDon may=false confirm=false does nothing', () => {
  const s = createInitialState({});
  // costArea DON
  const d1 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(d1);
  const t = createCardInstance('CHAR-T2', 'player', 'char', s);
  s.players.player.char.push(t);

  const action = { type: 'attachDon', target: t.instanceId, count: 1, may: true, confirm: false };
  const res = attachDonAction.execute(s, action, { activePlayer: 'player' });
  assert.ok(res.success);
  assert.strictEqual(res.moved, 0, 'should not have moved any DONs when confirm=false');
  assert.strictEqual((t.attachedDons || []).length, 0);
});
