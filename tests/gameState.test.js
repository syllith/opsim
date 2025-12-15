// tests/gameState.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  cloneState,
  generateInstanceId,
  getCardInstanceById,
  findInstancesByCardId
} from '../src/engine/core/gameState.js';

test('createInitialState populates decks with instances and unique ids', () => {
  const s = createInitialState({
    playerDeck: ['A','B','C'],
    opponentDeck: ['X','Y'],
    playerDonDeck: ['D1','D2'],
    opponentDonDeck: ['D3'],
    playerLeaderId: 'L-P',
    opponentLeaderId: 'L-O',
    lifeCount: 0
  });
  // Basic assertions
  assert.ok(s.players, 'players exists');
  const pd = s.players.player.deck;
  assert.strictEqual(pd.length, 3, 'player deck length');
  assert.strictEqual(s.players.opponent.deck.length, 2, 'opponent deck length');
  // instance ids unique
  const ids = new Set();
  for (const inst of [...pd, ...s.players.opponent.deck, ...s.players.player.donDeck, ...(s.players.player.leader ? [s.players.player.leader] : [])]) {
    assert.ok(inst.instanceId, 'instance has id');
    assert.ok(!ids.has(inst.instanceId), 'duplicate instanceId found');
    ids.add(inst.instanceId);
  }
});

test('cloneState is a deep clone (mutating clone does not change original)', () => {
  const s = createInitialState({ playerDeck: ['A','B','C'] });
  const clone = cloneState(s);
  // modify clone's first deck instance cardId
  clone.players.player.deck[0].cardId = 'Z';
  // original must be unaffected
  assert.notStrictEqual(clone.players.player.deck[0].cardId, s.players.player.deck[0].cardId, 'original deck unaffected by clone change');
});

test('generateInstanceId increments and produces unique ids across calls', () => {
  const s = createInitialState({});
  const id1 = generateInstanceId(s);
  const id2 = generateInstanceId(s);
  assert.ok(typeof id1 === 'string' && typeof id2 === 'string');
  assert.notStrictEqual(id1, id2, 'generateInstanceId must produce unique ids');
});

test('getCardInstanceById and findInstancesByCardId locate instances', () => {
  const s = createInitialState({ playerDeck: ['A','B'], opponentDeck: ['B','C'] });
  // pick one instance id from player deck
  const pid = s.players.player.deck[1].instanceId;
  const found = getCardInstanceById(s, pid);
  assert.ok(found, 'should find instance by id');
  assert.strictEqual(found.owner, 'player');
  // find by printed card id 'B' should return two matches (one player one opponent)
  const matches = findInstancesByCardId(s, 'B');
  assert.ok(matches.length >= 2, 'should find at least two B instances');
});
