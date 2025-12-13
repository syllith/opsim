/**
 * src/engine/battle.js
 *
 * Pure battle helper functions for the engine.
 *
 * Exports:
 *  - createBattleId()
 *  - restInstance(areas, side, section, keyName, index) -> newAreas
 *  - beginAttackForLeader(areas, leaderCard, attackingSide, getTotalPower) -> { areas, battle, currentAttack }
 *  - beginAttackForCard(areas, attackerCard, attackerIndex, attackingSide, getTotalPower) -> { areas, battle, currentAttack }
 *  - applyBlocker(areas, battle, blockerIndex, defendingSide, helpers) -> { areas, battle }
 *  - skipBlock(battle) -> newBattle
 *  - addCounterFromHand(areas, battle, handIndex, defendingSide, helpers) -> { areas, battle, log? }
 *  - resolveDamage(areas, battle, helpers) -> { areas, battle, logs? }
 *  - getAttackerPower(battle, getTotalPower)
 *  - getDefenderPower(battle, getTotalPower)
 *  - getBattleStatus(battle, getTotalPower)
 *
 * helpers param is an object of helper functions the caller provides:
 *  - getCardMeta(id) -> meta
 *  - dealDamageToLeaderMutate(next, side, amount, opts) -> { paid, triggers }
 *  - returnDonFromCardMutate(next, side, section, keyName, index) -> number
 *  - getKeywordsFor(id) -> keywords (for blocking detection)
 *  - hasDisabledKeyword(side, section, keyName, index, keyword) -> bool
 *
 * NOTE: This module intentionally clones `areas` input and returns modified copies,
 * leaving the caller's original objects unchanged.
 */

import _ from 'lodash';
import {
  getSideRoot,
  getHandCostRoot,
  getCharArray,
  returnDonFromCardMutate,
  dealDamageToLeaderMutate
} from '../comps/Home/hooks/areasUtils.js'; // adjust import path if needed

// Simple battle id generator (keeps same format as prior implementation)
export function createBattleId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}

// Deep-clone areas and return
function cloneAreas(areas) {
  return _.cloneDeep(areas || {});
}

/**
 * restInstance - mark an instance rested in areas at the given path
 * path components: side, section, keyName, index
 */
export function restInstance(areas, side, section, keyName, index = 0) {
  const next = cloneAreas(areas);
  try {
    const sideRoot = getSideRoot(next, side);
    if (!sideRoot) return next;

    if (section === 'char' && keyName === 'char') {
      const arr = getCharArray(next, side);
      if (arr && Array.isArray(arr) && arr[index]) arr[index].rested = true;
    } else if (section === 'middle') {
      if (keyName === 'leader') {
        const leader = sideRoot?.middle?.leader?.[0];
        if (leader) leader.rested = true;
      } else if (keyName === 'stage') {
        const stage = sideRoot?.middle?.stage?.[0];
        if (stage) stage.rested = true;
      }
    } else {
      // Other nested patterns (bottom.cost etc.) handled by callers if needed
      const container = _.get(sideRoot, `${section}`);
      if (container && keyName && container[keyName] && Array.isArray(container[keyName])) {
        const arr = container[keyName];
        if (arr[index]) arr[index].rested = true;
      }
    }
  } catch (err) {
    // noop - return next unchanged on failure
  }
  return next;
}

/* --------------------------
 * Attack beginnings
 * -------------------------*/

/**
 * beginAttackForLeader
 *
 * Returns { areas: newAreas, battle, currentAttack }
 * - newAreas: areas with leader rested
 * - battle: initial battle object in 'declaring' step
 * - currentAttack: the same minimal current attack shape (used by UI)
 */
export function beginAttackForLeader(areas, leaderCard, attackingSide, getTotalPower) {
  if (!leaderCard) return { areas: areas, battle: null, currentAttack: null };

  const next = restInstance(areas, attackingSide, 'middle', 'leader', 0);

  const attackerPower = (typeof getTotalPower === 'function')
    ? getTotalPower(attackingSide, 'middle', 'leader', 0, leaderCard.id)
    : 0;

  const battleId = createBattleId();
  const battle = {
    battleId,
    attacker: {
      side: attackingSide,
      section: 'middle',
      keyName: 'leader',
      index: 0,
      id: leaderCard.id,
      power: attackerPower
    },
    target: null,
    step: 'declaring',
    blockerUsed: false,
    counterPower: 0,
    counterTarget: null
  };

  const currentAttack = {
    key: `${attackingSide}:middle:leader:0`,
    cardId: leaderCard.id,
    index: 0,
    power: attackerPower,
    isLeader: true
  };

  return { areas: next, battle, currentAttack };
}

/**
 * beginAttackForCard (character)
 *
 * Returns { areas, battle, currentAttack }
 */
