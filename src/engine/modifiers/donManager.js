'use strict';
// donManager.js — DON!! Attachment Management
// =============================================================================
// PURPOSE:
// This module manages DON!! card attachments to leaders and characters. It
// tracks which DON are attached to which cards and handles the power bonus
// calculation that DON provides.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Track DON attachments on cards
// - Calculate DON power bonus
// - Handle DON attachment/detachment
// - Return DON to cost area during refresh
// - Validate DON operations

// =============================================================================
// PUBLIC API
// =============================================================================
// attachDon(gameState, donInstanceId, targetInstanceId) -> GameState
//   Attaches a DON card to a leader/character.
//
// detachDon(gameState, donInstanceId) -> GameState
//   Detaches a DON from its current card, returning to cost area.
//
// detachAllDon(gameState, targetInstanceId) -> GameState
//   Detaches all DON from a card (e.g., on zone change).
//
// getAttachedDon(gameState, instanceId) -> CardInstance[]
//   Returns all DON attached to a card.
//
// getAttachedDonCount(gameState, instanceId) -> number
//   Returns count of DON attached to a card.
//
// getDonPowerBonus(gameState, instanceId) -> number
//   Returns the power bonus from DON (+1000 per DON during owner's turn).
//
// returnAllDonToCostArea(gameState, side) -> GameState
//   Returns all DON attached to a player's cards back to cost area.
//   Called during Refresh Phase.

// =============================================================================
// DON!! RULES
// =============================================================================
// - DON can be attached to Leader or Characters
// - Each DON attached gives +1000 power DURING OWNER'S TURN
// - DON bonus does NOT apply during opponent's turn
// - During Refresh Phase, all attached DON returns to Cost Area (rested)
// - DON returned by refresh becomes rested, not active
// - DON can also be returned to DON Deck (for costs or effects)

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - donInstanceId: DON card being moved
// - targetInstanceId: card receiving DON
// - instanceId: card being queried
// - side: 'player1' | 'player2' for refresh
//
// OUTPUTS:
// - GameState with updated DON attachments
// - CardInstance[] for DON queries
// - number for counts and bonus
//
// STORAGE:
// DON attachments stored in CardInstance.attachedDon: CardInstance[]

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/giveDon.js: attaching DON
// - src/engine/actions/attachDon.js: moving DON between cards
// - src/engine/actions/returnDon.js: returning DON to deck
// - src/engine/core/zones.js: detaching on zone change
// - src/engine/core/turnController.js: refresh phase return
// - src/engine/modifiers/continuousEffects.js: includes DON in power calc
//
// DEPENDS ON:
// - src/engine/core/gameState.js: card instance access, cloneState

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// POWER BONUS TIMING:
// The +1000 per DON only applies during the owner's turn.
// During opponent's turn, DON gives NO power bonus.
// This is critical for battle calculations.
//
// Example:
// - Your turn: Character with 5000 power + 2 DON = 7000 power
// - Opponent's turn: Same character = 5000 power (DON bonus inactive)
//
// ATTACHMENT STORAGE:
// Each CardInstance has attachedDon: CardInstance[]
// The DON cards themselves are CardInstance objects.
// When attached, DON is not in any zone (neither costArea nor donDeck).
//
// REFRESH PHASE HANDLING:
// 1. For each card with attached DON
// 2. Move each DON to owner's costArea
// 3. Set each DON to rested state
//
// ZONE CHANGE DETACHMENT:
// When a card leaves the field (to hand, trash, etc.):
// 1. Detach all DON from that card
// 2. Return DON to owner's costArea (rested)
// 3. Then move the card itself

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: attachDon adds to attachedDon
//   Input: Attach DON to character
//   Expected: Character.attachedDon includes the DON
//
// TEST: getAttachedDonCount works
//   Input: Character with 3 DON
//   Expected: getAttachedDonCount returns 3
//
// TEST: getDonPowerBonus during owner's turn
//   Input: 2 DON attached, owner's turn
//   Expected: 2000 bonus
//
// TEST: getDonPowerBonus during opponent's turn
//   Input: 2 DON attached, opponent's turn
//   Expected: 0 bonus (DON inactive)
//
// TEST: detachAllDon clears attachments
//   Input: Character with 3 DON
//   Expected: Character.attachedDon is empty, DON in costArea
//
// TEST: returnAllDonToCostArea during refresh
//   Input: 3 cards with total 5 DON
//   Expected: All 5 DON in costArea, rested

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement attachDon
// [ ] 2. Implement detachDon
// [ ] 3. Implement detachAllDon
// [ ] 4. Implement getAttachedDon
// [ ] 5. Implement getAttachedDonCount
// [ ] 6. Implement getDonPowerBonus with turn checking
// [ ] 7. Implement returnAllDonToCostArea for refresh
// [ ] 8. Handle DON state (rested after return)
// [ ] 9. Validate attachment targets (leader/character only)
// [ ] 10. Add logging for DON movements

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const attachDon = (gameState, donInstanceId, targetInstanceId) => {
  // TODO: Attach DON to target
  return gameState;
};

export const detachDon = (gameState, donInstanceId) => {
  // TODO: Detach specific DON
  return gameState;
};

export const detachAllDon = (gameState, targetInstanceId) => {
  // TODO: Detach all DON from target
  return gameState;
};

export const getAttachedDon = (gameState, instanceId) => {
  // TODO: Return attached DON array
  return [];
};

export const getAttachedDonCount = (gameState, instanceId) => {
  // TODO: Return DON count
  return 0;
};

export const getDonPowerBonus = (gameState, instanceId) => {
  // TODO: Calculate DON bonus (0 if not owner's turn)
  return 0;
};

export const returnAllDonToCostArea = (gameState, side) => {
  // TODO: Return all DON to cost area (refresh)
  return gameState;
};

export default {
  attachDon,
  detachDon,
  detachAllDon,
  getAttachedDon,
  getAttachedDonCount,
  getDonPowerBonus,
  returnAllDonToCostArea
};
