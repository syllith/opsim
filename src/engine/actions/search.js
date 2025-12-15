'use strict';
/*
 * search.js — Simple search action for card movement
 * =============================================================================
 *
 * PURPOSE
 *  - A conservative, useful Search action implementation that supports searching
 *    for a card by printed cardId in a source zone (deck/trash/hand) for a
 *    specified player and moving it to a destination zone (hand/topOfDeck/...)
 *
 * API
 *  - search(gameState, action, context)
 *
 * action shape (simple):
 *  {
 *    type: 'search',
 *    sourceZone: 'deck'|'trash'|'hand',
 *    cardId: 'OP01-001',
 *    side: 'player'|'opponent', // whose zone to search
 *    addTo: 'hand'|'topOfDeck'|'bottomOfDeck'|'stage'|'characterArea'|'leaderArea'|'trash',
 *    reveal: boolean, // currently unused
 *    asPlay: boolean, // currently unused
 *  }
 *
 * NOTES
 *  - This implementation is intentionally simple: it finds the first matching
 *    instance with matching cardId in the specified player's sourceZone and
 *    moves it to the requested destination, returning a result object.
 *  - Does not implement ordering choices, topCount, or multi-card searches.
 *  - Uses the zones module to remove/add instances where possible.
 * =============================================================================
 */

import zones from '../core/zones.js';
const { findInstance, removeInstance, addToZone } = zones;

/**
 * findCardInZone(gameState, side, zone, cardId)
 * Returns a matching instance object (not the zone wrapper) or null.
 */
function findCardInZone(gameState, side, zone, cardId) {
  if (!gameState || !gameState.players || !gameState.players[side]) return null;
  const p = gameState.players[side];

  // single-slot zones
  if (zone === 'leader') {
    if (p.leader && p.leader.cardId === cardId) return p.leader;
    return null;
  }
  if (zone === 'stage') {
    if (p.stage && p.stage.cardId === cardId) return p.stage;
    return null;
  }

  // array zones (deck, trash, hand, donDeck, char, costArea, life)
  const arr = p[zone];
  if (!Array.isArray(arr)) return null;
  for (let i = 0; i < arr.length; i++) {
    const inst = arr[i];
    if (inst && inst.cardId === cardId) return inst;
  }
  return null;
}

/**
 * moveInstanceToDestination(gameState, inst, side, addTo)
 */
function moveInstanceToDestination(gameState, inst, side, addTo) {
  if (!inst) return { success: false, error: 'no instance' };
  // If destination is hand/topOfDeck/bottomOfDeck/characterArea/stage/leaderArea/trash
  switch (addTo) {
    case 'hand':
      return addToZone(gameState, side, 'hand', inst);
    case 'topOfDeck':
      return addToZone(gameState, side, 'deck', inst, { index: 0 });
    case 'bottomOfDeck':
      return addToZone(gameState, side, 'deck', inst, { index: undefined }); // push
    case 'stage':
      return addToZone(gameState, side, 'stage', inst);
    case 'characterArea':
    case 'char':
      return addToZone(gameState, side, 'char', inst);
    case 'leaderArea':
    case 'leader':
      return addToZone(gameState, side, 'leader', inst);
    case 'trash':
      return addToZone(gameState, side, 'trash', inst);
    default:
      return { success: false, error: `unsupported addTo ${addTo}` };
  }
}

/**
 * search(gameState, action, context)
 * action: see top-level doc
 */
export function search(gameState, action = {}, context = {}) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  const side = action.side || 'player';
  const sourceZone = action.sourceZone;
  const cardId = action.cardId;
  const addTo = action.addTo || 'hand';

  if (!sourceZone) return { success: false, error: 'sourceZone required' };
  if (!cardId) return { success: false, error: 'cardId required' };

  // Find the instance in the specified zone
  const inst = findCardInZone(gameState, side, sourceZone, cardId);
  if (!inst) {
    return { success: false, error: 'card not found in sourceZone' };
  }

  // Remove it from its current zone using removeInstance (findInstance will locate it anywhere)
  const removed = removeInstance(gameState, inst.instanceId);
  if (!removed) {
    return { success: false, error: 'failed to remove instance from sourceZone' };
  }

  // Now add to destination
  const addResult = moveInstanceToDestination(gameState, removed, side, addTo);
  if (!addResult || !addResult.success) {
    // Rollback: put back to sourceZone at bottom (best-effort)
    addToZone(gameState, side, sourceZone, removed);
    return { success: false, error: `failed to add to destination: ${addResult && addResult.error}` };
  }

  return { success: true, movedInstanceId: removed.instanceId, from: sourceZone, to: addTo };
}

export default { search };
