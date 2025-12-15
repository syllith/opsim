'use strict';
// continuousEffects.js — Continuous Effect Management (UPDATED getComputedStat)
// =============================================================================
// PURPOSE:
// This module manages continuous effects that modify card stats (power, cost,
// counter). It tracks active modifiers, handles duration expiry, and computes
// final stat values with proper layering.
// =============================================================================

// (Documentation kept succinct here — refer to earlier file for full spec)

// Implementation note: This file now implements getComputedStat to support:
//  - setBase (last one wins)
//  - add (sum of modifiers)
//  - DON bonus (+1000 per givenDon during owner's turn) via options.isOwnerTurn
// perCount and other advanced behaviors remain TODO.

// =============================================================================
// Utility helpers as before
// =============================================================================

function ensureContinuousArray(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Array.isArray(gameState.continuousEffects)) {
    gameState.continuousEffects = [];
  }
}

export const addModifier = (gameState, modifier) => {
  ensureContinuousArray(gameState);
  if (!modifier || typeof modifier !== 'object') {
    throw new TypeError('modifier must be an object');
  }
  if (!modifier.id) {
    throw new TypeError('modifier must have an id');
  }
  gameState.continuousEffects.push(modifier);
  return gameState;
};

export const removeModifier = (gameState, modifierId) => {
  ensureContinuousArray(gameState);
  const idx = gameState.continuousEffects.findIndex(m => m && m.id === modifierId);
  if (idx === -1) return null;
  const [removed] = gameState.continuousEffects.splice(idx, 1);
  return removed;
};

export const removeModifiersForInstance = (gameState, instanceId) => {
  ensureContinuousArray(gameState);
  const before = gameState.continuousEffects.length;
  gameState.continuousEffects = gameState.continuousEffects.filter(m => {
    if (!m || !Array.isArray(m.targetInstanceIds)) return true;
    return !m.targetInstanceIds.includes(instanceId);
  });
  const after = gameState.continuousEffects.length;
  return before - after;
};

export const expireModifiers = (gameState, trigger) => {
  ensureContinuousArray(gameState);
  if (!trigger) return 0;
  const before = gameState.continuousEffects.length;
  if (trigger === 'turnEnd') {
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== 'thisTurn');
  } else if (trigger === 'battleEnd') {
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== 'thisBattle');
  } else {
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== trigger);
  }
  const after = gameState.continuousEffects.length;
  return before - after;
};

/**
 * getModifiersFor(gameState, instanceId)
 * Returns list of modifiers that target this instance (shallow copy).
 */
export const getModifiersFor = (gameState, instanceId) => {
  ensureContinuousArray(gameState);
  return gameState.continuousEffects.filter(m => m && Array.isArray(m.targetInstanceIds) && m.targetInstanceIds.includes(instanceId));
};

/**
 * getComputedStat(gameState, instanceId, stat, baseValue = 0, options = {})
 *
 * Computes final stat according to layering:
 * 1) baseValue
 * 2) last setBase modifier (if any) -> overrides baseValue
 * 3) sum of add modifiers
 * 4) DON bonus: +1000 * givenDon if options.isOwnerTurn === true
 *
 * options:
 *  - isOwnerTurn: boolean (default false)
 *
 * Note:
 *  - perCount and other advanced modes are TODO.
 */
export const getComputedStat = (gameState, instanceId, stat, baseValue = 0, options = {}) => {
  ensureContinuousArray(gameState);
  if (!instanceId) return baseValue;

  const mods = gameState.continuousEffects.filter(m => m && Array.isArray(m.targetInstanceIds) && m.targetInstanceIds.includes(instanceId) && m.stat === stat);
  // No modifiers -> return baseValue directly (plus DON if applicable)
  let value = baseValue;

  if (mods.length > 0) {
    // SetBase: choose the most recent (last in array)
    const setBaseMods = mods.filter(m => m.mode === 'setBase' && typeof m.amount === 'number');
    if (setBaseMods.length > 0) {
      const lastSetBase = setBaseMods[setBaseMods.length - 1];
      value = lastSetBase.amount;
    }

    // Sum add modifiers
    const addMods = mods.filter(m => m.mode === 'add' && typeof m.amount === 'number');
    const addSum = addMods.reduce((acc, m) => acc + m.amount, 0);
    value = value + addSum;

    // TODO: perCount handling
  }

  // DON bonus: if ownerTurn then +1000 per givenDon on instance
  // Find instance to check givenDon
  let givenDon = 0;
  let ownerId = null;
  // search players for instance and get givenDon/owner
  if (gameState && gameState.players) {
    for (const ownerKey of Object.keys(gameState.players)) {
      const p = gameState.players[ownerKey];
      // check leader
      if (p.leader && p.leader.instanceId === instanceId) {
        givenDon = p.leader.givenDon || 0;
        ownerId = ownerKey;
        break;
      }
      // stage
      if (p.stage && p.stage.instanceId === instanceId) {
        givenDon = p.stage.givenDon || 0;
        ownerId = ownerKey;
        break;
      }
      // arrays
      const zoneNames = ['deck','donDeck','hand','trash','char','costArea','life'];
      let found = false;
      for (const z of zoneNames) {
        const arr = p[z] || [];
        for (const inst of arr) {
          if (inst && inst.instanceId === instanceId) {
            givenDon = inst.givenDon || 0;
            ownerId = ownerKey;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (ownerId) break;
    }
  }

  if (options && options.isOwnerTurn === true && typeof givenDon === 'number' && givenDon > 0) {
    value = value + (1000 * givenDon);
  }

  return value;
};

export default {
  addModifier,
  removeModifier,
  removeModifiersForInstance,
  expireModifiers,
  getComputedStat,
  getModifiersFor
};
