'use strict';
// attachDon.js — Attach DON Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionAttachDon action type. It moves DON!! cards
// from one location (specified by selector) to attach to target cards. This
// differs from giveDon in that it can move DON from non-standard sources
// (e.g., from one card to another).
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Move DON from source selector to target cards
// - Handle DON already attached to other cards
// - Validate DON source and target
// - Track DON attachment changes

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes an attachDon action.
//   action: {
//     type: 'attachDon',
//     target: TargetSelectorRef,     // Card(s) to receive DON
//     selector?: TargetSelectorRef,  // Where to get DON from
//     condition?: Condition,
//     may?: boolean
//   }

// =============================================================================
// ATTACH DON VS GIVE DON
// =============================================================================
// giveDon: Takes from owner's cost area only
// attachDon: Can specify a source (e.g., DON from another card, cost area)
//
// Use cases for attachDon:
// - Move DON from one character to another
// - Special effects that attach DON from non-cost-area sources
// - Redistributing DON during play

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionAttachDon object
// - context: { thisCard, activePlayer, boundVars }
//
// OUTPUTS:
// - ActionResult with updated gameState

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches attachDon actions
//
// DEPENDS ON:
// - src/engine/rules/selector.js: resolve target and source
// - src/engine/modifiers/donManager.js: DON tracking utilities

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// SOURCE SELECTOR:
// If selector is provided, resolve it to find DON to move.
// If not provided, default to owner's cost area (like giveDon).
//
// MOVING ATTACHED DON:
// When DON is already attached to a card:
// 1. Remove from source card's attachedDon
// 2. Add to target card's attachedDon
// No trip through cost area needed.
//
// TARGET VALIDATION:
// Same as giveDon: must be leader/character on field.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: attach DON from cost area
//   Input: No selector, target is a character
//   Expected: DON moved from cost area to character
//
// TEST: move DON between cards
//   Input: selector=character with DON, target=another character
//   Expected: DON detached from source, attached to target
//
// TEST: may choice respected
//   Input: may=true, player declines
//   Expected: No DON moved, success returned

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Evaluate condition
// [ ] 2. Handle may choice
// [ ] 3. Resolve target selector
// [ ] 4. Resolve source selector (or default to cost area)
// [ ] 5. Move DON from source to target
// [ ] 6. Update both cards' attachedDon arrays
// [ ] 7. Generate log entry

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full attachDon implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
