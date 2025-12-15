// tests/ko.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import koCore from '../src/engine/core/ko.js';
import replacement from '../src/engine/core/replacement.js';
import { modifyStat } from '../src/engine/actions/modifyStat.js';

const { createAndAdd } = zones;

test('canBeKOd respects static preventKO ability for effectKO', () => {
  const s = createInitialState({});
  // Create character instance and add to player's char zone
  const inst = createAndAdd(s, 'CHAR-P', 'player', 'char');

  // Add a static ability on the instance that prevents effect KO
  inst.abilities = [
    {
      timing: 'static',
      actions: [
        {
          type: 'preventKO',
          target: { side: 'self', type: 'thisCard' },
          condition: {
            field: 'eventType',
            op: '=',
            value: 'effectKO'
          }
        }
      ]
    }
  ];

  // canBeKOd with cause='effect' should be false
  const canEffect = koCore.canBeKOd(s, inst.instanceId, 'effect');
  assert.strictEqual(canEffect, false, 'Instance should be immune to effect KO');

  // canBeKOd with cause='battle' should be true (prevent only effectKO)
  const canBattle = koCore.canBeKOd(s, inst.instanceId, 'battle');
  assert.strictEqual(canBattle, true, 'Instance should not be immune to battle KO');
});

test('wouldBeKO finds replacement registered via replacement.registerReplacement', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'CHAR-R', 'player', 'char');

  // Register a replacement targeting this instance for event 'wouldBeKO'
  const effect = {
    event: 'wouldBeKO',
    duration: 'thisTurn',
    maxTriggers: 1,
    targetSelector: { instanceId: inst.instanceId }
  };
  const reg = replacement.registerReplacement(s, effect);
  assert.ok(reg.success, 'replacement registration should succeed');

  const chk = koCore.wouldBeKO(s, inst.instanceId, 'effect');
  assert.ok(chk.hasReplacement === true && Array.isArray(chk.effects) && chk.effects.length > 0, 'wouldBeKO should find replacement');
});

test('processKOAbilities executes onKO abilities (modifyStat action)', () => {
  const s = createInitialState({});
  // Create koed card (we will simulate KO)
  const koed = createAndAdd(s, 'CHAR-KO', 'player', 'char');

  // Create another instance with onKO ability that modifies its own power
  const responder = createAndAdd(s, 'CHAR-RSP', 'player', 'char');
  responder.abilities = [
    {
      timing: 'onKO',
      actions: [
        {
          type: 'modifyStat',
          stat: 'power',
          mode: 'add',
          amount: 1000,
          duration: 'permanent',
          // use targetInstanceIds to directly target the responder itself
          targetInstanceIds: [responder.instanceId]
        }
      ]
    }
  ];

  // Ensure no modifiers yet
  s.continuousEffects = s.continuousEffects || [];
  const beforeCount = s.continuousEffects.length;

  // Call processKOAbilities
  koCore.processKOAbilities(s, koed.instanceId, 'effect');

  // After processing, we should have at least one modifier added (modifyStat adds a modifier)
  const afterCount = s.continuousEffects.length;
  assert.ok(afterCount > beforeCount, 'processKOAbilities should have added at least one continuous effect modifier');
});
