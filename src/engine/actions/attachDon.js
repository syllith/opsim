'use strict';
/*
 * attachDon.js — Attach DON Action Handler (practical implementation)
 *
 * Supports:
 *  - attachDon from cost area (default, uses donManager.giveDon)
 *  - attachDon from a source card's attachedDons to a target card
 *  - simple `may`/`confirm` flow for optional prompts
 *
 * action shape (supported):
 * {
 *   type: 'attachDon',
 *   target: <instanceId | { instanceId }>,
 *   selector?: { instanceId },   // source card with attachedDons
 *   count?: number,
 *   may?: boolean,
 *   confirm?: boolean,           // if may=true and confirm===false -> do nothing
 *   enterRested?: boolean
 * }
 *
 * Returns: { success, moved, newGivenCount, attachedDonIds, error }
 */
import { findInstance } from '../core/zones.js';
import donManager from '../modifiers/donManager.js';

export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };

  const owner = (context && context.activePlayer) || action.side || 'player';
  const targetRaw = action.target;
  if (!targetRaw) return { success: false, error: 'missing target' };
  const targetInstanceId = (typeof targetRaw === 'string') ? targetRaw : (targetRaw.instanceId || null);
  if (!targetInstanceId) return { success: false, error: 'invalid target' };

  const targetLoc = findInstance(gameState, targetInstanceId);
  if (!targetLoc || !targetLoc.instance) return { success: false, error: 'target not found' };
  // target must be character or leader (or stage)
  if (!['char', 'leader', 'stage', 'attached'].includes(targetLoc.zone)) {
    return { success: false, error: `invalid target zone for attachDon: ${targetLoc.zone}` };
  }
  const targetInst = targetLoc.instance;

  const count = Number.isInteger(action.count) && action.count > 0 ? action.count : 1;

  // Simple may/confirm behavior: if may==true and confirm===false, do nothing and succeed
  if (action.may === true && action.confirm === false) {
    return { success: true, moved: 0, newGivenCount: targetInst.givenDon || 0, attachedDonIds: [] };
  }

  // If no selector -> default to costArea -> use donManager.giveDon
  if (!action.selector) {
    const res = donManager.giveDon(gameState, owner, targetInstanceId, count);
    if (!res || !res.success) {
      return { success: false, error: res && res.error ? res.error : 'giveDon failed' };
    }
    // Optionally rest attached DONs
    if (action.enterRested && Array.isArray(res.attachedDonIds)) {
      for (const id of res.attachedDonIds) {
        const loc = findInstance(gameState, id);
        if (loc && loc.instance) loc.instance.state = 'rested';
      }
    }
    return { success: true, moved: res.moved, newGivenCount: res.newGivenCount, attachedDonIds: res.attachedDonIds || [] };
  }

  // Selector provided: support only selector.instanceId (source card with attachedDons)
  const selector = action.selector;
  if (!selector.instanceId) {
    return { success: false, error: 'unsupported selector (only instanceId supported)' };
  }
  const sourceLoc = findInstance(gameState, selector.instanceId);
  if (!sourceLoc || !sourceLoc.instance) return { success: false, error: 'source not found' };
  const sourceInst = sourceLoc.instance;

  // Ensure source has attachedDons array
  if (!Array.isArray(sourceInst.attachedDons) || sourceInst.attachedDons.length === 0) {
    return { success: true, moved: 0, newGivenCount: targetInst.givenDon || 0, attachedDonIds: [] };
  }

  // Move up to count DONs from sourceInst.attachedDons to targetInst.attachedDons
  const toMove = Math.min(count, sourceInst.attachedDons.length);
  const movedDonIds = [];
  if (!Array.isArray(targetInst.attachedDons)) targetInst.attachedDons = [];
  for (let i = 0; i < toMove; i++) {
    // remove from end (LIFO) or from front? We'll remove from end to preserve order roughly
    const don = sourceInst.attachedDons.pop();
    if (!don) continue;
    // update metadata
    don.zone = 'attached';
    don.attachedTo = targetInst.instanceId;
    // push onto target
    targetInst.attachedDons.push(don);
    movedDonIds.push(don.instanceId);
  }
  // Update givenDon counts
  sourceInst.givenDon = sourceInst.attachedDons.length;
  targetInst.givenDon = targetInst.attachedDons.length;

  // Optionally set rest state
  if (action.enterRested) {
    for (const id of movedDonIds) {
      const loc = findInstance(gameState, id);
      if (loc && loc.instance) loc.instance.state = 'rested';
    }
  }

  return { success: true, moved: movedDonIds.length, newGivenCount: targetInst.givenDon || 0, attachedDonIds: movedDonIds };
};

export default { execute };
