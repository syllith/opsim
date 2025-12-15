// tests/dealDamage.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import damageAndLife from '../src/engine/core/damageAndLife.js';
import { dealDamage } from '../src/engine/actions/dealDamage.js';

test('dealDamage moves one life card to hand', () => {
  const s = createInitialState({});
  // Prepare a life card for player
  const lifeCard = createCardInstance('LIFE-1', 'player', 'life', s);
  s.players.player.life.push(lifeCard);

  const res = dealDamage(s, 'player', 1);
  assert.ok(res.success, 'dealDamage should succeed');
  assert.strictEqual(res.moved, 1, 'should have moved 1 life card');
  // verify hand contains the life card
  assert.strictEqual(s.players.player.hand.length, 1, 'player hand should have 1 card');
  assert.strictEqual(s.players.player.life.length, 0, 'player life should be empty');
});

test('dealDamage repeats for multiple damage', () => {
  const s = createInitialState({});
  // Prepare 3 life cards
  for (let i = 0; i < 3; i++) {
    const lc = createCardInstance(`LIFE-${i}`, 'player', 'life', s);
    s.players.player.life.push(lc);
  }
  const res = dealDamage(s, 'player', 2);
  assert.ok(res.success);
  assert.strictEqual(res.moved, 2);
  assert.strictEqual(s.players.player.hand.length, 2);
  assert.strictEqual(s.players.player.life.length, 1);
});

test('dealDamage triggers defeat when life is zero', () => {
  const s = createInitialState({});
  // Ensure life is empty
  s.players.player.life = [];
  // Deal damage; should set defeat marker
  const res = dealDamage(s, 'player', 1);
  assert.ok(res.success);
  assert.ok(res.defeat && res.defeat.loser === 'player', 'defeat marker should be set for player');
});
