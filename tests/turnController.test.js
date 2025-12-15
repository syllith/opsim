// tests/turnController.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { startTurn } from '../src/engine/core/turnController.js';

test('startTurn runs refresh, draw, and don phases (normal case)', () => {
  const s = createInitialState({});
  // put three cards in deck and three DONs in donDeck
  const c1 = createCardInstance('C1', 'player', 'deck', s);
  const c2 = createCardInstance('C2', 'player', 'deck', s);
  const c3 = createCardInstance('C3', 'player', 'deck', s);
  s.players.player.deck.push(c1, c2, c3);
  const d1 = createCardInstance('DON1', 'player', 'donDeck', s);
  const d2 = createCardInstance('DON2', 'player', 'donDeck', s);
  const d3 = createCardInstance('DON3', 'player', 'donDeck', s);
  s.players.player.donDeck.push(d1, d2, d3);

  const res = startTurn(s, 'player', { isFirstTurn: false, isFirstPlayer: false });
  assert.ok(res.success, 'startTurn should succeed');
  // Draw 1
  assert.strictEqual(s.players.player.hand.length, 1, 'player should have drawn 1 card');
  // DON Phase places 2
  assert.strictEqual(s.players.player.costArea.length, 2, 'costArea should have 2 DONs after donPhase');
  // Phase is Main
  assert.strictEqual(res.phase, 'Main');
});

test('startTurn first player first turn: skip draw and place only 1 DON', () => {
  const s = createInitialState({});
  // ensure donDeck has two cards
  const d1 = createCardInstance('DON1', 'player', 'donDeck', s);
  const d2 = createCardInstance('DON2', 'player', 'donDeck', s);
  s.players.player.donDeck.push(d1, d2);

  // start turn as first player's first turn
  const res = startTurn(s, 'player', { isFirstTurn: true, isFirstPlayer: true });
  assert.ok(res.success, 'startTurn should succeed for first-turn');
  // draw skipped
  assert.strictEqual(s.players.player.hand.length, 0, 'first player first turn should skip draw');
  // DON phase placed only 1
  assert.strictEqual(s.players.player.costArea.length, 1, 'first player first turn should place only 1 DON');
});

test('startTurn draws cause deck-out and sets defeat (but returns success)', () => {
  const s = createInitialState({});
  // Ensure deck empty
  s.players.player.deck = [];
  const res = startTurn(s, 'player', { isFirstTurn: false, isFirstPlayer: false });
  // startTurn should still return success true, but report defeat
  assert.strictEqual(res.success, true, 'startTurn should return success even if deck-out occurs during draw');
  assert.ok(s.defeat && s.defeat.loser === 'player', 'deck-out should set defeat.loser=player');
  assert.ok(res.defeat && res.defeat.loser === 'player', 'startTurn result should include defeat info');
});
