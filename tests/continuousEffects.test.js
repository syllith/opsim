// tests/continuousEffects.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import { addModifier, getComputedStat } from '../src/engine/modifiers/continuousEffects.js';

test('getComputedStat applies add modifier', () => {
  const s = createInitialState({ playerDeck: [] });
  // create instance
  const inst = createCardInstance('CHAR-A', 'player', 'char', s);
  // register instance into player's char array
  s.players.player.char.push(inst);

  // Add an add-modifier +2000
  const mod = {
    id: 'mod-1',
    type: 'statModifier',
    stat: 'power',
    mode: 'add',
    amount: 2000,
    targetInstanceIds: [inst.instanceId],
    duration: 'permanent',
    sourceInstanceId: null,
    createdTurn: s.turnNumber,
    createdPhase: s.phase,
    ownerId: 'player'
  };
  addModifier(s, mod);

  const base = 5000;
  const computed = getComputedStat(s, inst.instanceId, 'power', base, { isOwnerTurn: false });
  assert.strictEqual(computed, 7000, 'computed should be base + add modifiers');
});

test('getComputedStat applies setBase then add layering', () => {
  const s = createInitialState({ playerDeck: [] });
  const inst = createCardInstance('CHAR-B', 'player', 'char', s);
  s.players.player.char.push(inst);

  // setBase = 0
  const setBase = {
    id: 'mod-sb',
    type: 'statModifier',
    stat: 'power',
    mode: 'setBase',
    amount: 0,
    targetInstanceIds: [inst.instanceId],
    duration: 'permanent',
    createdTurn: s.turnNumber,
    createdPhase: s.phase,
    ownerId: 'player'
  };
  addModifier(s, setBase);

  // add +2000
  const add = {
    id: 'mod-a',
    type: 'statModifier',
    stat: 'power',
    mode: 'add',
    amount: 2000,
    targetInstanceIds: [inst.instanceId],
    duration: 'permanent',
    createdTurn: s.turnNumber,
    createdPhase: s.phase,
    ownerId: 'player'
  };
  addModifier(s, add);

  const base = 5000; // should be overridden by setBase
  const computed = getComputedStat(s, inst.instanceId, 'power', base, { isOwnerTurn: false });
  assert.strictEqual(computed, 2000, 'setBase followed by add should give 2000');
});

test('getComputedStat applies DON bonus when owner turn', () => {
  const s = createInitialState({ playerDeck: [] });
  const inst = createCardInstance('CHAR-C', 'player', 'char', s);
  inst.givenDon = 2;
  s.players.player.char.push(inst);

  // no modifiers, base 3000
  let computed = getComputedStat(s, inst.instanceId, 'power', 3000, { isOwnerTurn: true });
  assert.strictEqual(computed, 3000 + 2 * 1000, 'DON bonus should be applied when owner turn');

  // if not owner turn, no DON bonus
  computed = getComputedStat(s, inst.instanceId, 'power', 3000, { isOwnerTurn: false });
  assert.strictEqual(computed, 3000, 'DON bonus should not be applied when not owner turn');
});
