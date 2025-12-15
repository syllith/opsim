// tests/expressions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import expressions from '../src/engine/rules/expressions.js';
import selector from '../src/engine/rules/selector.js';
import keywordManager from '../src/engine/modifiers/keywordManager.js';
import zones from '../src/engine/core/zones.js';

const { createAndAdd } = zones;

test('evaluateExpression numeric power comparison', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'C-PWR', 'player', 'char');
  inst.basePower = 1500;

  const expr = { field: 'power', op: '>=', value: 1200 };
  const ok = expressions.evaluateExpression(expr, inst, s, { isOwnerTurn: false, activePlayer: 'player' });
  assert.strictEqual(ok, true, 'power >= 1200 should be true');
});

test('evaluateExpression logic AND/OR', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'C-LOG', 'player', 'char');
  inst.basePower = 2000;
  inst.cost = 2;

  const exprAnd = { logic: 'AND', all: [{ field: 'power', op: '>=', value: 1500 }, { field: 'cost', op: '=', value: 2 }] };
  assert.strictEqual(expressions.evaluateExpression(exprAnd, inst, s, {}), true);

  const exprOr = { logic: 'OR', any: [{ field: 'power', op: '<', value: 1000 }, { field: 'cost', op: '=', value: 2 }] };
  assert.strictEqual(expressions.evaluateExpression(exprOr, inst, s, {}), true);
});

test('selectorCount counts characters', () => {
  const s = createInitialState({});
  createAndAdd(s, 'C1', 'player', 'char');
  createAndAdd(s, 'C2', 'player', 'char');

  const expr = { field: 'selectorCount', selector: { side: 'self', type: 'character' }, op: '>=', value: 2 };
  const ok = expressions.evaluateExpression(expr, null, s, { activePlayer: 'player' });
  assert.strictEqual(ok, true, 'selectorCount should see 2 characters');
});

test('selectorStatTotal sums power', () => {
  const s = createInitialState({});
  const a = createAndAdd(s, 'A', 'player', 'char'); a.basePower = 1000;
  const b = createAndAdd(s, 'B', 'player', 'char'); b.basePower = 2000;

  const expr = { field: 'selectorStatTotal', selector: { side: 'self', type: 'character' }, stat: 'power', op: '=', value: 3000 };
  const ok = expressions.evaluateExpression(expr, null, s, { activePlayer: 'player', isOwnerTurn: false });
  assert.strictEqual(ok, true, 'selectorStatTotal should sum to 3000');
});

test('selectorCountCompare and selectorCountDifference', () => {
  const s = createInitialState({});
  // player has 2 chars, opponent has 1
  createAndAdd(s, 'P1', 'player', 'char');
  createAndAdd(s, 'P2', 'player', 'char');
  createAndAdd(s, 'O1', 'opponent', 'char');

  const exprCompare = {
    field: 'selectorCountCompare',
    selectorA: { side: 'self', type: 'character' },
    selectorB: { side: 'opponent', type: 'character' },
    op: '>',
  };
  const okC = expressions.evaluateExpression(exprCompare, null, s, { activePlayer: 'player' });
  assert.strictEqual(okC, true, 'player char count should be greater than opponent');

  const exprDiff = {
    field: 'selectorCountDifference',
    selectorA: { side: 'self', type: 'character' },
    selectorB: { side: 'opponent', type: 'character' },
    op: '=',
    value: 1
  };
  const okD = expressions.evaluateExpression(exprDiff, null, s, { activePlayer: 'player' });
  assert.strictEqual(okD, true, 'difference should be 1');
});

test('selfStatVsSelectorCount compares card stat to selector count', () => {
  const s = createInitialState({});
  const subject = createAndAdd(s, 'S1', 'player', 'char');
  subject.basePower = 3; // treated as 3 for stat comparison
  // create 3 opponent chars
  createAndAdd(s, 'O1', 'opponent', 'char');
  createAndAdd(s, 'O2', 'opponent', 'char');
  createAndAdd(s, 'O3', 'opponent', 'char');

  const expr = {
    field: 'selfStatVsSelectorCount',
    stat: 'power',
    selector: { side: 'opponent', type: 'character' },
    op: '>=',
  };
  const ok = expressions.evaluateExpression(expr, subject, s, { activePlayer: 'player', isOwnerTurn: false });
  // subject power (3) >= opponent character count (3) -> true
  assert.strictEqual(ok, true);
});

test('battleOpponent attribute handling', () => {
  const s = createInitialState({});
  const subject = createAndAdd(s, 'S2', 'player', 'char');
  // simulate battle opponent
  const opp = createAndAdd(s, 'OPP', 'opponent', 'char');
  opp.attributes = ['slash'];
  const expr = { field: 'battleOpponent', attribute: 'slash', op: '=', value: true };
  const ok = expressions.evaluateExpression(expr, subject, s, { battleOpponent: opp });
  assert.strictEqual(ok, true, 'battleOpponent attribute should be true');
});

test('hasKeyword works with printed keywords and via keywordManager', () => {
  const s = createInitialState({});
  const c = createAndAdd(s, 'K1', 'player', 'char');
  // printed keyword
  c.keywords = ['Rush'];
  const exprPrinted = { field: 'hasKeyword', value: 'Rush' };
  assert.strictEqual(expressions.evaluateExpression(exprPrinted, c, s, {}), true);

  // dynamic grant via keywordManager
  const d = createAndAdd(s, 'K2', 'player', 'char');
  const res = keywordManager.grantKeyword(s, d.instanceId, 'Blocker', 'permanent', null, 'player');
  assert.ok(res.success);
  const exprGrant = { field: 'hasKeyword', value: 'Blocker' };
  assert.strictEqual(expressions.evaluateExpression(exprGrant, d, s, {}), true);
});

test('evaluateCondition with null returns true', () => {
  const s = createInitialState({});
  assert.strictEqual(expressions.evaluateCondition(null, s, {}), true);
});
