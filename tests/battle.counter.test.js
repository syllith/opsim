// tests/battle.counter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import { conductBattle } from '../src/engine/core/battle.js';

const { createAndAdd } = zones;

test('counter step trashes a counter card and applies power bonus', () => {
  const s = createInitialState({});
  // Attacker attackerOwner
  const attacker = createAndAdd(s, 'A', 'player', 'char');
  attacker.state = 'active';
  attacker.basePower = 2000;

  // Defender target (leader for simplicity)
  const defenderLeader = createAndAdd(s, 'L', 'opponent', 'leader');
  // We'll target the leader; battle expects leader to be targeted and attacker active
  // Put a counter card in opponent's hand
  const counterCard = createAndAdd(s, 'COUNTER', 'opponent', 'hand');
  counterCard.counter = 2000;

  // Conduct battle from attacker -> opponent leader
  const result = conductBattle(s, attacker.instanceId, defenderLeader.instanceId);

  // After battle, the defender's counter card should be in trash and a modifier applied
  // Check that opponent's trash contains the counter card
  const trash = s.players.opponent.trash || [];
  const found = trash.some(t => t && t.instanceId === counterCard.instanceId);
  assert.ok(found, 'counter card should have been trashed');

  // Check that result or game state indicates the counter effect was applied (we inspect continuousEffects)
  const mods = s.continuousEffects || [];
  const applied = mods.some(m => Array.isArray(m.targetInstanceIds) && m.targetInstanceIds.includes(defenderLeader.instanceId) && m.mode === 'add' && m.amount === counterCard.counter);
  assert.ok(applied, 'continuous effect adding counter should exist for defender');
});
