// test/engine_commands.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import _ from 'lodash';
import engine from '../src/engine/index.js';

test('PLAY_CARD moves card from player.handIds to areas.char', () => {
  const state = {
    players: [
      { socketId: 's1', deckIds: [], handIds: ['C1'], lifeIds: [], donCount: 0 },
      { socketId: 's2', deckIds: [], handIds: [], lifeIds: [], donCount: 0 }
    ],
    setup: { phase: 'complete' },
    turn: { currentPlayerIndex: 0, turnNumber: 1, phase: 'Main' },
    gameState: { areas: null }
  };

  const res = engine.applyCommand(state, { type: 'PLAY_CARD', clientSocketId: 's1', payload: { handIndex: 0 } });
  assert.strictEqual(res.valid, true, `PLAY_CARD returned invalid: ${res.error}`);
  const areas = res.newState.gameState.areas;
  assert.ok(Array.isArray(areas.player.char), 'areas.player.char should exist');
  assert.strictEqual(areas.player.char[0].id, 'C1');
  assert.strictEqual(res.newState.players[0].handIds.length, 0);
});

test('BEGIN_ATTACK creates a battle for leader', () => {
  const state = {
    players: [
      { socketId: 's1', deckIds: [], handIds: [], lifeIds: [], donCount: 0 },
      { socketId: 's2', deckIds: [], handIds: [], lifeIds: [], donCount: 0 }
    ],
    setup: { phase: 'complete' },
    turn: { currentPlayerIndex: 0, turnNumber: 1, phase: 'Main' },
    gameState: { areas: { player: { middle: { leader: [{ id: 'L1' }] }, char: [] }, opponent: { middle: { leader: [{ id: 'L2' }] }, char: [], top: { hand: [], trash: [], cost: [] }, bottom: { hand: [], don: [], cost: [] }, life: [] } }, battle: null, currentAttack: null }
  };

  const res = engine.applyCommand(state, { type: 'BEGIN_ATTACK', clientSocketId: 's1', payload: { attacker: { section: 'middle', keyName: 'leader', index: 0 } } });
  assert.strictEqual(res.valid, true);
  assert.ok(res.newState.gameState.battle);
  assert.strictEqual(res.newState.gameState.battle.step, 'declaring');
});

test('APPLY_BLOCKER & ADD_COUNTER_FROM_HAND & RESOLVE_DAMAGE flows', () => {
  const areas = {
    player: { middle: { leader: [{ id: 'L1' }] }, char: [], top: { hand: [], trash: [], cost: [] }, bottom: { hand: [], don: [], cost: [] }, life: [] },
    opponent: { middle: { leader: [{ id: 'L2' }] }, char: [{ id: 'B1', rested: false }], top: { hand: [{ id: 'CT1' }] , trash: [], cost: [] }, bottom: { hand: [], don: [], cost: [] }, life: [{ id: 'OL1' }] }
  };

  const battleObj = {
    attacker: { side: 'player', section: 'middle', keyName: 'leader', index: 0, id: 'L1', power: 2000 },
    target: { side: 'opponent', section: 'middle', keyName: 'leader', index: 0, id: 'L2' },
    step: 'block',
    blockerUsed: false,
    counterPower: 0
  };

  const state = {
    players: [
      { socketId: 's1', deckIds: [], handIds: [], lifeIds: [], donCount: 0 },
      { socketId: 's2', deckIds: [], handIds: ['CT1'], lifeIds: [], donCount: 0 }
    ],
    setup: { phase: 'complete' },
    turn: { currentPlayerIndex: 0, turnNumber: 1, phase: 'Main' },
    gameState: { areas, battle: battleObj, currentAttack: null }
  };

  // Apply blocker: opponent blocks with char index 0
  const blockRes = engine.applyCommand(state, { type: 'APPLY_BLOCKER', clientSocketId: 's2', payload: { blockerIndex: 0 } });
  assert.strictEqual(blockRes.valid, true);
  assert.strictEqual(blockRes.newState.gameState.battle.step, 'counter');

  // Add counter from hand (opponent plays CT1 as counter)
  // Provide helpers so the battle helper can obtain the counter value (getCardMeta)
  const addHelpers = {
    getCardMeta: (id) => ({ counter: 500 })
  };

  const counterRes = engine.applyCommand(blockRes.newState, { type: 'ADD_COUNTER_FROM_HAND', clientSocketId: 's2', payload: { handIndex: 0 } }, { helpers: addHelpers });
  assert.strictEqual(counterRes.valid, true);
  const cp = counterRes.newState.gameState.battle.counterPower || 0;
  assert.ok(cp > 0 || (Array.isArray(counterRes.newState.gameState.areas.opponent.top.trash) && counterRes.newState.gameState.areas.opponent.top.trash.length > 0));

  // Move to damage step and resolve
  const damageState = _.cloneDeep(counterRes.newState);
  damageState.gameState.battle.step = 'damage';

  // Provide getTotalPower helper used by resolveDamage to compute atk/def
  const resolveHelpers = {
    getTotalPower: (side, section, keyName, index, id) => {
      if (id === 'L1') return 2000;
      if (id === 'L2') return 1000;
      if (id === 'B1') return 1500;
      return 0;
    },
    metaById: new Map()
  };

  const resolveRes = engine.applyCommand(damageState, { type: 'RESOLVE_DAMAGE', clientSocketId: 's1' }, { helpers: resolveHelpers });
  assert.strictEqual(resolveRes.valid, true);
  assert.strictEqual(resolveRes.newState.gameState.battle.step, 'end');
});
