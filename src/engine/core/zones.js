'use strict';
// zones.js — Zone Management and Card Movement
// =============================================================================
// PURPOSE:
// This module handles all zone-related operations: moving cards between zones,
// querying zone contents, and enforcing zone rules (e.g., max 5 characters).
// It implements the zone-change identity rule where cards get new instance IDs
// when changing zones.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Move cards between zones with proper identity handling
// - Enforce zone capacity limits (max 5 characters)
// - Handle deck ordering (top/bottom placement)
// - Manage face-up/face-down state for cards
// - Shuffle zones when required
// - Query zone counts and contents

// =============================================================================
// PUBLIC API
// =============================================================================
// moveToZone(gameState, instanceId, targetZone, options) -> { newState, newInstanceId }
//   Moves a card to a new zone. Creates new instance ID (zone-change rule).
//   Options: { position: 'top'|'bottom'|'random', faceUp: boolean, ordering: 'keep'|'chosen' }
//   Returns new state and the card's new instanceId.
//
// addToZone(gameState, side, zone, cardInstance, options) -> GameState
//   Adds an already-created CardInstance to a zone.
//   Used internally after creating new instances.
//
// removeFromZone(gameState, instanceId) -> { newState, removedCard }
//   Removes a card from its current zone.
//   Returns the removed CardInstance for further processing.
//
// getZoneCount(gameState, side, zone) -> number
//   Returns the number of cards in a zone.
//
// getZoneCapacity(zone) -> number | null
//   Returns max capacity for a zone (5 for characters, null for unlimited).
//
// shuffleZone(gameState, side, zone) -> GameState
//   Randomizes the order of cards in a zone (typically deck).
//
// peekTopCards(gameState, side, zone, count) -> CardInstance[]
//   Returns the top N cards of a zone without removing them.
//   Cards remain in zone; useful for search/look effects.
//
// setCardState(gameState, instanceId, state) -> GameState
//   Sets a card's state to 'active' or 'rested'.

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: GameState object
// - instanceId: string identifying the card instance
// - zone names: 'leader' | 'characters' | 'hand' | 'deck' | 'trash' | 'life' | 'donDeck' | 'costArea' | 'stage'
// - side: 'player1' | 'player2'
// - options: positioning and visibility options
//
// OUTPUTS:
// - GameState: new state after zone changes
// - newInstanceId: when zone-change creates new instance
// - CardInstance: for queries
//
// ZONE STRUCTURE:
// - leader: single CardInstance or null
// - stage: single CardInstance or null
// - characters: array of CardInstance (max 5)
// - hand, deck, trash, life, donDeck, costArea: arrays of CardInstance

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/moveCard.js: primary user for card movement
// - src/engine/actions/playCard.js: moving from hand to field
// - src/engine/actions/search.js: deck manipulation
// - src/engine/actions/koAction.js: moving to trash on KO
// - src/engine/core/damageAndLife.js: life card removal
// - src/engine/index.js: drawCards, shuffleFromTrashToDeck
//
// DEPENDS ON:
// - src/engine/core/gameState.js: cloneState, generateInstanceId
// - src/engine/rng/rng.js: for shuffling
// - src/engine/modifiers/continuousEffects.js: clear modifiers on zone change
// - src/engine/modifiers/donManager.js: handle DON detachment on zone change

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// ZONE-CHANGE IDENTITY RULE:
// When a card changes zones, it becomes a "new" card:
// 1. Generate new instanceId
// 2. Clear all attached DON (DON returns to owner's cost area)
// 3. Clear all continuous effects/modifiers
// 4. Clear keyword grants/revokes
// Exception: Some effects explicitly say "even if this card leaves play"
//
// DECK ORDERING:
// - Index 0 = top of deck
// - 'top' placement: unshift to array
// - 'bottom' placement: push to array
// - For multiple cards, respect the 'ordering' option
//
// CHARACTER ZONE LIMIT:
// - Max 5 characters per player
// - If at 5 and trying to add, the add fails (should be prevented by UI)
// - Check capacity before allowing play/move to character zone
//
// FACE-UP/FACE-DOWN:
// - Life cards are typically face-down until revealed
// - Hand cards are face-down to opponent but known to owner
// - Field cards are always face-up
// - Deck cards are face-down
// - Trash cards are face-up
//
// SHUFFLE IMPLEMENTATION:
// Use Fisher-Yates shuffle with the seeded RNG to ensure
// deterministic results for replay support.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: moveToZone creates new instanceId
//   Input: Move character from field to hand
//   Expected: Card in hand has different instanceId than it had on field
//
// TEST: moveToZone clears modifiers
//   Input: Character with +2000 power modifier moved to trash
//   Expected: Modifier not present on new instance (and modifier cleaned up)
//
// TEST: character zone enforces limit
//   Input: Try to add 6th character to characters zone
//   Expected: Returns error or false, state unchanged
//
// TEST: deck top/bottom placement
//   Input: Move card to 'top' of deck, then peek top 1
//   Expected: Peeked card matches moved card
//
// TEST: shuffleZone randomizes order
//   Input: Deck with known order, shuffle with seed
//   Expected: Order changed; same seed produces same result
//
// TEST: setCardState changes active/rested
//   Input: Active character, setCardState to 'rested'
//   Expected: Card's state property is 'rested'

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement removeFromZone with zone detection
// [ ] 2. Implement addToZone with capacity checks
// [ ] 3. Implement moveToZone combining remove + add + identity
// [ ] 4. Implement shuffleZone with seeded RNG
// [ ] 5. Implement peekTopCards for search effects
// [ ] 6. Implement setCardState
// [ ] 7. Handle DON detachment on zone change
// [ ] 8. Clear modifiers on zone change
// [ ] 9. Add position handling (top/bottom/random)
// [ ] 10. Add validation and error handling

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const moveToZone = (gameState, instanceId, targetZone, options = {}) => {
  // TODO: Move card with zone-change identity rule
  return { newState: gameState, newInstanceId: null, error: 'Not implemented' };
};

export const addToZone = (gameState, side, zone, cardInstance, options = {}) => {
  // TODO: Add card instance to zone
  return { success: false, error: 'Not implemented' };
};

export const removeFromZone = (gameState, instanceId) => {
  // TODO: Remove card from its current zone
  return { newState: gameState, removedCard: null, error: 'Not implemented' };
};

export const getZoneCount = (gameState, side, zone) => {
  // TODO: Count cards in zone
  return 0;
};

export const getZoneCapacity = (zone) => {
  // Characters: 5, others: unlimited
  if (zone === 'characters') return 5;
  return null;
};

export const shuffleZone = (gameState, side, zone) => {
  // TODO: Shuffle zone using seeded RNG
  return gameState;
};

export const peekTopCards = (gameState, side, zone, count) => {
  // TODO: Return top N cards without removing
  return [];
};

export const setCardState = (gameState, instanceId, state) => {
  // TODO: Set card to active or rested
  return gameState;
};

export default {
  moveToZone,
  addToZone,
  removeFromZone,
  getZoneCount,
  getZoneCapacity,
  shuffleZone,
  peekTopCards,
  setCardState
};
