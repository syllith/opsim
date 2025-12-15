'use strict';
// playCard.js — Play Card Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionPlayCard action type. It plays cards from
// various zones (hand, life, trash, deck) to the field, handling cost payment,
// [On Play] triggers, and entry state.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Play cards from specified source zone
// - Handle cost payment (or free play)
// - Trigger [On Play] abilities
// - Set entry state (active or rested)
// - Validate play legality (zone capacity, card type)

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes a playCard action.
//   action: {
//     type: 'playCard',
//     sourceZone: 'hand' | 'life' | 'trash' | 'deck',
//     target: TargetSelectorRef,    // Cards to play
//     enterRested?: boolean,        // If true, enters rested
//     payCost?: boolean,            // If false, free play
//     may?: boolean,
//     condition?: Condition
//   }

// =============================================================================
// PLAY VS MOVE
// =============================================================================
// Play: Triggers [On Play] abilities, counts as "playing"
// Move: Just moves card, no [On Play], doesn't count as playing
//
// This distinction matters for:
// - Rush (can attack if played, not if moved)
// - [On Play] triggers
// - Effects that count "cards played"
// - Effects that prevent playing

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionPlayCard object
// - context: { thisCard, activePlayer }
//
// OUTPUTS:
// - ActionResult with updated gameState

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches playCard
// - src/engine/index.js playCard
// - search actions with asPlay=true
//
// DEPENDS ON:
// - src/engine/rules/selector.js: resolve target
// - src/engine/core/zones.js: zone operations
// - src/engine/rules/evaluator.js: trigger [On Play] abilities

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// COST PAYMENT:
// If payCost=true (default):
// - Check if player has enough DON/resources
// - Spend the required DON
// - Card's cost field determines required DON
//
// If payCost=false:
// - Card is played without cost
// - Used for effects like "play a card without paying its cost"
//
// DESTINATION:
// Characters -> characters zone
// Stages -> stage zone
// Events -> trash (after effect resolves)
// Leaders -> cannot be "played" via this action
//
// ON PLAY TIMING:
// After card enters the field:
// 1. Card is now on field
// 2. Check for [On Play] abilities (timing='onPlay')
// 3. Trigger and resolve each ability
//
// ENTER RESTED:
// If enterRested=true, card enters in rested state.
// This prevents immediate attacks even with Rush.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: play character from hand
//   Input: Play 3-cost character, 5 active DON
//   Expected: Character on field, 2 DON remaining
//
// TEST: free play (payCost=false)
//   Input: Play 5-cost card without paying
//   Expected: Card on field, DON unchanged
//
// TEST: On Play triggers
//   Input: Play card with [On Play] ability
//   Expected: Ability triggered after play
//
// TEST: enterRested works
//   Input: Play with enterRested=true
//   Expected: Card enters in rested state
//
// TEST: character zone capacity
//   Input: Try to play 6th character
//   Expected: Play fails (zone full)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Evaluate condition
// [ ] 2. Handle may choice
// [ ] 3. Resolve target in source zone
// [ ] 4. Check zone capacity
// [ ] 5. Handle cost payment if required
// [ ] 6. Move card to appropriate field zone
// [ ] 7. Set state (active/rested)
// [ ] 8. Trigger [On Play] abilities
// [ ] 9. Generate log entry
// [ ] 10. Handle events (resolve then trash)

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full playCard implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
