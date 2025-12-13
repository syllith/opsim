// test/ability.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listValidTargets,
  abilityHasAnySelectableTargets,
  evaluateActivatableAbilities
} from '../src/engine/ability.js';

test('listValidTargets returns leader and character targets for player side', () => {
  const areas = {
    player: {
      middle: { leader: [{ id: 'L1', rested: false }] },
      char: [{ id: 'C1', rested: false }]
    },
    opponent: {
      middle: { leader: [{ id: 'L2' }] },
      char: []
    }
  };

  const getCardMeta = (id) => ({ power: id === 'L1' ? 2000 : 1000 });
  const getTotalPower = (side, section, keyName, index, id) => getCardMeta(id).power;

  const targets = listValidTargets(areas, getCardMeta, getTotalPower, 'player', 'any');
  // Should find both leader and character on player side
  assert.strictEqual(Array.isArray(targets), true);
  assert.strictEqual(targets.length, 2);
  const ids = targets.map(t => t.card?.id || t.id);
  assert.ok(ids.includes('L1'));
  assert.ok(ids.includes('C1'));
});

test('abilityHasAnySelectableTargets returns true for search action', () => {
  const ability = { actions: [{ type: 'search' }] };
  const res = abilityHasAnySelectableTargets(ability, {}, () => null, () => 0, {});
  assert.strictEqual(res, true);
});

test('evaluateActivatableAbilities allows Activate Main when appropriate', () => {
  const abilities = [{ timing: 'activateMain', actions: [] }];
  const params = {
    phase: 'Main',
    isYourTurn: true,
    battle: null,
    cardId: 'C1',
    abilityUsed: {},
    isOnField: true,
    wasJustPlayed: false,
    areas: {
      player: { middle: { leader: [{ id: 'L1', rested: false }] }, char: [{ id: 'C1', rested: false }] },
      opponent: { middle: { leader: [{ id: 'L2' }] }, char: [] }
    },
    actionSource: { side: 'player', section: 'char', keyName: 'char', index: 0 },
    getCardMeta: () => ({ power: 1000 }),
    getTotalPower: () => 1000
  };

  const evaluated = evaluateActivatableAbilities(abilities, params);
  assert.strictEqual(Array.isArray(evaluated), true);
  assert.strictEqual(evaluated[0].canActivate, true, `expected Activate Main to be allowed; got reason "${evaluated[0].reason}"`);
});
