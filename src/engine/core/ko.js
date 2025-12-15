'use strict';
// ko.js — KO Processing System
// =============================================================================
// PURPOSE:
// This module handles KO (knockout) processing for characters. When a character
// is KO'd, it moves to trash and triggers related abilities. The module
// coordinates with replacement effects that can prevent or modify KO.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Process KO requests (from battle or effects)
// - Check for replacement effects before KO occurs
// - Execute [On KO] and [When KO'd] abilities
// - Move KO'd cards to trash
// - Handle "would be KO'd" replacement flow
// - Track KO cause (battle vs effect) for conditional effects

// =============================================================================
// PUBLIC API
// =============================================================================
// ko(gameState, instanceId, cause) -> GameState
//   KOs a character, moving it to trash.
//   cause: 'battle' | 'effect'
//   Checks replacements first, triggers abilities, then trashes.
//
// wouldBeKO(gameState, instanceId, cause) -> ReplacementCheckResult
//   Checks if the KO would be replaced/prevented.
//   Returns info about applicable replacement effects.
//   Used to query before committing to KO.
//
// processKOAbilities(gameState, koedCardId, cause) -> GameState
//   Triggers all [On KO] and [When KO'd] abilities.
//   The card is already in trash at this point.
//
// canBeKOd(gameState, instanceId) -> boolean
//   Checks if a card can currently be KO'd.
//   (Some effects make cards immune to KO.)

// =============================================================================
// KO FLOW
// =============================================================================
// 1. Something requests KO (battle loss, effect, etc.)
// 2. Call wouldBeKO to check for replacements
// 3. If replacement exists and player wants to use it:
//    a. Pay replacement cost if any
//    b. Execute replacement actions
//    c. KO is prevented/replaced
// 4. If no replacement or declined:
//    a. Detach all DON (return to owner's cost area)
//    b. Clear all modifiers
//    c. Move card to trash
//    d. Trigger [On KO] abilities (on the dying card)
//    e. Trigger [When a Character is KO'd] abilities (on other cards)

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - instanceId: card being KO'd
// - cause: 'battle' | 'effect' for conditional effects
//
// OUTPUTS:
// - GameState after KO processing
// - ReplacementCheckResult for wouldBeKO queries
// - boolean for canBeKOd queries
//
// KO TRACKING:
// Some effects care about how many characters were KO'd.
// Track in gameState.turnKOCount or similar.

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/core/battle.js: when character loses battle
// - src/engine/actions/koAction.js: effect-based KO
// - src/engine/actions/interpreter.js: ActionKO processing
//
// DEPENDS ON:
// - src/engine/core/gameState.js: cloneState
// - src/engine/core/zones.js: moveToZone (to trash)
// - src/engine/core/replacement.js: checkReplacements for 'wouldBeKO'
// - src/engine/modifiers/donManager.js: detach DON on KO
// - src/engine/modifiers/continuousEffects.js: clean up modifiers
// - src/engine/rules/evaluator.js: trigger abilities
//
// EVENTS EMITTED:
// - 'characterKOd': { instanceId, cardId, cause, ownerId }

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// BATTLE VS EFFECT KO:
// The 'cause' distinguishes how the KO happened:
// - 'battle': Character lost in combat (power comparison)
// - 'effect': Card effect KO'd the character
// Some replacement effects only work for one type.
// Example: "This character cannot be KO'd by effects"
//
// DON ON KO:
// When a character with attached DON is KO'd:
// - All DON returns to the owner's cost area
// - DON returns in rested state
// - This happens BEFORE the card moves to trash
//
// MODIFIER CLEANUP:
// Before moving to trash:
// - Remove all continuous effects targeting this instance
// - The new instance in trash has no modifiers
// - Effects that reference the old instanceId become invalid
//
// ABILITY TIMING:
// [On KO] abilities on the dying card trigger AFTER it's in trash.
// The ability sees the card in trash (can target it for effects).
// [When a Character is KO'd] on OTHER cards also triggers now.
//
// CANNOT BE KO'D:
// Some effects grant immunity to KO.
// Check this before even asking about replacements.
// If immune, KO simply fails (returns unchanged state).

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: ko moves character to trash
//   Input: KO a character on field
//   Expected: Character no longer in characters zone, now in trash
//
// TEST: ko detaches DON first
//   Input: Character with 2 DON attached
//   Expected: 2 DON in owner's cost area (rested), character in trash
//
// TEST: wouldBeKO finds replacement effects
//   Input: Character has preventKO replacement registered
//   Expected: Returns { hasReplacement: true, ... }
//
// TEST: ko triggers onKO ability
//   Input: Character with [On KO] ability is KO'd
//   Expected: Ability executes after card in trash
//
// TEST: battle vs effect cause tracked correctly
//   Input: KO with cause='battle'
//   Expected: Event payload and ability checks receive 'battle' cause
//
// TEST: canBeKOd returns false for immune cards
//   Input: Character with KO immunity effect
//   Expected: canBeKOd returns false

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement canBeKOd immunity check
// [ ] 2. Implement wouldBeKO with replacement checking
// [ ] 3. Implement ko main flow
// [ ] 4. Handle DON detachment before move
// [ ] 5. Implement processKOAbilities
// [ ] 6. Integrate with zones.js for trash move
// [ ] 7. Trigger [When Character KO'd] on other cards
// [ ] 8. Track KO count for turn (if needed)
// [ ] 9. Emit 'characterKOd' event
// [ ] 10. Handle edge cases (KO during other abilities)

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const ko = (gameState, instanceId, cause = 'effect') => {
  // TODO: Process KO with replacements and abilities
  return { success: false, error: 'Not implemented' };
};

export const wouldBeKO = (gameState, instanceId, cause = 'effect') => {
  // TODO: Check for replacement effects
  return { hasReplacement: false, effects: [], canBeKOd: true };
};

export const processKOAbilities = (gameState, koedCardId, cause) => {
  // TODO: Trigger KO-related abilities
  return gameState;
};

export const canBeKOd = (gameState, instanceId) => {
  // TODO: Check for KO immunity
  return true;
};

export default {
  ko,
  wouldBeKO,
  processKOAbilities,
  canBeKOd
};
