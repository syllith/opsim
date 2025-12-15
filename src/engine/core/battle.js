'use strict';
/*
 * battle.js — Minimal Battle Engine (sync-or-async counter support)
 * =============================================================================
 *
 * This version keeps conductBattle callable synchronously in the common case
 * (no prompt / immediate counter resolution) but also supports the counter
 * step returning a Promise (for prompt-driven interaction) by returning a
 * Promise from conductBattle when necessary.
 *
 * The function computeDamageAndResolve(...) contains the damage-resolution
 * logic so it can be invoked synchronously or after the counter Promise.
 *
 * The Counter Step currently:
 *  - looks for counter cards in defender hand and, if found, trashes the first
 *    such card and applies its counter value as a +power modifier for thisBattle.
 *
 * =============================================================================
 */

import zones from './zones.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import { dealDamage } from '../actions/dealDamage.js';
import { modifyStat } from '../actions/modifyStat.js';
import engine from '../index.js';

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
   Counter Step implementation
   ------------------------- */
/**
 * _performCounterStep(gameState, defenderOwner, targetInstanceId)
 *
 * Synchronous-path: returns an object { success, applied, ... } if the counter
 * step can be completed synchronously (no prompt).
 *
 * Async-path: if the engine integrates prompt-manager or a prompt-based
 * counter step, this helper may return a Promise resolving to the same shape.
 *
 * Current behavior: synchronous auto-trash of first hand card with numeric counter.
 */
function _performCounterStep(gameState, defenderOwner, targetInstanceId) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.hand)) return { success: true, applied: false };

  // find first counter card in hand
  let idx = -1;
  for (let i = 0; i < p.hand.length; i++) {
    const c = p.hand[i];
    if (c && typeof c.counter === 'number' && c.counter > 0) { idx = i; break; }
  }
  if (idx === -1) return { success: true, applied: false };

  // remove from hand and move to trash
  const [trashed] = p.hand.splice(idx, 1);
  if (!Array.isArray(p.trash)) p.trash = [];
  trashed.zone = 'trash';
  p.trash.push(trashed);

  // apply modifier for this battle to the target instance
  try {
    const desc = {
      stat: 'power',
      mode: 'add',
      amount: trashed.counter,
      targetInstanceIds: [targetInstanceId],
      duration: 'thisBattle',
      sourceInstanceId: trashed.instanceId,
      ownerId: defenderOwner
    };
    // modifyStat is an immediate action helper that mutates gameState
    modifyStat(gameState, desc);
  } catch (e) {
    return { success: false, error: String(e) };
  }

  return { success: true, applied: true, trashedInstanceId: trashed.instanceId, amount: trashed.counter };
}

/* -------------------------
   Helper: damage computation + resolving
   ------------------------- */
function _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy) {
  const attacker = attackerLoc.instance;
  const attackerOwner = attackerLoc.owner;

  const attackerPower = _computePower(gameState, attacker, { isOwnerTurn: false });
  const targetInstance = targetLoc.instance;
  const targetPower = _computePower(gameState, targetInstance, { isOwnerTurn: false });

  const result = {
    success: true,
    attacker: { id: attackerLoc.instance.instanceId, power: attackerPower, owner: attackerOwner },
    target: { id: targetLoc.instance.instanceId, zone: targetLoc.zone, power: targetPower, owner: targetLoc.owner },
    blockedBy: blockedBy ? { id: blockedBy.instanceId } : null,
    winner: null,
    ko: [],
    leaderDamage: null,
    error: null
  };

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

/* -------------------------
   conductBattle (sync-or-async aware)
   ------------------------- */
export function conductBattle(gameState, attackerInstanceId, targetInstanceId) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!attackerInstanceId || !targetInstanceId) return { success: false, error: 'missing instance ids' };

  const attackerLoc = findInstance(gameState, attackerInstanceId);
  const targetLocInitial = findInstance(gameState, targetInstanceId);

  if (!attackerLoc || !attackerLoc.instance) return { success: false, error: 'attacker not found' };
  if (!targetLocInitial || !targetLocInitial.instance) return { success: false, error: 'target not found' };

  const attacker = attackerLoc.instance;

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

  // Counter Step: perform (may return object or Promise)
  try {
    const counterRes = _performCounterStep(gameState, targetLoc.owner, targetLoc.instance.instanceId);

    // If counterRes is a Promise (thenable), return a Promise that continues after it
    if (counterRes && typeof counterRes.then === 'function') {
      return counterRes.then(() => {
        // After counter finishes, compute damage result and return
        return _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy);
      }).catch((e) => {
        // If counter promise rejects, log and proceed as if no counter applied
        try { engine.emit('counterStepError', { error: String(e) }); } catch (_) {}
        return _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy);
      });
    }

    // Synchronous path: compute damage and return immediately
    return _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy);
  } catch (e) {
    // If counter step threw synchronously, log and still compute damage
    try { engine.emit('counterStepError', { error: String(e) }); } catch (_) {}
    return _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy);
  }
}

/* Default export for convenience */
export default {
  conductBattle
};
