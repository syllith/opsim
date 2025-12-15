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
 *  - findInstance(gameState, instanceId) -> { owner, zone, index, instance, parentInstance? } | null
 *  - removeInstance(gameState, instanceId) -> removedInstance | null
 *  - addToZone(gameState, owner, zone, instance, options) -> { success, error }
 *  - moveToZone(gameState, instanceId, toOwner, toZone, options) -> { success, from, to, error }
 *
 * NOTES
 *  - This file supports locating 'attached' objects (attachedDons) on field instances.
 *  - When a target is attached, findInstance returns zone === 'attached' and includes
 *    parentInstance in the return object so callers can act on the parent if needed.
 *
 * MUTATION SEMANTICS
 *  - These helpers mutate the provided gameState directly (imperative helpers).
 *  - They update instance.owner and instance.zone to reflect new location.
 *
 * =============================================================================
 */

import { createCardInstance } from './gameState.js';

function arrayZones() {
  return ['deck', 'donDeck', 'hand', 'trash', 'char', 'costArea', 'life'];
}

function isSingleZone(zone) {
  return zone === 'leader' || zone === 'stage';
}

/**
 * Helper to inspect an instance for attached arrays (attachedDons etc.)
 * Returns {found: true, zone: 'attached', index, instance: attachedObj, parentInstance}
 * or null if not found.
 */
function _inspectAttachedOnInstance(owner, instance, instanceId) {
  if (!instance || !Array.isArray(instance.attachedDons)) return null;
  for (let j = 0; j < instance.attachedDons.length; j++) {
    const att = instance.attachedDons[j];
    if (att && att.instanceId === instanceId) {
      return { owner, zone: 'attached', index: j, instance: att, parentInstance: instance };
    }
  }
  return null;
}

/**
 * findInstance(gameState, instanceId)
 * Searches all players and zones for a matching instanceId.
 * Returns { owner, zone, index, instance, parentInstance? } or null.
 *
 * New behavior: Also searches attachedDons arrays on leader/stage and array-zone instances.
 */
export function findInstance(gameState, instanceId) {
  if (!gameState || !instanceId) return null;
  const players = gameState.players || {};
  for (const owner of Object.keys(players)) {
    const p = players[owner];

    // single slots: leader
    if (p.leader) {
      if (p.leader.instanceId === instanceId) {
        return { owner, zone: 'leader', index: 0, instance: p.leader };
      }
      // inspect attachedDons on leader
      const attachedRes = _inspectAttachedOnInstance(owner, p.leader, instanceId);
      if (attachedRes) return attachedRes;
    }

    // single slot: stage
    if (p.stage) {
      if (p.stage.instanceId === instanceId) {
        return { owner, zone: 'stage', index: 0, instance: p.stage };
      }
      // inspect attachedDons on stage
      const attachedRes2 = _inspectAttachedOnInstance(owner, p.stage, instanceId);
      if (attachedRes2) return attachedRes2;
    }

    // array zones
    for (const zone of arrayZones()) {
      const arr = p[zone] || [];
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst && inst.instanceId === instanceId) {
          return { owner, zone, index: i, instance: inst };
        }

        // inspect attachedDons on this instance
        const attachedRes = _inspectAttachedOnInstance(owner, inst, instanceId);
        if (attachedRes) return attachedRes;
      }
    }
  }
  return null;
}

/**
 * removeInstance(gameState, instanceId)
 * Removes the instance from its zone and returns the removed instance object.
 * Returns null if not found.
 *
 * Supports removing attached objects (zone === 'attached') by removing from
 * the parentInstance.attachedDons array and updating the parent's givenDon field.
 */
export function removeInstance(gameState, instanceId) {
  const loc = findInstance(gameState, instanceId);
  if (!loc) return null;
  const { owner, zone, index, parentInstance } = loc;
  const p = gameState.players[owner];

  if (zone === 'attached') {
    // Remove from parentInstance.attachedDons
    if (!parentInstance || !Array.isArray(parentInstance.attachedDons)) return null;
    const [removed] = parentInstance.attachedDons.splice(index, 1);
    // Update parent's givenDon
    parentInstance.givenDon = parentInstance.attachedDons.length;
    // Clear attached metadata on removed (normalize)
    if (removed) {
      removed.zone = null;
      removed.attachedTo = null;
    }
    return removed;
  }

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
  const { owner: fromOwner, zone: fromZone, index: fromIndex } = loc;

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
