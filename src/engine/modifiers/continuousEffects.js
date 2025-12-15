'use strict';
// continuousEffects.js — Continuous Effect Management
// =============================================================================
// PURPOSE:
// This module manages continuous effects that modify card stats (power, cost,
// counter). It tracks active modifiers, handles duration expiry, and computes
// final stat values with proper layering.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Track active stat modifiers on cards
// - Compute total stats with proper layering order
// - Handle modifier duration expiry
// - Clean up modifiers on zone change
// - Support all modifier modes (add, setBase, perCount)
// =============================================================================

// =============================================================================
// PUBLIC API
// =============================================================================
// addModifier(gameState, modifier) -> GameState
//   Adds a new continuous effect modifier.
//   modifier: ContinuousEffect object
//
// removeModifier(gameState, modifierId) -> GameState
//   Removes a modifier by ID.
//
// removeModifiersForInstance(gameState, instanceId) -> GameState
//   Removes all modifiers targeting a specific card instance.
//   Called on zone change.
//
// expireModifiers(gameState, trigger) -> GameState
//   Removes modifiers that have expired based on trigger.
//   trigger: 'turnEnd' | 'battleEnd' | 'phaseChange'
//
// getComputedStat(gameState, instanceId, stat) -> number
//   Returns the final computed value for a stat.
//   stat: 'power' | 'cost' | 'counter'
//
// getModifiersFor(gameState, instanceId) -> ContinuousEffect[]
//   Returns all active modifiers affecting a card instance.
// =============================================================================

// =============================================================================
// CONTINUOUSEFFECT SCHEMA
// =============================================================================
// ContinuousEffect = {
//   id: string,                      // Unique modifier ID
//   type: 'statModifier',
//   stat: 'power' | 'cost' | 'counter',
//   mode: 'add' | 'setBase' | 'perCount',
//   amount: number,                  // Computed final amount
//   targetInstanceIds: string[],     // Cards affected
//   duration: Duration,
//   sourceInstanceId: string,        // Card that created this
//   createdTurn: number,
//   createdPhase: string,
//   ownerId: 'player' | 'opponent'
// }
// =============================================================================

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - modifier: ContinuousEffect to add
// - instanceId: for querying specific cards
// - stat: which stat to compute
// - trigger: expiry trigger type
//
// OUTPUTS:
// - GameState with updated continuousEffects array
// - number for stat queries
// - ContinuousEffect[] for modifier queries
//
// STORAGE:
// gameState.continuousEffects: ContinuousEffect[]
// =============================================================================

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/modifyStat.js: adds modifiers
// - src/engine/core/zones.js: removes modifiers on zone change
// - src/engine/core/turnController.js: expires modifiers at turn end
// - src/engine/core/battle.js: expires modifiers at battle end
// - src/engine/index.js getTotalPower: queries computed stats
//
// DEPENDS ON:
// - src/engine/core/gameState.js: card instance access
// - Card database: base stat values
// =============================================================================

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// STAT LAYERING ORDER:
// 1. Base (printed) value
// 2. setBase effects (last one wins)
// 3. Add effects (all sum together, can be negative)
// 4. DON bonus (+1000 per attached DON, if owner's turn)
//
// SETBASE HANDLING:
// If multiple setBase effects exist, only the most recent applies.
// Add effects apply ON TOP of the setBase result.
//
// EXAMPLE CALCULATION:
// Base power: 5000
// setBase 0: Power becomes 0
// add +2000: Power becomes 2000
// 2 DON attached, owner's turn: Power becomes 4000
//
// DURATION CHECKING:
// - 'thisTurn': Remove when turn ends for creator
// - 'thisBattle': Remove when battle ends
// - 'untilStartOfYourNextTurn': Remove at creator's next refresh
// - 'untilEndOfOpponentsNextTurn': Remove after opponent's end phase
// - 'permanent': Never auto-remove
//
// ZONE CHANGE CLEANUP:
// When a card changes zones:
// - All modifiers targeting that instanceId are removed
// - The new instance (new instanceId) has no modifiers
//
// NEGATIVE POWER:
// Power can go negative from effects.
// For battle purposes, negative power loses to any positive power.
// Display as 0 or the actual negative value (game rule dependent).
// =============================================================================

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: addModifier stores correctly
//   Input: Add +2000 power modifier to character
//   Expected: Modifier in continuousEffects array
//
// TEST: getComputedStat applies add modifier
//   Input: Base 5000 + add 2000
//   Expected: getComputedStat returns 7000
//
// TEST: getComputedStat applies setBase
//   Input: Base 5000, setBase 0
//   Expected: getComputedStat returns 0
//
// TEST: setBase then add layering
//   Input: Base 5000, setBase 0, add 2000
//   Expected: 2000 (setBase makes 0, then +2000)
//
// TEST: expireModifiers removes ended
//   Input: 'thisTurn' modifier, call expireModifiers('turnEnd')
//   Expected: Modifier removed from array
//
// TEST: zone change cleanup
//   Input: Card with modifier moves to hand
//   Expected: Modifier removed for old instanceId
// =============================================================================

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement addModifier
// [ ] 2. Implement removeModifier
// [ ] 3. Implement removeModifiersForInstance
// [ ] 4. Implement expireModifiers with duration checking
// [ ] 5. Implement getComputedStat with layering
// [ ] 6. Handle setBase (last wins)
// [ ] 7. Handle perCount mode computation
// [ ] 8. Integrate DON bonus into power calculation
// [ ] 9. Handle negative values appropriately
// [ ] 10. Add logging for modifier changes
// =============================================================================

