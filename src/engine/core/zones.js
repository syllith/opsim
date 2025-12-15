'use strict';
/*
 * zones.js — Zone helpers: find, remove, add, and move card instances between zones
 * =============================================================================
 *
 * PURPOSE
 *  - Provide safe, tested helpers to manage card instances moving between zones.
 *  - Implement single-slot zones (leader, stage) and array zones
 *    (deck, hand, char, costArea, donDeck, trash, life).
 *
 * PRIMARY FUNCTIONS
 *  - findInstance(gameState, instanceId) -> { owner, zone, index, instance } | null
 *  - removeInstance(gameState, instanceId) -> removedInstance | null
 *  - addToZone(gameState, owner, zone, instance, options) -> { success, error }
 *  - moveToZone(gameState, instanceId, toOwner, toZone, options) -> { success, from, to, error }
 *
 * CONVENTIONS
 *  - Deck indexing: index 0 is the top of the deck.
 *  - addToZone options:
 *      { index: number } -> insert at given index in array zones
 *      { top: true } -> insert at top (unshift) for array zones
 *      default -> push to bottom (array.push)
 *  - Single-slot zones (leader, stage): addToZone throws (returns error) if occupied,
 *    to avoid implicit destruction or complex replacements. Callers may remove first.
 *
 * MUTATION SEMANTICS
 *  - These helpers mutate the provided gameState directly (imperative helpers).
 *  - They update instance.owner and instance.zone to reflect new location.
 *
 * NOTES
 *  - For performance, this is O(N) scanning; a later optimization can add an index.
 *  - Caller is responsible for handling engine-level invariants (e.g., limits on
 *    number of characters).
 *
 * TEST COVERAGE
 *  - The accompanying tests assert createInitialState + find/remove/add/move semantics.
 *
 * TODO
 *  - Add a zone index for O(1) lookups (map instanceId -> location).
 *  - Add optional "force" semantics for leader/stage replacement.
 * =============================================================================
 */

import { generateInstanceId, createCardInstance } from './gameState.js';

/**
 * Return an array of zone names that are considered array zones.
 */
function arrayZones() {
  return ['deck', 'donDeck', 'hand', 'trash', 'char', 'costArea', 'life'];
}

/**
 * Return true if zone is single-slot (leader, stage)
 */
function isSingleZone(zone) {
  return zone === 'leader' || zone === 'stage';
}

/**
 * findInstance(gameState, instanceId)
 * Searches all players and zones for a matching instanceId.
 * Returns { owner, zone, index, instance } or null.
 */
export function findInstance(gameState, instanceId) {
  if (!gameState || !instanceId) return null;
  const players = gameState.players || {};
  for (const owner of Object.keys(players)) {
    const p = players[owner];

    // single slots
    if (p.leader && p.leader.instanceId === instanceId) {
      return { owner, zone: 'leader', index: 0, instance: p.leader };
    }
    if (p.stage && p.stage.instanceId === instanceId) {
      return { owner, zone: 'stage', index: 0, instance: p.stage };
    }

    // array zones
    for (const zone of arrayZones()) {
      const arr = p[zone] || [];
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst && inst.instanceId === instanceId) {
          return { owner, zone, index: i, instance: inst };
        }
      }
    }
  }
  return null;
}

/**
 * removeInstance(gameState, instanceId)
 * Removes the instance from its zone and returns the removed instance object.
 * Returns null if not found.
 */
export function removeInstance(gameState, instanceId) {
  const loc = findInstance(gameState, instanceId);
  if (!loc) return null;
  const { owner, zone, index } = loc;
  const p = gameState.players[owner];
  if (isSingleZone(zone)) {
    const inst = p[zone];
    p[zone] = null;
    return inst;
  } else {
    const arr = p[zone];
    const [removed] = arr.splice(index, 1);
    return removed;
  }
}

/**
 * addToZone(gameState, owner, zone, instance, options)
 * Adds an instance (object) to target zone for owner. Mutates instance.owner and instance.zone.
 * Options:
 *   - index: integer to insert at (array zones)
 *   - top: boolean, insert at top (index 0)
 *
 * Returns { success: true } or { success: false, error: string }.
 *
 * Note: For single-slot zones (leader, stage), operation fails if occupied.
 */
