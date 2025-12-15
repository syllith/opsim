'use strict';
/*
 * battle.js — Minimal Battle Engine (clean, single-definition)
 * =============================================================================
 *
 * Implements a simplified Attack/Block/Damage/End-of-Battle flow sufficient for
 * early simulation and unit tests. No duplicate function names; helper functions
 * are defined only once.
 *
 * Export:
 *  - export function conductBattle(gameState, attackerInstanceId, targetInstanceId)
 *
 * Notes:
 *  - Block selection is automatic (first active Blocker).
 *  - Counter step is a placeholder (not implemented).
 *  - Uses continuousEffects.getComputedStat to calculate effective power.
 * =============================================================================
 */

import zones from './zones.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import { dealDamage } from '../actions/dealDamage.js';

const { findInstance, removeInstance } = zones;

/* -------------------------
   Helper: get instance base power
   ------------------------- */
function _getInstanceBasePower(instance) {
  if (!instance) return 0;
  return typeof instance.basePower === 'number' ? instance.basePower : 0;
}

/* -------------------------
   Helper: compute effective power using continuousEffects
   ------------------------- */
function _computePower(gameState, instance, options = {}) {
  const base = _getInstanceBasePower(instance);
  try {
    return continuousEffects.getComputedStat(gameState, instance.instanceId, 'power', base, options);
  } catch (e) {
    // In error cases return base to avoid breaking battle resolution
    return base;
  }
}

/* -------------------------
   Helper: find an active blocker for a defender
   ------------------------- */
function _findActiveBlocker(gameState, defenderOwner) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.char)) return null;
  for (const c of p.char) {
    if (!c) continue;
    const kws = Array.isArray(c.keywords) ? c.keywords : [];
    if (kws.includes('Blocker') && c.state === 'active') return c;
  }
  return null;
}

/* -------------------------
   Helper: K.O. character (remove -> trash)
   ------------------------- */
function _koCharacter(gameState, instance) {
  if (!instance || !instance.instanceId) return { success: false, error: 'invalid instance' };
  // remove from field (zones.removeInstance)
  const removed = removeInstance(gameState, instance.instanceId);
  if (!removed) return { success: false, error: 'failed to remove instance for KO' };
  const owner = instance.owner;
  if (!gameState.players || !gameState.players[owner]) {
    return { success: false, error: `owner ${owner} not found` };
  }
  if (!Array.isArray(gameState.players[owner].trash)) gameState.players[owner].trash = [];
  removed.zone = 'trash';
  gameState.players[owner].trash.push(removed);
  return { success: true, instanceId: removed.instanceId, owner };
}

/* -------------------------
   conductBattle
   ------------------------- */
export function conductBattle(gameState, attackerInstanceId, targetInstanceId) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!attackerInstanceId || !targetInstanceId) return { success: false, error: 'missing instance ids' };

  const attackerLoc = findInstance(gameState, attackerInstanceId);
  const targetLocInitial = findInstance(gameState, targetInstanceId);

  if (!attackerLoc || !attackerLoc.instance) return { success: false, error: 'attacker not found' };
  if (!targetLocInitial || !targetLocInitial.instance) return { success: false, error: 'target not found' };

  const attacker = attackerLoc.instance;
  const attackerOwner = attackerLoc.owner;

  // Validate attacker location and state
  if (!(attackerLoc.zone === 'leader' || attackerLoc.zone === 'char')) {
    return { success: false, error: 'attacker must be Leader or Character on field' };
  }
  if (attacker.state !== 'active') {
    return { success: false, error: 'attacker must be active to attack' };
  }

  // Validate initial target placement (leader or rested character)
  let targetLoc = targetLocInitial;
  if (targetLoc.zone === 'char') {
    if (targetLoc.instance.state !== 'rested') {
      return { success: false, error: 'target character must be rested' };
    }
  } else if (targetLoc.zone !== 'leader') {
    return { success: false, error: 'target must be leader or rested character' };
  }

  // Attack Step: rest the attacker
  attacker.state = 'rested';

  // Block Step: automatic first active blocker if target is a leader or character
  let blockedBy = null;
  if (targetLoc.zone === 'leader' || targetLoc.zone === 'char') {
    const defenderOwner = targetLoc.owner;
    const blockerInst = _findActiveBlocker(gameState, defenderOwner);
    if (blockerInst) {
      // Rest blocker and set as new target
      blockerInst.state = 'rested';
      blockedBy = blockerInst;
      const newLoc = findInstance(gameState, blockerInst.instanceId);
      if (newLoc) targetLoc = newLoc;
    }
  }

  // Counter Step: placeholder (no counters implemented)
  // ...

  // Damage Step: compute powers and resolve
  const attackerPower = _computePower(gameState, attacker, { isOwnerTurn: false });
  const targetInstance = targetLoc.instance;
  const targetPower = _computePower(gameState, targetInstance, { isOwnerTurn: false });

  const result = {
    success: true,
    attacker: { id: attackerInstanceId, power: attackerPower, owner: attackerOwner },
    target: { id: targetLoc.instance.instanceId, zone: targetLoc.zone, power: targetPower, owner: targetLoc.owner },
    blockedBy: blockedBy ? { id: blockedBy.instanceId } : null,
    winner: null,
    ko: [],
    leaderDamage: null,
    error: null
  };

  // Compare powers
  if (attackerPower >= targetPower) {
    result.winner = 'attacker';
    if (targetLoc.zone === 'leader') {
      // Deal 1 damage to the leader's owner
      const dmgRes = dealDamage(gameState, targetLoc.owner, 1);
      result.leaderDamage = dmgRes;
    } else if (targetLoc.zone === 'char' || targetLoc.zone === 'attached') {
      const koRes = _koCharacter(gameState, targetLoc.instance);
      if (koRes.success) result.ko.push(koRes);
      else result.ko.push({ success: false, error: koRes.error });
    } else {
      // unexpected zone - do nothing
    }
  } else {
    result.winner = 'defender';
  }

  return result;
}

/* Default export for convenience */
export default {
  conductBattle
};
