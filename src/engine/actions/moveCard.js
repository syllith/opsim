'use strict';
/*
 * moveCard.js — Action to move a card instance between zones (wrapper around zones helpers)
 * =============================================================================
 *
 * PURPOSE
 *  - Provide a small, robust action used by higher-level action interpreter to
 *    move a card instance identified by instanceId to a new owner/zone.
 *
 * RESPONSIBILITIES
 *  - Validate inputs and resolve destination semantics.
 *  - Use core zone helpers (moveToZone / addToZone / removeInstance) to perform move.
 *  - Apply optional runtime flags such as setting faceUp.
 *  - Return a consistent result shape for callers:
 *      { success: true, from: {...}, to: {...} }
 *      or { success: false, error: '...' }
 *
 * DEPENDENCIES
 *  - src/engine/core/gameState.js (for createCardInstance if needed)
 *  - src/engine/core/zones.js for actual zone operations
 *
 * NOTES
 *  - This action mutates gameState (zones helpers mutate gameState).
 *  - For more complex ability actions, the action interpreter will call this helper.
 *
 * PUBLIC API
 *  - moveCard(gameState, instanceId, destination, options) -> result
 *
 * Parameters:
 *  - gameState: canonical engine game state object
 *  - instanceId: string id of the instance to move
 *  - destination:
 *      - string: zone name (owner assumed to be current instance owner)
 *      - object: { owner?: 'player'|'opponent', zone: 'hand'|'char'|..., index?: number, top?: boolean }
 *  - options:
 *      - faceUp: boolean | undefined  -> set instance.faceUp after move
 *      - enterRested: boolean | undefined -> informational; not processed here but available for callers
 *
 * RETURNS:
 *  - { success: true, from: {owner, zone, index}, to: {owner, zone, index} }
 *  - or { success: false, error: '...' }
 *
 * TEST PLAN
 *  - See tests/moveCard.test.js for examples.
 * =============================================================================
 */

import { findInstance } from '../core/zones.js';
import zones from '../core/zones.js'; // default export object for direct usage
// Note: zones exports default { findInstance,... } and named; we ensure import works
// If your environment doesn't support both, adjust to named imports.

const { moveToZone } = zones;

/**
 * Normalize destination argument into { owner, zone, index?, top? }.
 * If destination is string, owner is kept as provided (or fallback later).
 */
function normalizeDestination(destination, currentOwner) {
  if (!destination) return null;
  if (typeof destination === 'string') {
    return { owner: currentOwner, zone: destination };
  }
  if (typeof destination === 'object') {
    const owner = destination.owner || currentOwner;
    const zone = destination.zone;
    const index = typeof destination.index === 'number' ? destination.index : undefined;
    const top = !!destination.top;
    return { owner, zone, index, top };
  }
  return null;
}

/**
 * moveCard(gameState, instanceId, destination, options)
 *
 * destination: string or { owner?, zone, index?, top? }
 * options: { faceUp?, enterRested? } - currently faceUp will be applied to the instance after move
 */
export function moveCard(gameState, instanceId, destination, options = {}) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  // Locate existing instance
  const loc = findInstance(gameState, instanceId);
  if (!loc) return { success: false, error: `instance ${instanceId} not found` };

  const currentOwner = loc.owner;
  const dest = normalizeDestination(destination, currentOwner);
  if (!dest || !dest.zone) {
    return { success: false, error: 'invalid destination' };
  }

  // Prepare add options for moveToZone: { index, top }
  const addOpts = {};
  if (typeof dest.index === 'number') addOpts.index = dest.index;
  if (dest.top) addOpts.top = true;

  // Use zones.moveToZone which implements remove + add + rollback semantics
  const result = moveToZone(gameState, instanceId, dest.owner, dest.zone, addOpts);

  if (!result || !result.success) {
    return { success: false, error: result && result.error ? result.error : 'move failed' };
  }

  // Apply faceUp option after successful move (instance now located at result.to)
  if (options.faceUp !== undefined) {
    const afterLoc = findInstance(gameState, instanceId);
    if (afterLoc && afterLoc.instance) {
      afterLoc.instance.faceUp = !!options.faceUp;
    }
  }

  // enterRested is an engine-level concern about whether field entries enter rested.
  // We store it as metadata on instance if provided for later handling by battle/turn logic.
  if (options.enterRested !== undefined) {
    const afterLoc = findInstance(gameState, instanceId);
    if (afterLoc && afterLoc.instance) {
      afterLoc.instance.enterRested = !!options.enterRested;
    }
  }

  return result;
}

export default {
  moveCard
};
