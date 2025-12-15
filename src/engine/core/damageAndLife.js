'use strict';
/*
 * damageAndLife.js — Damage processing & Life handling
 * =============================================================================
 *
 * PURPOSE
 *  - Provide core utilities for dealing damage to Leaders (via Life).
 *  - Implement the "damage processing" rule: move top Life cards to hand
 *    (allowing [Trigger] behavior in the future) and mark defeat if Leader
 *    takes damage when Life count == 0.
 *
 * KEY FUNCTIONS
 *  - dealDamageToLeader(gameState, side, count)
 *
 * NOTES / ASSUMPTIONS
 *  - side is 'player' or 'opponent' (the player whose leader is taking damage)
 *  - A Life card is represented as a CardInstance stored in gameState.players[side].life array.
 *    We treat index 0 as the "top of Life" for removal (consistent with earlier helpers).
 *  - When a Life card is removed from Life and added to the player's hand, if that Life card
 *    has a `hasTrigger` boolean property (developer-set), we set a marker `canActivateTrigger=true`
 *    on the returned object so future Trigger handling can inspect it. We do not resolve triggers here.
 *  - If side has 0 Life cards when damage is to be dealt, we set `gameState.defeat = { loser: side }`.
 *    This is a simplified defeat marker used by rule processing elsewhere.
 *  - This function mutates gameState in place.
 *
 * TODO
 *  - Implement replacement effects and trigger interrupts (suspend damage processing while Trigger resolves).
 *  - Wire defeat to rule-processing system instead of setting a raw field.
 * =============================================================================
 */

/**
 * Helper: popTopLife(gameState, side)
 * Removes and returns the top Life card for the side (or null if none).
 * We use index 0 as top-of-life.
 */
export function popTopLife(gameState, side) {
  if (!gameState || !gameState.players || !gameState.players[side]) return null;
  const p = gameState.players[side];
  if (!Array.isArray(p.life) || p.life.length === 0) return null;
  const top = p.life.shift(); // remove first element as top
  // Ensure zone metadata
  if (top) {
    top.zone = 'hand'; // we'll move it to hand
  }
  return top;
}

/**
 * addCardToHand(gameState, side, cardInstance)
 * Adds the card instance to the specified side's hand.
 */
export function addCardToHand(gameState, side, cardInstance) {
  if (!gameState || !gameState.players || !gameState.players[side]) return false;
  const p = gameState.players[side];
  if (!Array.isArray(p.hand)) p.hand = [];
  // Add to hand (bottom) — push
  p.hand.push(cardInstance);
  // Update zone metadata
  if (cardInstance) cardInstance.zone = 'hand';
  return true;
}

/**
 * dealDamageToLeader(gameState, side, count)
 *
 * Process damage to the leader of 'side' by repeating the life-removal process
 * count times. If at the moment of dealing a damage point the side has 0 Life
 * cards, set gameState.defeat = { loser: side } and return.
 *
 * Returns:
 *  { success: true, moved: n, triggers: [ { instanceId, canActivateTrigger } ], defeat?: { loser } }
 */
export function dealDamageToLeader(gameState, side, count = 1) {
  if (!gameState || !gameState.players || !gameState.players[side]) {
    return { success: false, error: 'invalid gameState or side' };
  }
  if (!Number.isInteger(count) || count <= 0) {
    return { success: false, error: 'count must be positive integer' };
  }

  const result = {
    success: true,
    moved: 0,
    triggers: []
  };

  for (let i = 0; i < count; i++) {
    const p = gameState.players[side];

    // If the player currently has 0 Life cards -> defeat condition
    const lifeCount = Array.isArray(p.life) ? p.life.length : 0;
    if (lifeCount === 0) {
      // Defeat condition - set a simple flag on the gameState
      gameState.defeat = gameState.defeat || {};
      gameState.defeat.loser = side;
      result.defeat = { loser: side };
      result.success = true;
      // According to rules, the player meets defeat condition when their leader takes damage
      // while having 0 life. We stop further damage processing here.
      break;
    }

    // Otherwise, move top life card to hand
    const lifeCard = popTopLife(gameState, side);
    if (!lifeCard) {
      // unexpected; treat as no-op but count as moved 0
      continue;
    }

    // If the life card has a trigger property, mark it in the result
    const triggerInfo = {
      instanceId: lifeCard.instanceId,
      canActivateTrigger: !!lifeCard.hasTrigger
    };

    // Add to hand
    addCardToHand(gameState, side, lifeCard);

    result.moved += 1;
    result.triggers.push(triggerInfo);
  }

  return result;
}

export default {
  popTopLife,
  addCardToHand,
  dealDamageToLeader
};
