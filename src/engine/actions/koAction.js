'use strict';
// koAction.js — KO Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionKO action type. It KOs (knocks out) target
// character cards, moving them to trash and triggering related abilities.
// This is the effect-based KO; battle KO goes through battle.js.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - KO target characters via effect
// - Check for KO prevention/replacement
// - Coordinate with ko.js for actual KO processing
// - Handle multiple targets
// - Verify targets are valid (characters on field)

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes a ko action.
//   action: {
//     type: 'ko',
//     target: TargetSelectorRef,    // Characters to KO
//     condition?: Condition,
//     may?: boolean
//   }

// =============================================================================
// EFFECT KO VS BATTLE KO
// =============================================================================
// Effect KO: Caused by card effects (this module)
// Battle KO: Caused by losing combat (battle.js)
//
// The distinction matters because:
// - Some replacement effects only work for one type
// - "Cannot be KO'd by effects" doesn't prevent battle KO
// - Logging/events distinguish the cause

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionKO object
// - context: { thisCard, activePlayer }
//
// OUTPUTS:
// - ActionResult with updated gameState

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches ko actions
// - src/engine/index.js ko function
//
// DEPENDS ON:
// - src/engine/rules/selector.js: resolve targets
// - src/engine/core/ko.js: actual KO processing

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// TARGET VALIDATION:
// - Only characters can be KO'd (not leaders, stages, DON)
// - Target must be on the field (in characters zone)
// - Selector may match multiple characters
//
// MULTIPLE KO:
// When targeting multiple characters:
// - Process each KO in order
// - Each KO checks for its own replacement effects
// - [When KO'd] triggers fire after each
//
// CAUSE PARAMETER:
// Pass cause='effect' to ko.js to distinguish from battle KO.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: KO single character
//   Input: Target character on field
//   Expected: Character moved to trash
//
// TEST: KO multiple characters
//   Input: Target all characters with cost <= 2
//   Expected: All matching characters KO'd
//
// TEST: KO with prevention
//   Input: Target has preventKO replacement registered
//   Expected: Replacement checked, KO may be prevented
//
// TEST: invalid target (leader)
//   Input: Target selector matches leader
//   Expected: Leader not KO'd (filtered out)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Evaluate condition
// [ ] 2. Handle may choice
// [ ] 3. Resolve target selector
// [ ] 4. Filter to only characters
// [ ] 5. For each target, call ko.js with cause='effect'
// [ ] 6. Generate log entries
// [ ] 7. Handle partial failures

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full koAction implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