export function addToZone(gameState, owner, zone, instance, options = {}) {
  if (!gameState || !gameState.players) {
    return { success: false, error: 'invalid gameState' };
  }
  if (!gameState.players[owner]) {
    return { success: false, error: `unknown owner ${owner}` };
  }
  const p = gameState.players[owner];

  // Normalize options
  const { index, top } = options;

  if (isSingleZone(zone)) {
    if (p[zone]) {
      return { success: false, error: `zone ${zone} already occupied for owner ${owner}` };
    }
    // set owner/zone and assign
    instance.owner = owner;
    instance.zone = zone;
    p[zone] = instance;
    return { success: true };
  }

  // Array zones
  if (!arrayZones().includes(zone)) {
    return { success: false, error: `unknown zone ${zone}` };
  }
  if (!Array.isArray(p[zone])) {
    p[zone] = [];
  }
  // default index insertion semantics:
  if (typeof index === 'number') {
    // clamp index
    const i = Math.max(0, Math.min(index, p[zone].length));
    instance.owner = owner;
    instance.zone = zone;
    p[zone].splice(i, 0, instance);
    return { success: true };
  }
  if (top) {
    // top = index 0 (e.g., top of deck)
    instance.owner = owner;
    instance.zone = zone;
    p[zone].unshift(instance);
    return { success: true };
  }
  // default: push to bottom
  instance.owner = owner;
  instance.zone = zone;
  p[zone].push(instance);
  return { success: true };
}

/**
 * moveToZone(gameState, instanceId, toOwner, toZone, options)
 * Move an existing instance (identified by instanceId) to a target owner/zone.
 * This is implemented as removeInstance + addToZone with rollback semantics if add fails.
 *
 * options is same as addToZone options.
 *
 * Returns:
 *  { success: true, from: {owner,zone,index}, to: {owner,zone,index} }
 *  or { success: false, error: '...' }
 */
export function moveToZone(gameState, instanceId, toOwner, toZone, options = {}) {
  const loc = findInstance(gameState, instanceId);
  if (!loc) {
    return { success: false, error: `instance ${instanceId} not found` };
  }
  const { owner: fromOwner, zone: fromZone, index: fromIndex, instance } = loc;

  // Remove instance
  const removed = removeInstance(gameState, instanceId);
  if (!removed) {
    return { success: false, error: `failed to remove instance ${instanceId} from ${fromZone}` };
  }

  // Try to add to target
  const addResult = addToZone(gameState, toOwner, toZone, removed, options);
  if (!addResult.success) {
    // Rollback: put back into original location at original index
    // If original was single-slot
    const pFrom = gameState.players[fromOwner];
    if (isSingleZone(fromZone)) {
      pFrom[fromZone] = removed;
    } else {
      // restore at original index (clamp)
      const arr = pFrom[fromZone] || [];
      const i = Math.max(0, Math.min(fromIndex, arr.length));
      removed.owner = fromOwner;
      removed.zone = fromZone;
      arr.splice(i, 0, removed);
      pFrom[fromZone] = arr;
    }
    return { success: false, error: `failed to add to target zone: ${addResult.error}` };
  }

  // Find index of newly added instance in target zone (best-effort)
  const toLoc = findInstance(gameState, instanceId);
  return {
    success: true,
    from: { owner: fromOwner, zone: fromZone, index: fromIndex },
    to: { owner: toLoc.owner, zone: toLoc.zone, index: toLoc.index }
  };
}

/**
 * Utility: create and add a new instance into a zone (convenience)
 * createAndAdd(gameState, cardId, owner, zone, options)
 * returns the created instance.
 */
export function createAndAdd(gameState, cardId, owner, zone, options = {}) {
  const inst = createCardInstance(cardId, owner, zone, gameState);
  const res = addToZone(gameState, owner, zone, inst, options);
  if (!res.success) {
    throw new Error(res.error || 'Failed to add instance');
  }
  return inst;
}

export default {
  findInstance,
  removeInstance,
  addToZone,
  moveToZone,
  createAndAdd
};
