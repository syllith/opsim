// tests/keywordEffect.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import keywordEffect from '../src/engine/actions/keywordEffect.js';
import keywordManager from '../src/engine/modifiers/keywordManager.js';

test('grant Blocker to character', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C1', 'player', 'char', s);
  s.players.player.char.push(ch);

  const res = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'grant', keyword: 'Blocker', duration: 'permanent', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(res.success);
  // Now has Blocker
  const has = keywordManager.hasKeyword(s, ch.instanceId, 'Blocker');
  assert.strictEqual(has, true);
});

test('revoke printed Rush', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C2', 'player', 'char', s);
  ch.keywords = ['Rush'];
  s.players.player.char.push(ch);

  // revoke Rush
  const res = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'revoke', keyword: 'Rush', duration: 'permanent', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(res.success);
  const has = keywordManager.hasKeyword(s, ch.instanceId, 'Rush');
  assert.strictEqual(has, false, 'Rush should be revoked');
});

test('revoke beats grant', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C3', 'player', 'char', s);
  s.players.player.char.push(ch);

  const g = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'grant', keyword: 'Blocker', duration: 'permanent', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(g.success);
  const r = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'revoke', keyword: 'Blocker', duration: 'permanent', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(r.success);
  const has = keywordManager.hasKeyword(s, ch.instanceId, 'Blocker');
  assert.strictEqual(has, false, 'revoke should beat grant');
});

test('expire keywords on turn end (thisTurn)', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C4', 'player', 'char', s);
  s.players.player.char.push(ch);
  // grant thisTurn
  const g = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'grant', keyword: 'Blocker', duration: 'thisTurn', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(g.success);
  // should have Blocker now
  assert.strictEqual(keywordManager.hasKeyword(s, ch.instanceId, 'Blocker'), true);
  // expire
  const exp = keywordManager.expireKeywords(s, 'turnEnd');
  assert.ok(exp.success);
  // should be removed
  assert.strictEqual(keywordManager.hasKeyword(s, ch.instanceId, 'Blocker'), false);
});

test('clearKeywordsForInstance removes modifiers', () => {
  const s = createInitialState({});
  const ch = createCardInstance('C5', 'player', 'char', s);
  s.players.player.char.push(ch);
  const g = keywordEffect.execute(s, { type: 'keywordEffect', operation: 'grant', keyword: 'Blocker', duration: 'permanent', target: ch.instanceId }, { activePlayer: 'player' });
  assert.ok(g.success);
  // clear
  keywordManager.clearKeywordsForInstance(s, ch.instanceId);
  // should not have Blocker
  assert.strictEqual(keywordManager.hasKeyword(s, ch.instanceId, 'Blocker'), false);
});
