// tests/battle.counter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import { conductBattle } from '../src/engine/core/battle.js';
import engine from '../src/engine/index.js';
import promptManager from '../src/engine/core/promptManager.js';

const { createAndAdd } = zones;

test('counter step trashes a counter card and applies power bonus (prompt-driven)', async () => {
  const s = createInitialState({});
  // Attacker attackerOwner
  const attacker = createAndAdd(s, 'A', 'player', 'char');
  attacker.state = 'active';
  attacker.basePower = 2000;

  // Defender target (leader for simplicity)
  const defenderLeader = createAndAdd(s, 'L', 'opponent', 'leader');

  // Put a counter card in opponent's hand
  const counterCard = createAndAdd(s, 'COUNTER', 'opponent', 'hand');
  counterCard.counter = 2000;

  // Listen for the prompt and auto-answer with the counterCard's instanceId
  function onPrompt({ prompt }) {
    try {
      if (prompt && prompt.playerId === 'opponent' && prompt.choiceSpec) {
        // Submit the first choice (simulate UI)
        const chosen = [counterCard.instanceId];
        promptManager.submitChoice(prompt.id, 'opponent', chosen);
      }
    } catch (e) {
      // ignore test-side submit errors
    }
  }
  engine.on('prompt', onPrompt);

  // Conduct battle (async)
  const result = await conductBattle(s, attacker.instanceId, defenderLeader.instanceId);

  // Remove listener
  engine.off('prompt', onPrompt);

  // After battle, the defender's counter card should be in trash
  const trash = s.players.opponent.trash || [];
  const found = trash.some(t => t && t.instanceId === counterCard.instanceId);
  assert.ok(found, 'counter card should have been trashed');

  // Check that a continuous effect adding the counter exists for the defenderLeader
  const mods = s.continuousEffects || [];
  const applied = mods.some(m =>
    Array.isArray(m.targetInstanceIds) &&
    m.targetInstanceIds.includes(defenderLeader.instanceId) &&
    m.mode === 'add' &&
    m.amount === counterCard.counter &&
    m.duration === 'thisBattle'
  );
  assert.ok(applied, 'continuous effect adding counter should exist for defender target');
});
