// tests/battle.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import { conductBattle } from '../src/engine/core/battle.js';

const { findInstance, createAndAdd } = zones;

test('character vs character: attacker >= defender -> defender K.O.', () => {
  const s = createInitialState({});
  // Create attacker as active with basePower 5000
  const attacker = createCardInstance('A', 'player', 'char', s);
  attacker.basePower = 5000;
  attacker.state = 'active';
  s.players.player.char.push(attacker);

  // Create defender as rested with basePower 4000
  const defender = createCardInstance('D', 'opponent', 'char', s);
  defender.basePower = 4000;
  defender.state = 'rested';
  s.players.opponent.char.push(defender);

  const res = conductBattle(s, attacker.instanceId, defender.instanceId);
  assert.ok(res.success);
  assert.strictEqual(res.winner, 'attacker', 'attacker should win');
  // Defender should now be in opponent's trash
  const found = findInstance(s, defender.instanceId);
  assert.ok(found && found.zone === 'trash', 'defender should be in trash after KO');
});

test('attacker vs leader: attacker >= leader -> leader takes 1 damage', () => {
  const s = createInitialState({});
  // Create attacker
  const attacker = createCardInstance('Atk', 'player', 'char', s);
  attacker.basePower = 3000;
  attacker.state = 'active';
  s.players.player.char.push(attacker);

  // Create opponent leader with a single life card
  const leader = createCardInstance('Ldr', 'opponent', 'leader', s);
  leader.basePower = 1000;
  s.players.opponent.leader = leader;
  // Put one life card on opponent
  const life = createCardInstance('LC', 'opponent', 'life', s);
  s.players.opponent.life.push(life);

  const res = conductBattle(s, attacker.instanceId, leader.instanceId);
  assert.ok(res.success);
  assert.strictEqual(res.winner, 'attacker', 'attacker should win');
  assert.ok(res.leaderDamage, 'leaderDamage result expected');
  assert.strictEqual(s.players.opponent.hand.length, 1, 'opponent should have drawn a life card to hand');
});

test('blocker blocks attack instead of leader', () => {
  const s = createInitialState({});
  // Attacker
  const attacker = createCardInstance('A', 'player', 'char', s);
  attacker.basePower = 4000;
  attacker.state = 'active';
  s.players.player.char.push(attacker);

  // Opponent has leader and a blocker
  const leader = createCardInstance('L', 'opponent', 'leader', s);
  leader.basePower = 1000;
  s.players.opponent.leader = leader;
  // Life card to ensure no defeat
  s.players.opponent.life.push(createCardInstance('LC1', 'opponent', 'life', s));

  // Blocker char
  const blocker = createCardInstance('B', 'opponent', 'char', s);
  blocker.basePower = 2000;
  blocker.state = 'active';
  blocker.keywords = ['Blocker'];
  s.players.opponent.char.push(blocker);

  const res = conductBattle(s, attacker.instanceId, leader.instanceId);
  assert.ok(res.success);
  // Since blocker had power 2000 < attacker 4000, attacker should win and blocker K.O.'d
  assert.strictEqual(res.winner, 'attacker');
  const foundBlock = findInstance(s, blocker.instanceId);
  assert.ok(foundBlock && foundBlock.zone === 'trash', 'blocker should be K.O.d and in trash');
  // Leader should be untouched - still present on leader zone
  const leaderLoc = findInstance(s, leader.instanceId);
  assert.ok(leaderLoc && leaderLoc.zone === 'leader', 'leader should remain on field');
});