// =============================================================================
// EXPORTS — STUBS (with add/remove implemented)
// =============================================================================

/**
 * Ensure an array exists at gameState.continuousEffects
 */
function ensureContinuousArray(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Array.isArray(gameState.continuousEffects)) {
    gameState.continuousEffects = [];
  }
}

/**
 * addModifier(gameState, modifier)
 * - Ensures continuousEffects array exists
 * - If modifier.id is missing, throws (id should be provided by caller)
 * - Appends modifier to gameState.continuousEffects
 * - Returns gameState (mutated)
 */
export const addModifier = (gameState, modifier) => {
  ensureContinuousArray(gameState);
  if (!modifier || typeof modifier !== 'object') {
    throw new TypeError('modifier must be an object');
  }
  if (!modifier.id) {
    throw new TypeError('modifier must have an id');
  }
  // push modifier (mutating)
  gameState.continuousEffects.push(modifier);
  return gameState;
};

/**
 * removeModifier(gameState, modifierId)
 * Removes a modifier by ID (mutates gameState). Returns the removed modifier or null.
 */
export const removeModifier = (gameState, modifierId) => {
  ensureContinuousArray(gameState);
  const idx = gameState.continuousEffects.findIndex(m => m && m.id === modifierId);
  if (idx === -1) return null;
  const [removed] = gameState.continuousEffects.splice(idx, 1);
  return removed;
};

/**
 * removeModifiersForInstance(gameState, instanceId)
 * Removes all modifiers targeting the provided instanceId.
 * Returns number of removed modifiers.
 */
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

/**
 * expireModifiers(gameState, trigger)
 * Remove modifiers whose duration matches the trigger.
 * NOTE: This is a simplified placeholder: it removes modifiers whose duration
 * exactly equals the trigger mapping. Production logic must consider "thisTurn"
 * vs "untilStartOfYourNextTurn" semantics, owner vs creator, and exact timing.
 *
 * For now:
 *  - trigger === 'turnEnd' => remove modifiers where duration === 'thisTurn'
 *  - trigger === 'battleEnd' => remove modifiers where duration === 'thisBattle'
 */
export const expireModifiers = (gameState, trigger) => {
  ensureContinuousArray(gameState);
  if (!trigger) return 0;
  const before = gameState.continuousEffects.length;
  if (trigger === 'turnEnd') {
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== 'thisTurn');
  } else if (trigger === 'battleEnd') {
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== 'thisBattle');
  } else {
    // generic removal for demonstration; production requires more nuance
    gameState.continuousEffects = gameState.continuousEffects.filter(m => m.duration !== trigger);
  }
  const after = gameState.continuousEffects.length;
  return before - after;
};

/**
 * getComputedStat(gameState, instanceId, stat)
 * Placeholder that applies very simple layering:
 *  - Start with base from instance.cardId? (caller should provide base)
 *  - Apply setBase if any (most recent wins)
 *  - Apply sum of add modifiers
 *
 * This function expects the caller to pass a base value if desired. For now we
 * return NaN to signal unimplemented. Later this will be fully implemented.
 */
export const getComputedStat = (gameState, instanceId, stat, baseValue = 0) => {
  ensureContinuousArray(gameState);
  // Find all modifiers targeting instanceId and stat
  const mods = gameState.continuousEffects.filter(m => m && Array.isArray(m.targetInstanceIds) && m.targetInstanceIds.includes(instanceId) && m.stat === stat);
  if (mods.length === 0) return baseValue;

  // Apply setBase: pick the most recently added setBase modifier if present
  const setBases = mods.filter(m => m.mode === 'setBase');
  let value = baseValue;
  if (setBases.length > 0) {
    // assume later-added modifiers are later in the array
    const lastSetBase = setBases[setBases.length - 1];
    value = typeof lastSetBase.amount === 'number' ? lastSetBase.amount : value;
  }

  // Sum 'add' modifiers
  const addMods = mods.filter(m => m.mode === 'add');
  const addSum = addMods.reduce((acc, m) => acc + (typeof m.amount === 'number' ? m.amount : 0), 0);
  value = value + addSum;

  // Note: perCount and DON bonuses not yet implemented in this placeholder

  return value;
};

export const getModifiersFor = (gameState, instanceId) => {
  ensureContinuousArray(gameState);
  return gameState.continuousEffects.filter(m => m && Array.isArray(m.targetInstanceIds) && m.targetInstanceIds.includes(instanceId));
};

export default {
  addModifier,
  removeModifier,
  removeModifiersForInstance,
  expireModifiers,
  getComputedStat,
  getModifiersFor
};
