'use strict';
/*
 * returnDon.js — Return DON Action Handler
 *
 * Behavior:
 *  - action: {
 *      type: 'returnDon',
 *      count?: number,                    // default 1
 *      selector?: { instanceId },         // if provided, return from that card's attachedDons first
 *      may?: boolean,
 *      confirm?: boolean,                 // if may && confirm===false -> no-op
 *      side?: 'player'|'opponent'         // optional, default context.activePlayer
 *    }
 *
 *  - Default source is owner's costArea.
 *  - Returns DONs to owner's donDeck (pushed to bottom).
 *
 * Notes:
 *  - Uses donManager.returnDonFromCard for source-card returns (which moves DONs to costArea).
 *  - Moves DONs from costArea into donDeck using zones.addToZone for correct metadata.
 */

import zones from '../core/zones.js';
import donManager from '../modifiers/donManager.js';

const { findInstance, addToZone } = zones;

export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action || action.type !== 'returnDon') return { success: false, error: 'invalid action' };

  const owner = action.side || (context && context.activePlayer) || 'player';
  const count = Number.isInteger(action.count) && action.count > 0 ? action.count : 1;

  // may/confirm: if may and confirm === false, do nothing
  if (action.may === true && action.confirm === false) {
    return { success: true, moved: 0 };
  }

  // Ensure player's structures exist
  if (!gameState.players || !gameState.players[owner]) {
    return { success: false, error: `owner ${owner} not found` };
  }
  const p = gameState.players[owner];
  if (!Array.isArray(p.costArea)) p.costArea = [];
  if (!Array.isArray(p.donDeck)) p.donDeck = [];

  let movedTotal = 0;

  try {
    // If selector provided and points to an instanceId, first return from that card's attached DONs to costArea
    if (action.selector && action.selector.instanceId) {
      // Use donManager to return from card to costArea
      // The donManager.returnDonFromCard will return DONs from attached and put into costArea
      const ret = donManager.returnDonFromCard(gameState, action.selector.instanceId, count);
      if (!ret || !ret.success) {
        // If failure, return what we have so far
        return { success: false, error: ret && ret.error ? ret.error : 'failed to return from source' };
      }
      // After this, the returned DONs are in costArea; proceed to move them into donDeck below
    }

    // Now move up to `count` DONs from owner's costArea to owner's donDeck
    // If selector case returned some DONs to costArea, they are available now.
    // We choose to remove from the front of costArea (index 0) up to count.
    let avail = Array.isArray(p.costArea) ? p.costArea.length : 0;
    if (avail === 0) {
      return { success: true, moved: 0 };
    }
    const toMove = Math.min(count, avail);

    const movedIds = [];
    for (let i = 0; i < toMove; i++) {
      // Remove the topmost costArea DON (index 0)
      const don = p.costArea.shift();
      if (!don) continue;
      // Add to owner's donDeck (push to bottom)
      const addRes = addToZone(gameState, owner, 'donDeck', don);
      if (!addRes || !addRes.success) {
        // rollback: put don back to costArea at front
        p.costArea.unshift(don);
        break;
      }
      movedTotal += 1;
      movedIds.push(don.instanceId);
    }

    return { success: true, moved: movedTotal, movedIds };
  } catch (e) {
    return { success: false, error: String(e) };
  }
};

export default { execute };
