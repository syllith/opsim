'use strict';
// damageAndLife.js — Damage Processing and Life Management
// =============================================================================
// PURPOSE:
// This module handles all damage-related mechanics and life card management.
// When damage is dealt to a Leader, this module processes life removal,
// [Trigger] ability resolution, and defeat conditions. It also handles
// life manipulation for costs and effects.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Process damage to Leaders (remove life cards)
// - Handle [Trigger] ability resolution when life is removed
// - Manage the "limbo" state while Triggers resolve
// - Check for defeat (no life + damage dealt)
// - Handle life manipulation (add/remove for effects)
// - Support life viewing effects (reveal, look at)

// =============================================================================
// PUBLIC API
// =============================================================================
// dealDamage(gameState, side, count) -> GameState
//   Deals damage to a player's Leader. For each damage:
//   1. Remove top life card
//   2. Reveal the card
//   3. If card has [Trigger], resolve it
//   4. Move card to trash (unless effect says otherwise)
//   5. Check for defeat if life was 0
//
// removeLifeCard(gameState, side, position, reason) -> { newState, card }
//   Removes a life card by position ('top' | 'bottom' | index).
//   Reason: 'damage' | 'cost' | 'effect'
//   Returns the removed card for Trigger processing.
//
// addLifeCard(gameState, side, cardInstance, position) -> GameState
//   Adds a card to life zone.
//   Position: 'top' | 'bottom'
//   Typically from deck (for effects that add life).
//
// getLifeCount(gameState, side) -> number
//   Returns current life count for a player.
//
// revealLifeCards(gameState, side, count) -> { newState, cards }
//   Temporarily reveals top N life cards for viewing.
//   Cards stay in life zone.
//
// processTrigger(gameState, triggerCard) -> GameState
//   Executes a [Trigger] ability from a revealed life card.
//   The card is in "limbo" during resolution.
//   After resolution, card goes to hand (or trash if no trigger taken).
//
// checkDefeat(gameState, side) -> boolean
//   Returns true if the player has been defeated (0 life + damage taken).

// =============================================================================
// TRIGGER FLOW
// =============================================================================
// When damage removes a Life card:
// 1. Remove top card from Life zone
// 2. Card enters "trigger limbo" (not in any zone temporarily)
// 3. Reveal the card to both players
// 4. Check if card has [Trigger] ability
// 5. If [Trigger] exists:
//    a. Owner may choose to activate it (most Triggers are optional)
//    b. If activated, resolve the Trigger ability
//    c. After resolution, card typically goes to hand
// 6. If no [Trigger] or not activated:
//    - Card goes to trash
// 7. Continue with next damage if multiple

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - side: 'player1' | 'player2'
// - count: number of damage/life to process
// - cardInstance: for adding life
//
// OUTPUTS:
// - GameState: updated after life changes
// - Card info for Trigger processing
// - Boolean for defeat check
//
// LIFE ZONE STRUCTURE:
// - Array of CardInstance
// - Index 0 = top of life
// - Cards are typically face-down until revealed

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/dealDamage.js: dealDamage action
// - src/engine/core/battle.js: when Leader loses battle
// - src/engine/actions/moveCard.js: adding to life
// - Cost processing: some costs remove life
//
// DEPENDS ON:
// - src/engine/core/gameState.js: cloneState, getCardInstance
// - src/engine/core/zones.js: zone manipulation
// - src/engine/core/replacement.js: check 'wouldTakeDamage' replacements
// - src/engine/rules/evaluator.js: evaluate Trigger abilities
// - src/engine/actions/interpreter.js: execute Trigger actions
//
// EVENTS EMITTED:
// - 'lifeLost': { side, count, remainingLife }
// - 'triggerActivated': { cardId, side }
// - 'defeat': { side }

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// DEFEAT CONDITION:
// A player is defeated when:
// - They have 0 life AND
// - They take damage (from battle or effect)
// Simply having 0 life doesn't cause defeat; the final damage does.
//
// TRIGGER TIMING:
// [Trigger] abilities activate during damage resolution.
// This is a special timing that interrupts normal flow.
// The player can respond to their own trigger.
// Some triggers are mandatory, some are optional ("You may").
//
// TRIGGER LIMBO:
// While a card is being processed for Trigger:
// - It has left the Life zone
// - It hasn't entered Trash or Hand yet
// - It's "in limbo" or "pending"
// - Effects that check zones won't find it anywhere
// After Trigger resolves, determine final destination.
//
// MULTIPLE DAMAGE:
// When taking multiple damage (e.g., Double Attack = 2):
// - Process one life card at a time
// - Each Trigger resolves before the next damage
// - Defeat check after all damage is processed
//
// DAMAGE VS COST:
// - Damage: Can trigger defeat, activates [Trigger]
// - Cost (remove life): Does NOT trigger defeat, no [Trigger]
// The 'reason' parameter distinguishes these cases.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: dealDamage removes life and moves to trash
//   Input: Player with 5 life, deal 1 damage
//   Expected: 4 life remaining, 1 card in trash
//
// TEST: dealDamage triggers [Trigger] ability
//   Input: Top life card has Trigger, deal damage
//   Expected: Trigger ability resolves, card goes to hand
//
// TEST: defeat when 0 life and damage
//   Input: Player with 1 life, deal 2 damage
//   Expected: checkDefeat returns true after processing
//
// TEST: cost life removal doesn't trigger
//   Input: Remove life as cost (reason='cost')
//   Expected: No Trigger check, card to trash, no defeat
//
// TEST: multiple damage processes sequentially
//   Input: Deal 3 damage
//   Expected: Three separate life cards processed in order
//
// TEST: addLifeCard respects position
//   Input: Add card to 'top' of life
//   Expected: New card is at index 0 of life array

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement getLifeCount
// [ ] 2. Implement removeLifeCard with position handling
// [ ] 3. Implement addLifeCard
// [ ] 4. Implement dealDamage with sequential processing
// [ ] 5. Implement Trigger detection and limbo state
// [ ] 6. Implement processTrigger with ability execution
// [ ] 7. Implement checkDefeat logic
// [ ] 8. Implement revealLifeCards for view effects
// [ ] 9. Integrate with replacement effects
// [ ] 10. Emit appropriate events

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const dealDamage = (gameState, side, count) => {
  // TODO: Process damage, handle triggers, check defeat
  return { success: false, error: 'Not implemented' };
};

export const removeLifeCard = (gameState, side, position = 'top', reason = 'damage') => {
  // TODO: Remove life card, return it
  return { newState: gameState, card: null, error: 'Not implemented' };
};

export const addLifeCard = (gameState, side, cardInstance, position = 'top') => {
  // TODO: Add card to life zone
  return { success: false, error: 'Not implemented' };
};

export const getLifeCount = (gameState, side) => {
  const player = gameState?.[side];
  return player?.life?.length || 0;
};

export const revealLifeCards = (gameState, side, count) => {
  // TODO: Reveal top N life cards
  return { newState: gameState, cards: [], error: 'Not implemented' };
};

export const processTrigger = (gameState, triggerCard) => {
  // TODO: Execute trigger ability
  return { success: false, error: 'Not implemented' };
};

export const checkDefeat = (gameState, side) => {
  // TODO: Check if player is defeated
  return false;
};

export default {
  dealDamage,
  removeLifeCard,
  addLifeCard,
  getLifeCount,
  revealLifeCards,
  processTrigger,
  checkDefeat
};
