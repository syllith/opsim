'use strict';
// giveDon.js — Give DON Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionGiveDon action type. It moves DON!! cards from
// the active player's cost area to attach to characters or leaders on the
// field, providing the +1000 power bonus per DON during the owner's turn.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Move DON from cost area to target cards
// - Verify DON availability and state requirements
// - Handle DON state after giving (enterRested option)
// - Track DON attachments on cards
// - Verify target is valid (leader or character on field)

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes a giveDon action.
//   action: {
//     type: 'giveDon',
//     count: number,               // How many DON to give
//     enterRested?: boolean,       // DON enters rested after attach
//     side?: TargetSide,           // Whose cards can receive
//     target?: TargetSelectorRef,  // Which cards receive DON
//     may?: boolean,
//     condition?: Condition,
//     sourceDonState?: 'active'|'rested'|'any'  // Required state of DON to give
//   }

// =============================================================================
// DON!! RULES
// =============================================================================
// - DON are placed in cost area at start of turn
// - Active DON can be spent for costs or given to cards
// - When attached to a card, DON gives +1000 power during owner's turn
// - DON attached to cards returns to cost area during Refresh Phase
// - DON can be rested when given (sourceDonState option)
// - By default, only active DON can be given (sourceDonState='active')

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionGiveDon object
// - context: { thisCard, activePlayer, boundVars }
//
// OUTPUTS:
// - ActionResult with updated gameState
//
// STATE CHANGES:
// - DON removed from cost area
// - DON added to target card's attachedDon array

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches giveDon actions
// - src/engine/index.js moveDonFromCostToCard
//
// DEPENDS ON:
// - src/engine/rules/selector.js: resolve target
// - src/engine/core/gameState.js: cloneState
// - src/engine/modifiers/donManager.js: DON tracking utilities

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// SOURCE DON STATE:
// - 'active' (default): Only take active DON from cost area
// - 'rested': Only take rested DON (unusual)
// - 'any': Can use either state
//
// ENTER RESTED:
// - If enterRested=true, the DON card is set to rested after attachment
// - This is unusual; normally attached DON remains active
// - Mainly used for special card effects
//
// TARGET VALIDATION:
// - Target must be leader or character
// - Target must be on the field (not in hand, deck, etc.)
// - Target must belong to the side specified (or default to self)
//
// DISTRIBUTION:
// If target selector matches multiple cards and count > 1:
// - Player chooses how to distribute DON among targets
// - Each target can receive 0 to count DON
// - Total distributed must equal count (or all available)
//
// INSUFFICIENT DON:
// If not enough DON available:
// - If may=true, action can be skipped
// - Otherwise, give as many as available (or fail, depending on rules)

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: give DON to leader
//   Input: Give 1 DON to leader, 5 active DON in cost area
//   Expected: 4 DON in cost area, 1 DON attached to leader
//
// TEST: DON gives power bonus
//   Input: Character with 5000 power, give 2 DON
//   Expected: Character power is 7000 during owner's turn
//
// TEST: only active DON by default
//   Input: 2 rested DON, give 1 DON
//   Expected: Fails or no DON given (no active DON available)
//
// TEST: sourceDonState='any' allows rested
//   Input: 2 rested DON, sourceDonState='any', give 1
//   Expected: 1 rested DON attached to target
//
// TEST: enterRested sets attached DON rested
//   Input: Give 1 DON with enterRested=true
//   Expected: Attached DON has state='rested'
//
// TEST: distribute DON to multiple targets
//   Input: Give 3 DON, 2 valid targets
//   Expected: Player chooses distribution (e.g., 2+1 or 1+2)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Evaluate condition if present
// [ ] 2. Handle may choice
// [ ] 3. Resolve target selector
// [ ] 4. Check DON availability (count, state)
// [ ] 5. Handle distribution UI for multiple targets
// [ ] 6. Remove DON from cost area
// [ ] 7. Add DON to target's attachedDon
// [ ] 8. Apply enterRested if specified
// [ ] 9. Generate log entry
// [ ] 10. Handle insufficient DON cases

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full giveDon implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
