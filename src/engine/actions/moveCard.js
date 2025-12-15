'use strict';
// moveCard.js — Card Movement Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionMoveCard action type. It moves cards between
// zones, handling zone-change identity rules, position selection, and face
// visibility.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Move cards from current zone to destination
// - Handle zone-change identity (new instance ID)
// - Respect ordering options (top, bottom, chosen)
// - Handle face-up/face-down visibility
// - Handle enterRested for field destinations
// - Clear modifiers and DON on zone change

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes a moveCard action.
//   action: {
//     type: 'moveCard',
//     target: TargetSelectorRef,      // Cards to move
//     destination: string,            // Where to move
//     ordering?: 'keep'|'chosen'|'random',
//     faceUp?: boolean,
//     enterRested?: boolean,
//     may?: boolean,
//     condition?: Condition
//   }

// =============================================================================
// DESTINATIONS (from schema.json)
// =============================================================================
// - 'hand': Owner's hand
// - 'topOfDeck': Top of owner's deck
// - 'bottomOfDeck': Bottom of owner's deck
// - 'topOrBottomOfDeck': Player chooses top or bottom
// - 'trash': Owner's trash
// - 'stage': Owner's stage zone
// - 'characterArea': Owner's character zone
// - 'leaderArea': Owner's leader zone
// - 'costArea': Owner's DON cost area
// - 'life': Owner's life zone
// - 'topOfLife': Top of life
// - 'bottomOfLife': Bottom of life
// - 'topOrBottomOfLife': Player chooses

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionMoveCard object
// - context: { thisCard, activePlayer, boundVars }
//
// OUTPUTS:
// - ActionResult with updated gameState
//
// SIDE EFFECTS:
// - Source zone loses card
// - Destination zone gains card (new instance)
// - Old modifiers/DON cleared

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches moveCard actions
// - Many other actions that involve moving cards
//
// DEPENDS ON:
// - src/engine/core/zones.js: moveToZone, addToZone, removeFromZone
// - src/engine/rules/selector.js: resolve targets
// - src/engine/modifiers/continuousEffects.js: clear modifiers
// - src/engine/modifiers/donManager.js: detach DON

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// ZONE-CHANGE IDENTITY:
// Moving a card to a new zone creates a NEW instance.
// The old instanceId becomes invalid.
// All modifiers, DON attachments, and effects are cleared.
// Exception: Some effects say "even if this card changes zones."
//
// ORDERING OPTIONS:
// - 'keep': Maintain relative order of cards (for multiple cards)
// - 'chosen': Let the player arrange the order
// - 'random': Randomize order (use seeded RNG)
// For single card moves, ordering doesn't matter.
//
// TOP/BOTTOM OF DECK:
// - topOfDeck: Insert at index 0
// - bottomOfDeck: Append at end
// - topOrBottomOfDeck: Ask player to choose
//
// FACE VISIBILITY:
// - Default depends on destination zone
// - Hand: face-down to opponent, face-up to owner
// - Deck: face-down
// - Life: face-down (unless explicitly face-up)
// - Field zones: face-up
// - faceUp option can override defaults
//
// ENTER RESTED:
// When moving to field zones (characterArea, stage, etc.):
// - By default, cards enter active
// - If enterRested=true, cards enter rested
// - This is separate from "play" (moveCard doesn't trigger On Play)

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: move character to hand
//   Input: Character on field, destination='hand'
//   Expected: Character removed from field, new instance in hand
//
// TEST: move to top of deck
//   Input: destination='topOfDeck'
//   Expected: Card is at index 0 of deck
//
// TEST: player chooses top or bottom
//   Input: destination='topOrBottomOfDeck'
//   Expected: UI callback for choice, card placed accordingly
//
// TEST: enterRested works
//   Input: destination='characterArea', enterRested=true
//   Expected: Card in characters zone with state='rested'
//
// TEST: DON detached on move
//   Input: Character with 2 DON attached, move to hand
//   Expected: 2 DON back in cost area, character in hand
//
// TEST: modifiers cleared on move
//   Input: Character with +2000 power, move to trash
//   Expected: No modifier on new instance (or associated effect cleaned up)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Resolve target selector
// [ ] 2. Handle may choice
// [ ] 3. Evaluate condition
// [ ] 4. Handle ordering for multiple cards
// [ ] 5. Handle player choice destinations (topOrBottom)
// [ ] 6. Detach DON before moving
// [ ] 7. Clear modifiers on zone change
// [ ] 8. Call zones.js moveToZone
// [ ] 9. Apply enterRested if specified
// [ ] 10. Generate log entries

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full moveCard implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