export function beginAttackForCard(areas, attackerCard, attackerIndex, attackingSide, getTotalPower) {
  if (!attackerCard) return { areas: areas, battle: null, currentAttack: null };

  const next = cloneAreas(areas);
  // Rest the attacking character
  try {
    const sideRoot = getSideRoot(next, attackingSide);
    if (sideRoot && Array.isArray(sideRoot.char) && sideRoot.char[attackerIndex]) {
      sideRoot.char[attackerIndex].rested = true;
    }
  } catch { /* noop */ }

  const attackerPower = (typeof getTotalPower === 'function')
    ? getTotalPower(attackingSide, 'char', 'char', attackerIndex, attackerCard.id)
    : 0;

  const battleId = createBattleId();
  const battle = {
    battleId,
    attacker: {
      side: attackingSide,
      section: 'char',
      keyName: 'char',
      index: attackerIndex,
      id: attackerCard.id,
      power: attackerPower
    },
    target: null,
    step: 'declaring',
    blockerUsed: false,
    counterPower: 0,
    counterTarget: null
  };

  const currentAttack = {
    key: `${attackingSide}:char:char:${attackerIndex}`,
    cardId: attackerCard.id,
    index: attackerIndex,
    power: attackerPower,
    isLeader: false
  };

  return { areas: next, battle, currentAttack };
}

/* --------------------------
 * Power helpers
 * -------------------------*/

export function getAttackerPower(b, getTotalPower) {
  if (!b || !b.attacker) return 0;
  return (typeof getTotalPower === 'function')
    ? getTotalPower(b.attacker.side, b.attacker.section, b.attacker.keyName, b.attacker.index, b.attacker.id)
    : (b.attacker.power || 0);
}

export function getDefenderPower(b, getTotalPower) {
  if (!b || !b.target) return 0;
  const t = b.target;
  const basePower = (typeof getTotalPower === 'function')
    ? getTotalPower(t.side, t.section, t.keyName, t.index, t.id)
    : 0;

  const isCounterTarget =
    b.counterTarget &&
    b.counterTarget.side === t.side &&
    b.counterTarget.section === t.section &&
    b.counterTarget.keyName === t.keyName &&
    b.counterTarget.index === t.index;

  return basePower + (isCounterTarget ? (b.counterPower || 0) : 0);
}

export function getBattleStatus(b, getTotalPower) {
  if (!b) return null;
  const atk = getAttackerPower(b, getTotalPower);
  const def = getDefenderPower(b, getTotalPower);
  const needed = Math.max(0, atk - def + 1000);
  return { atk, def, needed, safe: def > atk };
}

/* --------------------------
 * Block / counter operations
 * -------------------------*/

/**
 * applyBlocker
 *
 * - returns newAreas and newBattle
 * - helpers: { getKeywordsFor, hasDisabledKeyword } optional
 */
export function applyBlocker(areas, battle, blockerIndex, helpers = {}) {
  if (!battle || !battle.target) return { areas, battle };

  const next = cloneAreas(areas);
  const defendingSide = battle.target.side;
  const chars = getCharArray(next, defendingSide);
  const card = chars?.[blockerIndex];
  if (!card) return { areas: next, battle };

  const { getKeywordsFor, hasDisabledKeyword } = helpers;

  // Check blocker keyword if helper provided; otherwise allow
  const hasBlocker = typeof getKeywordsFor === 'function'
    ? (getKeywordsFor(card.id) || []).some(k => String(k || '').toLowerCase().includes('blocker'))
    : true;
  if (!hasBlocker) return { areas: next, battle };

  // Check disabled blocker
  if (typeof hasDisabledKeyword === 'function') {
    const disabled = hasDisabledKeyword(defendingSide, 'char', 'char', blockerIndex, 'Blocker');
    if (disabled) {
      return { areas: next, battle };
    }
  }

  // Rest the blocker
  try {
    const sideRoot = getSideRoot(next, defendingSide);
    if (sideRoot && Array.isArray(sideRoot.char) && sideRoot.char[blockerIndex]) {
      sideRoot.char[blockerIndex].rested = true;
    }
  } catch { /* noop */ }

  // Build new target and update battle
  const newTarget = {
    side: defendingSide,
    section: 'char',
    keyName: 'char',
    index: blockerIndex,
    id: card.id
  };

  const hasCounterPower = battle.counterPower && battle.counterPower > 0;
  const counterTarget = hasCounterPower ? newTarget : battle.counterTarget;

  const newBattle = {
    ...battle,
    target: newTarget,
    blockerUsed: true,
    step: 'counter',
    counterTarget
  };

  return { areas: next, battle: newBattle };
}

/**
 * skipBlock: advance battle from block to counter (no blocker)
 */
export function skipBlock(battle) {
  if (!battle) return battle;
  if (battle.step !== 'block') return battle;
  return { ...battle, step: 'counter' };
}

/* --------------------------
 * Counter and resolution
 * -------------------------*/

/**
 * addCounterFromHand
 *
 * Moves a card from hand to trash and applies its counter value to the defender.
 *
 * - helpers should include:
 *   - getCardMeta(id)
 *   - getHandCostRoot(next, side) [if not provided we use our local import]
 *
 * Returns { areas: newAreas, battle: newBattle, log: optional string }
 */
