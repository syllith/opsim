// tests/selector.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import selector from '../src/engine/rules/selector.js';

const { createAndAdd } = zones;

test('evaluateSelector finds characters by side', () => {
  const s = createInitialState({});
  // create three characters for player
  const a = createAndAdd(s, 'C1', 'player', 'char');
  const b = createAndAdd(s, 'C2', 'player', 'char');
  const c = createAndAdd(s, 'C3', 'player', 'char');

  const sel = { side: 'self', type: 'character' };
  const res = selector.evaluateSelector(s, sel, { activePlayer: 'player' });
  assert.ok(Array.isArray(res), 'should return an array');
  // We expect at least the 3 we created (order may include others, but ensure these are present)
  const ids = res.map(x => x.instanceId);
  assert.ok(ids.includes(a.instanceId), 'should contain a');
  assert.ok(ids.includes(b.instanceId), 'should contain b');
  assert.ok(ids.includes(c.instanceId), 'should contain c');
});

test('resolveSelector string -> selfTopDeckCard returns top deck card', () => {
  const s = createInitialState({});
  // create deck with two cards; push ensures bottom, but deck array index 0 is top
  const top = createCardInstance('TOP-1', 'player', 'deck', s);
  const next = createCardInstance('NEXT-1', 'player', 'deck', s);
  s.players.player.deck.unshift(top);
  s.players.player.deck.push(next);

  const res = selector.evaluateSelector(s, 'selfTopDeckCard', { activePlayer: 'player' });
  assert.ok(Array.isArray(res), 'result should be array');
  assert.strictEqual(res.length, 1, 'should return exactly one top card');
  assert.strictEqual(res[0].instanceId, top.instanceId, 'returned card should be the deck top');
});

test('validateSelection enforces min constraint', () => {
  const s = createInitialState({});
  const inst = createCardInstance('A', 'player', 'char', s);
  const candidates = [inst];

  const sel = { min: 2 };
  const chk = selector.validateSelection(candidates, sel);
  assert.strictEqual(chk.valid, false, 'should be invalid when fewer than min');
  assert.ok(chk.error && chk.error.includes('at least'), 'error message should mention minimum');
});

test('applyDistinctBy filters duplicates by field', () => {
  const s = createInitialState({});
  // create three instances: two with same cardId 'DUP', one with 'UNQ'
  const a = createAndAdd(s, 'DUP', 'player', 'hand');
  const b = createAndAdd(s, 'DUP', 'player', 'hand');
  const c = createAndAdd(s, 'UNQ', 'player', 'hand');

  const out = selector.applyDistinctBy([a, b, c], 'cardId');
  const ids = out.map(x => x.instanceId);
  // Expect only two unique cardIds (DUP and UNQ)
  assert.strictEqual(out.length, 2);
  // Ensure one of the DUP instances present and the UNQ present
  assert.ok(ids.includes(a.instanceId) || ids.includes(b.instanceId), 'one DUP should remain');
  assert.ok(ids.includes(c.instanceId), 'UNQ should remain');
});

test('thisCard type returns context.thisCard', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'THIS-1', 'player', 'char');

  const sel = { type: 'thisCard' };
  const res = selector.evaluateSelector(s, sel, { thisCard: inst, activePlayer: 'player' });
  assert.ok(Array.isArray(res), 'result array expected');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].instanceId, inst.instanceId);
});
