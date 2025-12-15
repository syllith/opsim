'use strict';
/*
 * donManager.js — Minimal DON attachment/detachment manager
 * =============================================================================
 * PURPOSE
 *  - Provide basic operations to attach DON instances from a player's costArea
 *    onto a target instance (leader or character), and to return/detach those DONs
 *    back to the costArea.
 *
 * RESPONSIBILITIES
 *  - giveDon(gameState, owner, targetInstanceId, count)
 *      Move up to `count` DON instances from owner's costArea into the target's
 *      attachedDon list. Returns info about how many moved.
 *  - returnDonFromCard(gameState, targetInstanceId, count)
 *      Move up to `count` DON instances from target's attached list back to the
 *      owner costArea.
 *  - detachDon(gameState, targetInstanceId, count)
 *      Alias to returnDonFromCard for semantic clarity.
 *  - countDonInCostArea(gameState, owner)
 *  - getAttachedDonIds(gameState, targetInstanceId)
 *
 * DESIGN NOTES
 *  - A DON is represented as a CardInstance (same shape as other card instances).
 *  - When attached to a target, we set:
 *      don.zone = 'attached'
 *      don.attachedTo = targetInstanceId
 *    and push the DON object into target.attachedDons array and increment target.givenDon.
 *  - When returned, we set don.zone = 'costArea', don.attachedTo = null and push into
 *    owner's costArea array.
 *  - The DON instance.owner remains the player's id.
 *  - These APIs mutate gameState in-place.
 *
 * EDGE CASES
 *  - If the target is not found, the operation fails (no mutation).
 *  - If costArea has fewer than `count` DONs, move as many as possible (partial success).
 *  - If target.attachedDons is not present, we create the array.
 *
 * TODO
 *  - Integrate DON active/rested state.
 *  - Ensure detach on zone-change (when a card moves).
 *  - Ensure DONs maintain 'rested' metadata when returned (handled by turnController).
 * =============================================================================
 */

import { findInstance } from '../core/zones.js';

/**
 * Helper: ensure target instance has attachedDons array and givenDon count
 */
function ensureAttachedField(targetInstance) {
  if (!targetInstance.attachedDons) targetInstance.attachedDons = [];
  if (typeof targetInstance.givenDon !== 'number') targetInstance.givenDon = 0;
}

/**
 * giveDon(gameState, owner, targetInstanceId, count)
 *
 * Moves up to `count` DON instances from owner.costArea to targetInstance.attachedDons.
 * Returns: { success: boolean, moved: number, newGivenCount?: number, attachedDonIds?: string[], error?: string }
 */
export function giveDon(gameState, owner, targetInstanceId, count = 1) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!owner) return { success: false, error: 'missing owner' };
  if (!targetInstanceId) return { success: false, error: 'missing targetInstanceId' };
  if (!Number.isInteger(count) || count <= 0) return { success: false, error: 'count must be positive integer' };

  const ownerObj = gameState.players && gameState.players[owner];
  if (!ownerObj) return { success: false, error: `owner ${owner} not found` };

  const targetLoc = findInstance(gameState, targetInstanceId);
  if (!targetLoc || !targetLoc.instance) return { success: false, error: `target ${targetInstanceId} not found` };

  // Ensure costArea exists
  if (!Array.isArray(ownerObj.costArea)) ownerObj.costArea = [];

  // If there are no DONs in costArea, nothing to move
  if (ownerObj.costArea.length === 0) {
    return { success: true, moved: 0, newGivenCount: targetLoc.instance.givenDon || 0, attachedDonIds: [] };
  }

  // Determine how many to move
  const avail = ownerObj.costArea.length;
  const toMove = Math.min(count, avail);

  // Splice DONs off the costArea (take from front/top)
  const movedDons = ownerObj.costArea.splice(0, toMove);

  // Attach to target instance
  const targetInst = targetLoc.instance;
  ensureAttachedField(targetInst);

  const attachedIds = [];
  for (const don of movedDons) {
    // Set metadata
    don.zone = 'attached';
    don.attachedTo = targetInst.instanceId;
    // owner remains same
    // Push onto target attached list
    targetInst.attachedDons.push(don);
    attachedIds.push(don.instanceId);
  }
  // Update givenDon count
  targetInst.givenDon = targetInst.attachedDons.length;

  return { success: true, moved: toMove, newGivenCount: targetInst.givenDon, attachedDonIds: attachedIds };
}

/**
 * returnDonFromCard(gameState, targetInstanceId, count)
 * Moves up to `count` attached DONs from target back to owner's costArea.
 * Returns { success, moved, newGivenCount, returnedDonIds }
 */
export function returnDonFromCard(gameState, targetInstanceId, count = 1) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!targetInstanceId) return { success: false, error: 'missing targetInstanceId' };
  if (!Number.isInteger(count) || count <= 0) return { success: false, error: 'count must be positive integer' };

  const loc = findInstance(gameState, targetInstanceId);
  if (!loc || !loc.instance) return { success: false, error: `target ${targetInstanceId} not found` };

  const targetInst = loc.instance;
  ensureAttachedField(targetInst);

  const available = targetInst.attachedDons.length;
  if (available === 0) return { success: true, moved: 0, newGivenCount: 0, returnedDonIds: [] };

  const toMove = Math.min(count, available);

  // Remove the last N attached DONs (LIFO)
  const returned = targetInst.attachedDons.splice(-toMove, toMove);

  // Return them to owner's costArea. Owner is assumed to be targetInst.owner
  const owner = targetInst.owner;
  const ownerObj = gameState.players && gameState.players[owner];
  if (!ownerObj) {
    // rollback: put them back
    targetInst.attachedDons.push(...returned);
    return { success: false, error: `owner ${owner} not found` };
  }
  if (!Array.isArray(ownerObj.costArea)) ownerObj.costArea = [];

  const returnedIds = [];
  for (const don of returned) {
    don.zone = 'costArea';
    don.attachedTo = null;
    ownerObj.costArea.push(don);
    returnedIds.push(don.instanceId);
  }

  // Update givenDon count
  targetInst.givenDon = targetInst.attachedDons.length;

  return { success: true, moved: toMove, newGivenCount: targetInst.givenDon, returnedDonIds: returnedIds };
}

/**
 * detachDon(gameState, targetInstanceId, count)
 * Alias to returnDonFromCard for semantic clarity.
 */
export function detachDon(gameState, targetInstanceId, count = 1) {
  return returnDonFromCard(gameState, targetInstanceId, count);
}

/**
 * countDonInCostArea(gameState, owner) -> number
 */
export function countDonInCostArea(gameState, owner) {
  if (!gameState || !gameState.players) return 0;
  const p = gameState.players[owner];
  if (!p || !Array.isArray(p.costArea)) return 0;
  return p.costArea.length;
}

/**
 * getAttachedDonIds(gameState, targetInstanceId) -> [ids]
 */
export function getAttachedDonIds(gameState, targetInstanceId) {
  const loc = findInstance(gameState, targetInstanceId);
  if (!loc || !loc.instance) return [];
  const inst = loc.instance;
  ensureAttachedField(inst);
  return inst.attachedDons.map(d => d.instanceId);
}

export default {
  giveDon,
  returnDonFromCard,
  detachDon,
  countDonInCostArea,
  getAttachedDonIds
};
