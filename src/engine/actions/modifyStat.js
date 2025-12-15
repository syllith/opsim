'use strict';
/*
 * modifyStat.js — Creates and registers a ContinuousEffect that modifies stats.
 * =============================================================================
 *
 * PURPOSE
 *  - Provide a simple action that produces a ContinuousEffect object and registers
 *    it in gameState.continuousEffects. This is used by ability effects to apply
 *    persistent or duration-based stat changes.
 *
 * API
 *   modifyStat(gameState, descriptor) -> { success: boolean, modifierId?: string, error?: string }
 *
 * descriptor:
 *  {
 *    stat: 'power' | 'cost' | 'counter',
 *    mode: 'add' | 'setBase' | 'perCount',
 *    amount?: number,            // for add/setBase
 *    perCount?: number,          // for perCount
 *    perAmount?: number,         // for perCount
 *    countSelector?: any,        // left as opaque for now; engine evaluator will interpret
 *    targetInstanceIds: [ 'i-1', ... ],
 *    duration: 'thisTurn'|'thisBattle'|'permanent'|'untilStartOfYourNextTurn'|'untilEndOfOpponentsNextTurn',
 *    sourceInstanceId?: string,
 *    ownerId?: 'player'|'opponent'
 *  }
 *
 * NOTES
 *  - This module is intentionally small: it validates the descriptor, creates
 *    a modifier object, gives it a deterministic modifierId using gameState.nextModifierId,
 *    and registers it via continuousEffects.addModifier if present; otherwise it
 *    appends it to gameState.continuousEffects directly.
 *
 *  - The continuousEffects module is expected to compute the final stats later.
 *
 * TODO
 *  - Integrate countSelector resolution to compute perCount values during modifier application
 *  - Add audit logging via logger
 * =============================================================================
 */

import { addModifier as addModifierHelper } from '../modifiers/continuousEffects.js';

/**
 * generateModifierId(gameState) -> string
 * Deterministic modifier id generator stored on gameState.nextModifierId
 */
function generateModifierId(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Number.isInteger(gameState.nextModifierId)) gameState.nextModifierId = 1;
  const id = `mod-${gameState.nextModifierId}`;
  gameState.nextModifierId += 1;
  return id;
}

/**
 * validateDescriptor(descriptor) -> { ok: boolean, error?: string }
 */
function validateDescriptor(desc) {
  if (!desc || typeof desc !== 'object') return { ok: false, error: 'missing descriptor' };
  const { stat, mode, targetInstanceIds } = desc;
  const validStats = ['power', 'cost', 'counter'];
  const validModes = ['add', 'setBase', 'perCount'];
  if (!validStats.includes(stat)) return { ok: false, error: `invalid stat ${stat}` };
  if (!validModes.includes(mode)) return { ok: false, error: `invalid mode ${mode}` };
  if (!Array.isArray(targetInstanceIds) || targetInstanceIds.length === 0) {
    return { ok: false, error: 'targetInstanceIds must be a non-empty array of instanceIds' };
  }
  // Basic validation for amounts
  if (mode === 'add' || mode === 'setBase') {
    if (typeof desc.amount !== 'number') return { ok: false, error: 'amount must be a number for add/setBase' };
  } else if (mode === 'perCount') {
    if (typeof desc.perCount !== 'number' || typeof desc.perAmount !== 'number') {
      return { ok: false, error: 'perCount and perAmount must be numbers for perCount mode' };
    }
    if (!desc.countSelector) {
      return { ok: false, error: 'countSelector is required for perCount mode' };
    }
  }
  // Duration basic check (allow many strings for flexibility)
  if (!desc.duration) return { ok: false, error: 'duration is required' };
  return { ok: true };
}

/**
 * modifyStat(gameState, descriptor)
 * Registers a continuous effect modifier and returns result.
 */
export function modifyStat(gameState, descriptor = {}) {
  if (!gameState || typeof gameState !== 'object') {
    return { success: false, error: 'invalid gameState' };
  }

  const valid = validateDescriptor(descriptor);
  if (!valid.ok) return { success: false, error: valid.error };

  // Build ContinuousEffect object (see continuousEffects placeholder schema)
  const modifier = {
    id: generateModifierId(gameState),
    type: 'statModifier',
    stat: descriptor.stat,
    mode: descriptor.mode,
    amount: typeof descriptor.amount === 'number' ? descriptor.amount : undefined,
    perCount: typeof descriptor.perCount === 'number' ? descriptor.perCount : undefined,
    perAmount: typeof descriptor.perAmount === 'number' ? descriptor.perAmount : undefined,
    countSelector: descriptor.countSelector || null,
    targetInstanceIds: Array.isArray(descriptor.targetInstanceIds) ? descriptor.targetInstanceIds.slice() : [],
    duration: descriptor.duration,
    sourceInstanceId: descriptor.sourceInstanceId || null,
    createdTurn: gameState.turnNumber || 0,
    createdPhase: gameState.phase || null,
    ownerId: descriptor.ownerId || null
  };

  // Ensure there's a continuousEffects array
  if (!Array.isArray(gameState.continuousEffects)) gameState.continuousEffects = [];

  // Prefer using the continuousEffects.addModifier helper if present
  try {
    if (typeof addModifierHelper === 'function') {
      // The addModifierHelper in placeholder returns new state or mutated state.
      // Call it and assume it will handle adding it correctly.
      addModifierHelper(gameState, modifier);
    } else {
      // fallback — append directly
      gameState.continuousEffects.push(modifier);
    }
  } catch (e) {
    // Fallback to direct push on error
    gameState.continuousEffects.push(modifier);
  }

  return { success: true, modifierId: modifier.id };
}

export default { modifyStat };