export function addCounterFromHand(areas, battle, handIndex, defendingSide, helpers = {}) {
  if (!battle || !(battle.step === 'counter' || battle.step === 'block')) {
    return { areas, battle };
  }
  if (!battle.target) return { areas, battle };

  const next = cloneAreas(areas);

  const handRoot = (helpers.getHandCostRoot || getHandCostRoot)(next, defendingSide);
  if (!handRoot || !Array.isArray(handRoot.hand) || handIndex < 0 || handIndex >= handRoot.hand.length) {
    return { areas: next, battle };
  }

  const card = handRoot.hand[handIndex];
  if (!card) return { areas: next, battle };

  const meta = (helpers.getCardMeta || (() => null))(card.id);
  const counterVal = (meta && _.isNumber(meta?.counter) && meta.counter > 0) ? meta.counter : 0;
  if (!counterVal) return { areas: next, battle };

  // Move from hand to trash
  const hand = handRoot.hand.slice();
  const [removed] = hand.splice(handIndex, 1);
  handRoot.hand = hand;

  const trashArr = handRoot.trash || [];
  handRoot.trash = [...trashArr, removed || card];

  // Apply counter
  const newBattle = {
    ...battle,
    counterPower: (battle.counterPower || 0) + counterVal,
    counterTarget: {
      side: battle.target.side,
      section: battle.target.section,
      keyName: battle.target.keyName,
      index: battle.target.index
    },
    step: (battle.step === 'block' && !battle.blockerUsed) ? 'block' : battle.step
  };

  const targetName = (battle.target.section === 'middle') ? 'Leader' : `Character ${battle.target.index}`;
  const log = `[battle] Counter applied: ${card.id} +${counterVal} to ${targetName}.`;

  return { areas: next, battle: newBattle, log };
}

/**
 * resolveDamage
 *
 * Evaluates the damage step. Mutates areas (clone) according to result:
 *  - If attack >= defense:
 *      - If target is leader: call dealDamageToLeaderMutate(next, defender, 1, { metaById, allowTrigger: true })
 *      - Else: KO character (remove char and charDon and push removed to trash)
 *  - Else: attacker loses (no damage)
 *
 * Returns { areas: newAreas, battle: newBattle, logs: [] }
 *
 * helpers should include:
 *  - getTotalPower(side, section, keyName, index, id)
 *  - dealDamageToLeaderMutate(next, side, amount, opts)  // if not provided, leader damage won't be applied
 *  - returnDonFromCardMutate(next, side, section, keyName, index) // to return DON after KO
 */
export function resolveDamage(areas, battle, helpers = {}) {
  const next = cloneAreas(areas);
  const logs = [];

  if (!battle || battle.step !== 'damage' || !battle.target || !battle.attacker) {
    return { areas: next, battle, logs };
  }

  const getTotalPower = helpers.getTotalPower;
  const atkPower = getAttackerPower(battle, getTotalPower);
  const defPower = getDefenderPower(battle, getTotalPower);
  const targetIsLeader = battle.target.section === 'middle' && battle.target.keyName === 'leader';

  logs.push(`[battle] Damage Step: Attacker ${battle.attacker.id} ${atkPower} vs Defender ${battle.target.id} ${defPower}.`);

  if (atkPower >= defPower) {
    if (targetIsLeader) {
      // Leader takes 1 damage
      if (typeof (helpers.dealDamageToLeaderMutate || dealDamageToLeaderMutate) === 'function') {
        const fn = helpers.dealDamageToLeaderMutate || dealDamageToLeaderMutate;
        const res = fn(next, battle.target.side, 1, { metaById: helpers.metaById, allowTrigger: true });
        if (res?.triggers && res.triggers.length) {
          logs.push('[result] Leader took damage and trigger detected.');
        } else {
          logs.push('[result] Leader takes 1 damage.');
        }
      } else {
        logs.push('[result] Leader takes 1 damage (no mutate function provided).');
      }
    } else {
      // KO character
      try {
        const defendingSide = battle.target.side;
        const sideRoot = getSideRoot(next, defendingSide);
        if (sideRoot) {
          const charArr = sideRoot.char || [];
          const charDonArr = sideRoot.charDon || [];

          const removed = charArr.splice(battle.target.index, 1)[0];
          if (Array.isArray(charDonArr)) {
            charDonArr.splice(battle.target.index, 1);
            sideRoot.charDon = charDonArr;
          }

          sideRoot.char = charArr;

          const trashLoc = getHandCostRoot(next, defendingSide);
          trashLoc.trash = [...(trashLoc.trash || []), removed];
        }

        // Return DON attachments from the KO'd card to cost
        const rd = typeof (helpers.returnDonFromCardMutate || returnDonFromCardMutate) === 'function'
          ? (helpers.returnDonFromCardMutate || returnDonFromCardMutate)(next, battle.target.side, 'char', 'char', battle.target.index)
          : 0;

        logs.push(`[result] Defender Character ${battle.target.id} K.O.'d.`);
      } catch (err) {
        logs.push('[resolveDamage] Failed to KO character.');
      }
    }
  } else {
    logs.push('[result] Attacker loses battle; no damage.');
  }

  const newBattle = { ...battle, step: 'end' };
  return { areas: next, battle: newBattle, logs };
}
