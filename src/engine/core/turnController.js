'use strict';
/*
 * turnController.js — Minimal Turn Phase helpers (Refresh, DON, Draw, startTurn)
 * =============================================================================
 *
 * PURPOSE
 *  - Implement Refresh Phase, DON Phase, Draw Phase and a startTurn orchestrator.
 *
 * NOTES
 *  - drawPhase sets gameState.defeat.loser on deck-out.
 *  - startTurn returns success:true even when draw-phase produces a defeat marker;
 *    defeat information is returned under out.defeat.
 * =============================================================================
 */

import zones from './zones.js';
import donManager from '../modifiers/donManager.js';
import { findInstance } from './zones.js';

const { moveToZone: _moveToZone } = zones;

/* --------------------------
   Refresh Phase
   -------------------------- */

function ensureAttachedField(targetInstance) {
  if (!targetInstance.attachedDons) targetInstance.attachedDons = [];
  if (typeof targetInstance.givenDon !== 'number') targetInstance.givenDon = 0;
}

export function refreshPhase(gameState, player) {
  const result = { success: true, returnedTotal: 0, errors: [] };
  if (!gameState || !gameState.players || !gameState.players[player]) {
    result.success = false;
    result.errors.push('invalid gameState or player');
    return result;
  }

  const p = gameState.players[player];

  function returnAttachedFromInstance(instance) {
    if (!instance || !Array.isArray(instance.attachedDons) || instance.attachedDons.length === 0) {
      return 0;
    }
    const count = instance.attachedDons.length;
    try {
      const ret = donManager.returnDonFromCard(gameState, instance.instanceId, count);
      if (!ret || !ret.success) {
        result.errors.push(`failed to return DONs from ${instance.instanceId}: ${ret ? ret.error : 'unknown'}`);
        return 0;
      }
      const possibleIds = ret.returnedDonIds || ret.returnedDonIds || ret.attachedDonIds || ret.returnedDonIds || [];
      for (const id of possibleIds) {
        const loc = findInstance(gameState, id);
        if (loc && loc.instance) {
          loc.instance.state = 'rested';
        }
      }
      // If we couldn't get explicit returned ids, as a fallback rest all costArea DONs
      if ((possibleIds || []).length === 0) {
        const costArea = p.costArea || [];
        for (const d of costArea) {
          if (d && d.state !== 'active') {
            d.state = 'rested';
          }
        }
      }
      return ret.moved || count;
    } catch (e) {
      result.errors.push(`exception returning DONs from ${instance.instanceId}: ${String(e)}`);
      return 0;
    }
  }

  // Return from leader
  if (p.leader) {
    result.returnedTotal += returnAttachedFromInstance(p.leader);
  }
  // Return from each character
  if (Array.isArray(p.char)) {
    for (const ch of p.char.slice()) {
      result.returnedTotal += returnAttachedFromInstance(ch);
    }
  }

  // Set rested cards in leader/char/stage/costArea to active
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

/* --------------------------
   DON Phase
   -------------------------- */

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
    const topDon = p.donDeck[0];
    if (!topDon) {
      p.donDeck.shift();
      continue;
    }
    const res = _moveToZone(gameState, topDon.instanceId, player, 'costArea', { top: false });
    if (!res || !res.success) {
      break;
    }
    const loc = findInstance(gameState, topDon.instanceId);
    if (loc && loc.instance) {
      loc.instance.faceUp = true;
    }
    placed += 1;
  }

  return { success: true, placed };
}

/* --------------------------
   DRAW Phase
   -------------------------- */

export function drawPhase(gameState, player, options = {}) {
  const { count = 1, isFirstTurn = false, skipOnFirstTurn = true } = options;
  const result = { success: true, drawn: 0 };

  if (!gameState || !gameState.players || !gameState.players[player]) {
    result.success = false;
    result.error = 'invalid gameState or player';
    return result;
  }

  // Skip draw on first turn if requested
  if (isFirstTurn && skipOnFirstTurn) {
    return result;
  }

  const p = gameState.players[player];
  if (!Array.isArray(p.deck)) p.deck = [];
  if (!Array.isArray(p.hand)) p.hand = [];

  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0) {
      // Deck-out: set defeat marker but do not mark result.success false
      gameState.defeat = gameState.defeat || {};
      gameState.defeat.loser = player;
      result.defeat = { loser: player };
      result.success = true;
      break;
    }
    const card = p.deck.shift(); // top of deck
    p.hand.push(card);
    if (card) card.zone = 'hand';
    result.drawn += 1;
  }

  return result;
}

/* --------------------------
   START TURN
   -------------------------- */

export function startTurn(gameState, player, options = {}) {
  const { isFirstTurn = false, isFirstPlayer = false } = options;
  const out = { success: true, refresh: null, draw: null, don: null, phase: null, turnNumber: null, errors: [], defeat: null };

  if (!gameState || !gameState.players || !gameState.players[player]) {
    out.success = false;
    out.errors.push('invalid gameState or player');
    return out;
  }

  // Set current turn player and increment turnNumber appropriately
  gameState.turnPlayer = player;
  if (typeof gameState.turnNumber !== 'number') gameState.turnNumber = 1;
  else if (!isFirstTurn) {
    gameState.turnNumber += 1;
  }
  out.turnNumber = gameState.turnNumber;

  // Refresh Phase
  try {
    out.refresh = refreshPhase(gameState, player);
    if (!out.refresh.success) out.errors.push(...(out.refresh.errors || []));
  } catch (e) {
    out.errors.push(`refreshPhase error: ${String(e)}`);
  }

  // Draw Phase
  try {
    const draw = drawPhase(gameState, player, { count: 1, isFirstTurn, skipOnFirstTurn: true });
    out.draw = draw;
    if (draw && draw.defeat) {
      // Propagate defeat info but do not treat as an error
      out.defeat = draw.defeat;
    }
  } catch (e) {
    out.errors.push(`drawPhase error: ${String(e)}`);
  }

  // DON Phase
  try {
    const don = donPhase(gameState, player, isFirstTurn && isFirstPlayer);
    out.don = don;
  } catch (e) {
    out.errors.push(`donPhase error: ${String(e)}`);
  }

  // Set phase to Main
  gameState.phase = 'Main';
  out.phase = 'Main';

  if (out.errors.length > 0) out.success = false;
  return out;
}

/* Default export */
export default {
  refreshPhase,
  donPhase,
  drawPhase,
  startTurn
};
