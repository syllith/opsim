'use strict';
/*
 * playCard.js — Play a card from hand to the field, optionally paying DON cost
 * =============================================================================
 *
 * PURPOSE
 *  - Provide a minimal, well-documented playCard action to:
 *      * Move a card instance from the player's hand onto the Character area or Stage
 *      * Optionally pay the card's cost by resting DONs from the player's costArea
 *
 * API
 *  - playCard(gameState, instanceId, destination, options)
 *
 * Parameters:
 *  - gameState: engine state
 *  - instanceId: id of the card instance to play (must be in hand)
 *  - destination: 'char' | 'stage' (string) OR object { zone: 'char'|'stage', index?, top? }
 *  - options:
 *      - payCost: boolean (default false) -> if true, rest DONs equal to instance.cost
 *      - enterRested: boolean -> set instance.enterRested = true
 *
 * Returns:
 *  - { success: true, from, to, paidCost } or { success: false, error }
 *
 * NOTES / ASSUMPTIONS
 *  - Cost is taken from instance.cost (number). If missing, cost=0.
 *  - DONs are rested in place in the owner's costArea; paying cost sets don.state = 'rested'
 *    for up to `cost` DONs that are not already rested.
 *  - This function mutates gameState (zones.moveToZone is used).
 * =============================================================================
 */

import zones from '../core/zones.js';
const { findInstance, moveToZone } = zones;

/**
 * Normalize destination value.
 * Accepts string -> { zone: string } or object { zone, index, top }
 */
function normalizeDestination(destination) {
  if (!destination) return null;
  if (typeof destination === 'string') return { zone: destination };
  if (typeof destination === 'object') {
    return { zone: destination.zone, index: destination.index, top: !!destination.top };
  }
  return null;
}

/**
 * payDonCost(gameState, owner, cost)
 * Finds up to `cost` active DONs in owner's costArea (don.state !== 'rested') and rests them.
 * Returns { success: boolean, paid: number, restedDonIds: [] }
 */
function payDonCost(gameState, owner, cost) {
  if (!gameState || !gameState.players || !gameState.players[owner]) {
    return { success: false, error: `owner ${owner} not found` };
  }
  if (!Number.isInteger(cost) || cost <= 0) return { success: true, paid: 0, restedDonIds: [] };

  const ownerObj = gameState.players[owner];
  const costArea = ownerObj.costArea || [];

  // Find DONs not already rested (state !== 'rested')
  const available = costArea.filter(d => !d || typeof d !== 'object' ? false : d.state !== 'rested');

  if (available.length < cost) {
    // not enough DONs available
    return { success: false, error: `insufficient DONs in costArea: required ${cost}, available ${available.length}`, paid: 0 };
  }

  // Rest the first `cost` available DONs (by order in costArea)
  let paid = 0;
  const restedIds = [];
  for (let i = 0; i < costArea.length && paid < cost; i++) {
    const don = costArea[i];
    if (don && don.state !== 'rested') {
      don.state = 'rested';
      restedIds.push(don.instanceId);
      paid += 1;
    }
  }

  return { success: true, paid, restedDonIds: restedIds };
}

/**
 * playCard(gameState, instanceId, destination, options)
 */
export function playCard(gameState, instanceId, destination, options = {}) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  // Locate instance and ensure it's in hand
  const loc = findInstance(gameState, instanceId);
  if (!loc || !loc.instance) return { success: false, error: `instance ${instanceId} not found` };
  if (loc.zone !== 'hand') return { success: false, error: `instance ${instanceId} not in hand (found in ${loc.zone})` };

  const owner = loc.owner;
  const inst = loc.instance;

  const dest = normalizeDestination(destination);
  if (!dest || !dest.zone) return { success: false, error: 'invalid destination' };

  // Validate destination zone: only 'char' or 'stage' for now
  const zone = dest.zone;
  if (!['char', 'stage'].includes(zone)) {
    return { success: false, error: `unsupported destination zone: ${zone}` };
  }

  // Pay cost if requested
  const payCost = !!options.payCost;
  let paidCost = 0;
  if (payCost) {
    const cost = typeof inst.cost === 'number' ? inst.cost : 0;
    if (cost > 0) {
      const payRes = payDonCost(gameState, owner, cost);
      if (!payRes.success) {
        return { success: false, error: payRes.error || 'failed to pay cost' };
      }
      paidCost = payRes.paid || 0;
    }
  }

  // Move card to destination
  const moveRes = moveToZone(gameState, instanceId, owner, zone, { index: dest.index, top: dest.top });
  if (!moveRes || !moveRes.success) {
    // If we had paid cost, we do not rollback resting DONs here; callers may handle rollback if required.
    // For a stricter approach, we could un-rest the DONs that were rested above.
    return { success: false, error: moveRes && moveRes.error ? moveRes.error : 'failed to move card' };
  }

  // Set enterRested metadata if requested
  const afterLoc = findInstance(gameState, instanceId);
  if (options.enterRested && afterLoc && afterLoc.instance) {
    afterLoc.instance.enterRested = true;
  }

  return {
    success: true,
    from: moveRes.from,
    to: moveRes.to,
    paidCost
  };
}

export default {
  playCard
};
