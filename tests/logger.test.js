// tests/logger.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLogger,
  log,
  logAction,
  getLog,
  getActionLog,
  formatForDisplay,
  serializeLog,
  deserializeLog
} from '../src/engine/persistence/logger.js';

test('createLogger -> empty logger shape', () => {
  const logger = createLogger();
  assert.ok(logger);
  assert.ok(Array.isArray(logger.entries));
  assert.strictEqual(logger.entries.length, 0);
  assert.strictEqual(logger.nextSequence, 1);
});

test('log and sequence increments', () => {
  let logger = createLogger();
  logger = log(logger, 'info', 'GAME_STARTED', { msg: 'Started' });
  logger = log(logger, 'action', 'CARD_PLAYED', { playerId: 'player', cardId: 'OP01-001', destination: 'char' });
  logger = log(logger, 'debug', 'DBG', { x: 1 });
  const all = getLog(logger);
  assert.strictEqual(all.length, 3);
  assert.strictEqual(all[0].sequence, 1);
  assert.strictEqual(all[1].sequence, 2);
  assert.strictEqual(all[2].sequence, 3);
});

test('getActionLog filters correctly', () => {
  let logger = createLogger();
  logger = log(logger, 'debug', 'DBG', {});
  logger = log(logger, 'action', 'CARD_PLAYED', { playerId: 'player', cardId: 'OP01-001' });
  logger = log(logger, 'info', 'PHASE_CHANGED', {});
  logger = log(logger, 'action', 'ATTACK_DECLARED', { playerId: 'player', attackerId: 'i-1', targetId: 'leader' });

  const actions = getActionLog(logger);
  assert.strictEqual(actions.length, 2);
  assert.strictEqual(actions[0].eventType, 'CARD_PLAYED');
  assert.strictEqual(actions[1].eventType, 'ATTACK_DECLARED');
});

test('serialize/deserialize roundtrip', () => {
  let logger = createLogger();
  logger = log(logger, 'action', 'CARD_PLAYED', { playerId: 'player', cardId: 'OP01-010' });
  const s = serializeLog(logger);
  assert.ok(typeof s === 'string');
  const parsed = deserializeLog(s);
  assert.deepStrictEqual(parsed, logger);
});

test('formatForDisplay: CARD_PLAYED and ATTACK_DECLARED produce readable strings', () => {
  let logger = createLogger();
  logger = log(logger, 'action', 'CARD_PLAYED', { playerId: 'player', cardId: 'OP01-003', destination: 'char' });
  logger = log(logger, 'action', 'ATTACK_DECLARED', { playerId: 'player', attackerId: 'i-7', targetId: 'leader' });
  const entries = getActionLog(logger);

  const s0 = formatForDisplay(entries[0]);
  assert.ok(s0.includes('player plays OP01-003'));
  assert.ok(s0.startsWith('[1]'));

  const s1 = formatForDisplay(entries[1]);
  assert.ok(s1.includes('attacks leader with i-7'));
  assert.ok(s1.startsWith('[2]'));
});

test('formatForDisplay: fallback for unknown event', () => {
  let logger = createLogger();
  logger = log(logger, 'info', 'SOME_UNKNOWN', { foo: 'bar' });
  const e = getLog(logger)[0];
  const out = formatForDisplay(e);
  assert.ok(out.includes('SOME_UNKNOWN'));
  assert.ok(out.includes('"foo":"bar"'));
});
