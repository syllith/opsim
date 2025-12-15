'use strict';
/*
 * turnController.js — Minimal Turn Phase helpers (Refresh & DON Phase)
 * =============================================================================
 *
 * PURPOSE
 *  - Implement Refresh Phase and DON!! Phase helpers required by the engine.
 *
 * FUNCTIONS
 *  - refreshPhase(gameState, player)
 *      * Return attached DONs from player's leader & character instances to costArea (rest them)
 *      * Then set all rested cards in leader/char/stage/costArea to active
 *
 *  - donPhase(gameState, player, isFirstPlayer)
 *      * Place 2 DON!! cards from the player's DON deck into their costArea face-up.
 *      * If isFirstPlayer is true, place only 1.
 *
 * NOTES
 *  - These helpers mutate gameState in place.
 *  - They use donManager.returnDonFromCard for returns and zones.moveToZone to move DONs.
 * =============================================================================
 */

import zones from './zones.js';
import donManager from '../modifiers/donManager.js';

const { findInstance, moveToZone } = zones;

/**
 * refreshPhase(gameState, player)
 *
 * Steps:
 * 1. For each card in player's Character area and Leader (if present):
 *    - If it has attachedDons, call donManager.returnDonFromCard(gameState, instanceId, count = attachedDons.length)
 *    - After returnDonFromCard, mark each returned DON's state as 'rested'
 * 2. Set all rested cards placed in player's Leader, Character, Stage, and costArea as active
 *
 * Returns: { success: true, returnedTotal: number, errors: [] }
 */
export function refreshPhase(gameState, player) {
  const result = { success: true, returnedTotal: 0, errors: [] };
  if (!gameState || !gameState.players || !gameState.players[player]) {
    result.success = false;
    result.errors.push('invalid gameState or player');
    return result;
  }

  const p = gameState.players[player];

  // Helper to process a single field instance (leader or each character)
  function returnAttachedFromInstance(instance) {
    if (!instance || !Array.isArray(instance.attachedDons) || instance.attachedDons.length === 0) {
      return 0;
    }
    const count = instance.attachedDons.length;
    try {
      // Use donManager to return all attached DONs
      const ret = donManager.returnDonFromCard(gameState, instance.instanceId, count);
      if (!ret || !ret.success) {
        result.errors.push(`failed to return DONs from ${instance.instanceId}: ${ret ? ret.error : 'unknown'}`);
        return 0;
      }
      // Mark returned DONs as 'rested' in costArea
      const returnedIds = ret.returnedDonIds || ret.returnedDonIds || ret.returnedDonIds || ret.returnedDonIds;
      // ret might use returnedDonIds key; fallback to ret.returnedDonIds or ret.returnedDonIds
      // More robust: check ret.returnedDonIds or ret.returnedDonIds or ret.attachedDonIds
      const ids = (ret.returnedDonIds && Array.isArray(ret.returnedDonIds))
                    ? ret.returnedDonIds
                    : (ret.returnedDonIds && Array.isArray(ret.returnedDonIds)) ? ret.returnedDonIds : (ret.returnedDonIds ? ret.returnedDonIds : []);
      // Simpler: if none, inspect costArea for items with attachedTo null and recently moved — but to avoid complexity, handle both common keys.
      const possibleIds = ret.returnedDonIds || ret.returnedDonIds || ret.attachedDonIds || [];
      for (const id of possibleIds) {
        const loc = findInstance(gameState, id);
        if (loc && loc.instance) {
          loc.instance.state = 'rested';
        }
      }
      // As fallback: if no explicit returned ids, we will rest any DONs in costArea that belong to player and are recently moved.
      // For simplicity, we rely on returnedDonIds being present.
      return ret.moved || count;
    } catch (e) {
      result.errors.push(`exception returning DONs from ${instance.instanceId}: ${String(e)}`);
      return 0;
    }
  }

  // 1) Return from leader
  if (p.leader) {
    result.returnedTotal += returnAttachedFromInstance(p.leader);
  }
  // 2) Return from each character
  if (Array.isArray(p.char)) {
    for (const ch of p.char.slice()) {
      result.returnedTotal += returnAttachedFromInstance(ch);
    }
  }

  // 3) After returns, set all rested cards in leader/char/stage/costArea to active
  const zonesToActivate = [];
  if (p.leader) zonesToActivate.push(p.leader);
  if (p.stage) zonesToActivate.push(p.stage);
  if (Array.isArray(p.char)) zonesToActivate.push(...p.char);
  if (Array.isArray(p.costArea)) zonesToActivate.push(...p.costArea);

  for (const card of zonesToActivate) {
    if (!card) continue;
    if (card.state === 'rested') card.state = 'active';
  }

  return result;
}

/**
 * donPhase(gameState, player, isFirstPlayer=false)
 *
 * Places DONs from the player's donDeck into costArea face-up:
 * - default: place 2 DONs
 * - if isFirstPlayer: place 1 DON
 *
 * Returns: { success: true, placed: number }
 */
export function donPhase(gameState, player, isFirstPlayer = false) {
  if (!gameState || !gameState.players || !gameState.players[player]) {
    return { success: false, error: 'invalid gameState or player' };
  }
  const p = gameState.players[player];
  if (!Array.isArray(p.donDeck)) p.donDeck = [];
  if (!Array.isArray(p.costArea)) p.costArea = [];

  const toPlace = isFirstPlayer ? 1 : 2;
  let placed = 0;
  for (let i = 0; i < toPlace; i++) {
    if (p.donDeck.length === 0) break;
    // Top is index 0
    const topDon = p.donDeck[0];
    if (!topDon) {
      // remove it and continue
      p.donDeck.shift();
      continue;
    }
    // Move using moveToZone so metadata updates correctly
    const res = moveToZone(gameState, topDon.instanceId, player, 'costArea', { top: false });
    if (!res || !res.success) {
      // if cannot move, stop
      break;
    }
    // After move, find the instance in costArea and set faceUp true
    const loc = findInstance(gameState, topDon.instanceId);
    if (loc && loc.instance) {
      loc.instance.faceUp = true;
      // DON placed into costArea should be set as active by refresh logic later; here no extra state
    }
    placed += 1;
  }

  return { success: true, placed };
}

export default {
  refreshPhase,
  donPhase
};
