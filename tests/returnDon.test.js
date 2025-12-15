// tests/returnDon.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import returnDonAction from '../src/engine/actions/returnDon.js';
import donManager from '../src/engine/modifiers/donManager.js';

test('returnDon from costArea moves DONs to donDeck', () => {
  const s = createInitialState({});
  // Put 5 DONs into costArea
  for (let i = 0; i < 5; i++) {
    const d = createCardInstance(`DON${i}`, 'player', 'costArea', s);
    s.players.player.costArea.push(d);
  }
  const res = returnDonAction.execute(s, { type: 'returnDon', count: 2 }, { activePlayer: 'player' });
  assert.ok(res.success, `returnDon failed: ${res.error}`);
  assert.strictEqual(res.moved, 2);
  assert.strictEqual(s.players.player.costArea.length, 3, 'costArea should have 3 left');
  assert.strictEqual(s.players.player.donDeck.length, 2, 'donDeck should have 2 returned DONs');
});

test('returnDon from attached card returns and moves DON to donDeck', () => {
  const s = createInitialState({});
  // Create char and attach 2 DONs
  const ch = createCardInstance('C1', 'player', 'char', s);
  s.players.player.char.push(ch);
  const d1 = createCardInstance('DON-A', 'player', 'costArea', s);
  const d2 = createCardInstance('DON-B', 'player', 'costArea', s);
  s.players.player.costArea.push(d1, d2);
  // Attach two
  let g = donManager.giveDon(s, 'player', ch.instanceId, 2);
  assert.ok(g.success && g.moved === 2);
  // Now return 1 from that char
  const res = returnDonAction.execute(s, { type: 'returnDon', count: 1, selector: { instanceId: ch.instanceId } }, { activePlayer: 'player' });
  assert.ok(res.success, `return from attached failed: ${res.error}`);
  assert.strictEqual(res.moved, 1, 'should have moved 1 DON to donDeck');
  // attachedDons on char should now be 1
  assert.strictEqual((ch.attachedDons || []).length, 1);
  // donDeck should have 1
  assert.strictEqual(s.players.player.donDeck.length, 1);
});

test('returnDon handles insufficient DONs gracefully', () => {
  const s = createInitialState({});
  // No DONs
  const res = returnDonAction.execute(s, { type: 'returnDon', count: 3 }, { activePlayer: 'player' });
  assert.ok(res.success, 'should succeed even if none available');
  assert.strictEqual(res.moved, 0);
  // Add one DON
  const d = createCardInstance('DONX', 'player', 'costArea', s);
  s.players.player.costArea.push(d);
  const res2 = returnDonAction.execute(s, { type: 'returnDon', count: 3 }, { activePlayer: 'player' });
  assert.ok(res2.success);
  assert.strictEqual(res2.moved, 1);
  assert.strictEqual(s.players.player.donDeck.length, 1);
  assert.strictEqual(s.players.player.costArea.length, 0);
});
