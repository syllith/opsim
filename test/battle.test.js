// test/battle.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginAttackForLeader,
  beginAttackForCard,
  resolveDamage,
  getBattleStatus
} from '../src/engine/battle.js';

test('beginAttackForLeader creates a declaring battle and rests leader', () => {
  const areas = {
    player: {
      middle: { leader: [{ id: 'L1', rested: false }] },
      char: [],
      bottom: { hand: [], cost: [], trash: [] },
      life: []
    },
    opponent: {
      middle: { leader: [{ id: 'L2' }] },
      char: [],
      top: { hand: [], cost: [], trash: [] },
      life: []
    }
  };

  const getTotalPower = () => 1500;
  const { areas: newAreas, battle, currentAttack } = beginAttackForLeader(areas, { id: 'L1' }, 'player', getTotalPower);

  assert.strictEqual(battle.step, 'declaring');
  assert.strictEqual(currentAttack.power, 1500);
  assert.strictEqual(!!newAreas.player.middle.leader[0].rested, true);
});

test('resolveDamage resolves leader damage path and sets battle to end', () => {
  const areas = {
    player: {
      middle: { leader: [{ id: 'L1' }] },
      bottom: { hand: [], cost: [], trash: [] },
      life: []
    },
    opponent: {
      middle: { leader: [{ id: 'L2' }] },
      top: { hand: [], cost: [], trash: [] },
      life: [{ id: 'LIFE1' }] // one life card to be taken as damage
    }
  };

  // attacker is player leader, target is opponent leader (so targetIsLeader = true)
  const battle = {
    attacker: { side: 'player', section: 'middle', keyName: 'leader', index: 0, id: 'L1' },
    target: { side: 'opponent', section: 'middle', keyName: 'leader', index: 0, id: 'L2' },
    step: 'damage',
    counterPower: 0
  };

  // getTotalPower returns 2000 for attacker, 1000 for defender
  const helpers = { getTotalPower: (side, section, keyName, index, id) => id === 'L1' ? 2000 : 1000, metaById: new Map() };

  const { areas: afterAreas, battle: afterBattle, logs } = resolveDamage(areas, battle, helpers);

  assert.strictEqual(afterBattle.step, 'end', 'battle should advance to end step after damage resolution');
  assert.ok(Array.isArray(logs) && logs.length > 0, 'logs should be populated');
  assert.ok(logs.some(l => l.toLowerCase().includes('leader')), 'logs should mention leader damage');
});
