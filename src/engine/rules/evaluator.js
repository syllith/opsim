'use strict';
// evaluator.js — Ability and Effect Evaluator
// =============================================================================
// PURPOSE:
// This module evaluates abilities to determine if they can activate and handles
// triggering abilities at appropriate times. It coordinates ability activation,
// condition checking, cost payment, and frequency tracking.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Check if an ability can currently be activated
// - Evaluate ability conditions
// - Track ability frequency (once per turn/game)
// - Handle ability timing (when abilities should trigger)
// - Coordinate ability activation flow
// - Find all abilities that should trigger for an event

// =============================================================================
// PUBLIC API
// =============================================================================
// canActivateAbility(gameState, instanceId, abilityIndex, context) -> { can: boolean, reason?: string }
//   Checks if a specific ability on a card can be activated.
//   Considers: timing, frequency, conditions, costs.
//
// evaluateAbilityCondition(ability, gameState, context) -> boolean
//   Evaluates the ability's condition if present.
//   Returns true if no condition or condition passes.
//
// getTriggeredAbilities(gameState, timing, event) -> TriggeredAbility[]
//   Finds all abilities that should trigger for a timing/event combo.
//   Returns list of { instanceId, abilityIndex, ability, ownerId }.
//
// checkFrequency(gameState, instanceId, ability) -> boolean
//   Checks if the ability has already been used (for once per turn/game).
//
// canPayCost(gameState, ability, context) -> boolean
//   Checks if the cost of an ability can be paid.
//   Does not actually pay the cost.
//
// markAbilityTriggered(gameState, instanceId, abilityIndex) -> GameState
//   Records that an ability has triggered/been used.

// =============================================================================
// ABILITY TIMING (from schema.json)
// =============================================================================
// - onPlay: When the card is played
// - whenAttacking: When this card attacks
// - onBlock: When this card blocks
// - onOpponentsAttack: When opponent's card attacks
// - endOfYourTurn: At end of your turn
// - endOfOpponentsTurn: At end of opponent's turn
// - onKO: When this card is KO'd
// - onWouldBeKO: When this would be KO'd (replacement timing)
// - whenCharacterIsKOd: When any character is KO'd
// - activateMain: Activatable during Main Phase
// - main: Same as activateMain
// - static: Always active (continuous effect)
// - counter: Can be activated during Counter window
// - trigger: [Trigger] ability from life
// - And many more...

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - instanceId: card with the ability
// - abilityIndex: index of ability in card's abilities array
// - ability: Ability object from card JSON
// - timing: string indicating timing context
// - event: event data for triggered abilities
// - context: { thisCard, activePlayer, etc. }
//
// OUTPUTS:
// - { can: boolean, reason?: string }: activation check result
// - boolean: for simple checks
// - TriggeredAbility[]: abilities that should trigger
// - GameState: after marking usage

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/index.js: ability activation handling
// - src/engine/actions/interpreter.js: checking before actions
// - src/engine/core/turnController.js: end of turn triggers
// - src/engine/core/battle.js: battle-related triggers
// - src/engine/core/ko.js: KO triggers
// - src/engine/core/damageAndLife.js: life/trigger abilities
//
// DEPENDS ON:
// - src/engine/rules/expressions.js: condition evaluation
// - src/engine/core/gameState.js: ability tracking
// - Card database: ability definitions
//
// UI INTERACTION:
// Actions.jsx queries which abilities can be activated
// to show available actions to the player.

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// TIMING MATCHING:
// An ability triggers when:
// - Its timing matches the current game event
// - It's on a card in an appropriate zone (usually field)
// - Its condition (if any) is met
// Example: 'onPlay' timing only fires when the card is played
//
// FREQUENCY TRACKING:
// - 'oncePerTurn': Track in turnUsedAbilities, reset at turn end
// - 'oncePerGame': Track in usedAbilities, never reset
// - 'oncePerBattle': Track per battle, reset at battle end
// - 'none' or unspecified: No limit
//
// CONDITION EVALUATION:
// Conditions are Expression objects evaluated via expressions.js.
// Context must include thisCard for self-referencing conditions.
//
// COST CHECKING:
// Before allowing activation, verify costs can be paid:
// - restDonFromCostArea: Check for N active DON
// - trashFromHand: Check hand size
// - restThis: Check card is active
// - etc.
// This is just a check; actual payment is during execution.
//
// TRIGGER ORDERING:
// When multiple abilities trigger simultaneously:
// 1. Turn player's abilities first
// 2. Within same player: Choose order
// This is handled by the UI/player, not auto-resolved.
//
// STATIC ABILITIES:
// Abilities with 'static' timing don't "trigger" per se.
// They create continuous effects that are always active
// while the card is in play.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: canActivateAbility checks timing
//   Input: 'activateMain' ability during Main Phase
//   Expected: { can: true }
//
// TEST: canActivateAbility rejects wrong timing
//   Input: 'activateMain' ability during Draw Phase
//   Expected: { can: false, reason: 'Wrong timing' }
//
// TEST: frequency blocks second activation
//   Input: oncePerTurn ability, already used this turn
//   Expected: { can: false, reason: 'Already used this turn' }
//
// TEST: condition evaluation
//   Input: Ability with condition { field: 'selectorCount', ... }
//   Expected: canActivateAbility returns based on condition
//
// TEST: getTriggeredAbilities finds matching
//   Input: 'onPlay' timing, card just played with onPlay ability
//   Expected: Returns that ability in results
//
// TEST: canPayCost checks resources
//   Input: Cost requires 2 active DON, only 1 available
//   Expected: false

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement timing matching logic
// [ ] 2. Implement frequency checking
// [ ] 3. Implement condition evaluation (delegate to expressions.js)
// [ ] 4. Implement cost checking for all cost types
// [ ] 5. Implement getTriggeredAbilities
// [ ] 6. Implement canActivateAbility with all checks
// [ ] 7. Implement markAbilityTriggered
// [ ] 8. Handle static abilities specially
// [ ] 9. Handle trigger abilities from life
// [ ] 10. Add detailed reason messages for failures

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const canActivateAbility = (gameState, instanceId, abilityIndex, context = {}) => {
  // TODO: Full activation check
  return { can: false, reason: 'Not implemented' };
};

export const evaluateAbilityCondition = (ability, gameState, context = {}) => {
  // TODO: Evaluate condition via expressions.js
  if (!ability?.condition) return true;
  return true; // Stub: pass all conditions
};

export const getTriggeredAbilities = (gameState, timing, event = {}) => {
  // TODO: Find all abilities matching timing
  return [];
};

export const checkFrequency = (gameState, instanceId, ability) => {
  // TODO: Check if ability already used
  if (!ability?.frequency || ability.frequency === 'none') {
    return true; // No frequency limit
  }
  // Stub: allow for now
  return true;
};

export const canPayCost = (gameState, ability, context = {}) => {
  // TODO: Check if cost can be paid
  if (!ability?.cost) return true;
  return true; // Stub: assume can pay
};

export const markAbilityTriggered = (gameState, instanceId, abilityIndex) => {
  // TODO: Record ability usage
  return gameState;
};

export default {
  canActivateAbility,
  evaluateAbilityCondition,
  getTriggeredAbilities,
  checkFrequency,
  canPayCost,
  markAbilityTriggered
};
