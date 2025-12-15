// tests/evaluator.updated.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import evaluator from '../src/engine/rules/evaluator.js';
import donManager from '../src/engine/modifiers/donManager.js';

const { createAndAdd } = zones;

test('canPayCost: restDonFromCostArea counts active DONs (undefined state = active)', () => {
  const s = createInitialState({});
  // create one DON with undefined state (should be treated as active)
  const d1 = createAndAdd(s, 'DON', 'player', 'costArea');
  // create one DON explicitly rested
  const d2 = createAndAdd(s, 'DON', 'player', 'costArea');
  d2.state = 'rested';

  // require 2 active -> should fail (only 1 active)
  const abilityNeed2 = { cost: { type: 'restDonFromCostArea', count: 2 } };
  const res2 = evaluator.canPayCost(s, abilityNeed2, { owner: 'player' });
  assert.strictEqual(res2.ok, false, 'Should not be able to rest 2 active DONs when only 1 active exists');

  // require 1 active -> should pass
  const abilityNeed1 = { cost: { type: 'restDonFromCostArea', count: 1 } };
  const res1 = evaluator.canPayCost(s, abilityNeed1, { owner: 'player' });
  assert.strictEqual(res1.ok, true, 'Should be able to rest 1 active DON');
});

test('canPayCost: donMinus counts costArea + attached DONs', () => {
  const s = createInitialState({});
  // two DONs in costArea
  createAndAdd(s, 'DON', 'player', 'costArea');
  createAndAdd(s, 'DON', 'player', 'costArea');

  // create a character and attach a DON to it (simulate attachedDons)
  const ch = createAndAdd(s, 'CHAR-1', 'player', 'char');
  const attachedDon = createCardInstance('DON', 'player', 'attached', s);
  attachedDon.zone = 'attached';
  attachedDon.attachedTo = ch.instanceId;
  if (!ch.attachedDons) ch.attachedDons = [];
  ch.attachedDons.push(attachedDon);

  // total DON available = 3
  let ability3 = { cost: { type: 'donMinus', count: 3 } };
  assert.strictEqual(evaluator.canPayCost(s, ability3, { owner: 'player' }).ok, true, 'donMinus=3 should be payable when total=3');

  // need 4 -> fail
  let ability4 = { cost: { type: 'donMinus', count: 4 } };
  assert.strictEqual(evaluator.canPayCost(s, ability4, { owner: 'player' }).ok, false, 'donMinus=4 should fail when total=3');
});

test('canPayCost: trashFromHand enforces minCards', () => {
  const s = createInitialState({});
  // no cards in hand
  const ability = { cost: { type: 'trashFromHand', minCards: 1 } };
  const r0 = evaluator.canPayCost(s, ability, { owner: 'player' });
  assert.strictEqual(r0.ok, false, 'Should not be able to trash 1 card from empty hand');

  // add a card to hand
  createAndAdd(s, 'X', 'player', 'hand');
  const r1 = evaluator.canPayCost(s, ability, { owner: 'player' });
  assert.strictEqual(r1.ok, true, 'Should be able to trash 1 card when hand has 1 card');
});

test('canPayCost: restThis requires thisCard and checks state', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'CHAR-R', 'player', 'char');
  // ensure active by default (no state)
  const ability = { cost: { type: 'restThis' } };
  const ok1 = evaluator.canPayCost(s, ability, { thisCard: inst });
  assert.strictEqual(ok1.ok, true, 'restThis should be payable when card is active');

  // set card as rested
  inst.state = 'rested';
  const ok2 = evaluator.canPayCost(s, ability, { thisCard: inst });
  assert.strictEqual(ok2.ok, false, 'restThis should not be payable when card is already rested');
});

test('canPayCost: multiCost composes multiple sub-costs', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'CHAR-M', 'player', 'char');
  // ensure inst active
  inst.state = 'active';
  // ensure one card in hand to satisfy trashFromHand
  createAndAdd(s, 'H1', 'player', 'hand');

  // multiCost: restThis + trashFromHand(minCards=1)
  const ability = { cost: { type: 'multiCost', costs: [{ type: 'restThis' }, { type: 'trashFromHand', minCards: 1 }] } };
  const ok = evaluator.canPayCost(s, ability, { thisCard: inst, owner: 'player' });
  assert.strictEqual(ok.ok, true, 'multiCost should be payable when all sub-costs satisfiable');

  // remove hand card to break trashFromHand
  s.players.player.hand = [];
  const notOk = evaluator.canPayCost(s, ability, { thisCard: inst, owner: 'player' });
  assert.strictEqual(notOk.ok, false, 'multiCost should fail if any sub-cost not payable');
});

test('checkFrequency + markAbilityTriggered: oncePerTurn behavior', () => {
  const s = createInitialState({});
  s.turnNumber = 42;
  const inst = createAndAdd(s, 'CHAR-FREQ', 'player', 'char');

  // ability represented by object (we pass abilityIndex separately)
  const ability = { frequency: 'oncePerTurn' };
  const abilityIndex = 0;

  // initially allowed
  const first = evaluator.checkFrequency(s, inst.instanceId, ability, abilityIndex);
  assert.strictEqual(first.ok, true, 'First usage this turn should be allowed');

  // mark triggered
  evaluator.markAbilityTriggered(s, inst.instanceId, abilityIndex);

  // now blocked for same turn
  const second = evaluator.checkFrequency(s, inst.instanceId, ability, abilityIndex);
  assert.strictEqual(second.ok, false, 'Second usage same turn should be blocked');

  // advance turn
  s.turnNumber = 43;
  const third = evaluator.checkFrequency(s, inst.instanceId, ability, abilityIndex);
  assert.strictEqual(third.ok, true, 'After advancing turn, ability should be allowed again');
});

test('canActivateAbility enforces timing (activateMain <-> main)', () => {
  const s = createInitialState({});
  const inst = createAndAdd(s, 'CHAR-ACT', 'player', 'char');
  inst.abilities = [{ timing: 'activateMain' }];

  // wrong timing
  let res = evaluator.canActivateAbility(s, inst.instanceId, 0, { timing: 'draw', activePlayer: 'player' });
  assert.strictEqual(res.can, false, 'Ability should not activate during draw phase');

  // correct timing (main)
  res = evaluator.canActivateAbility(s, inst.instanceId, 0, { timing: 'main', activePlayer: 'player' });
  assert.strictEqual(res.can, true, 'activateMain should be allowed during main timing');
});

test('getTriggeredAbilities finds onPlay and trigger (life) abilities', () => {
  const s = createInitialState({});
  // create a char with onPlay ability
  const inst = createAndAdd(s, 'CHAR-TP', 'player', 'char');
  inst.abilities = [{ timing: 'onPlay', actions: [] }];
  // create life card with trigger ability
  const lifeCard = createAndAdd(s, 'LIFE-1', 'player', 'life');
  lifeCard.abilities = [{ timing: 'trigger', actions: [] }];

  const onPlay = evaluator.getTriggeredAbilities(s, 'onPlay', {});
  assert.ok(onPlay.some(e => e.instanceId === inst.instanceId && e.abilityIndex === 0), 'onPlay ability should be found');

  const triggers = evaluator.getTriggeredAbilities(s, 'trigger', {});
  assert.ok(triggers.some(e => e.instanceId === lifeCard.instanceId && e.abilityIndex === 0), 'life trigger ability should be found');
});
