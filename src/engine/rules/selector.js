'use strict';
// selector.js — Target Selection System
// =============================================================================
// PURPOSE:
// This module evaluates TargetSelector objects to find cards matching specific
// criteria. Selectors are used throughout abilities and actions to identify
// which cards an effect targets. The selector system supports filtering by
// zone, side, card properties, and complex filter expressions.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Evaluate TargetSelector objects against game state
// - Find all cards matching selector criteria
// - Handle min/max/upTo selection constraints
// - Support global selector registry (named selectors)
// - Evaluate inline selectors vs reference strings
// - Apply filter expressions to candidate cards

// =============================================================================
// PUBLIC API
// =============================================================================
// evaluateSelector(gameState, selector, context) -> CardInstance[]
//   Finds all cards matching the selector.
//   Context: { thisCard?, triggerSource?, boundVars? }
//   Returns array of matching CardInstance objects.
//
// resolveSelector(selector, context) -> TargetSelector
//   Resolves a selector reference to its definition.
//   If selector is a string, looks up in global registry.
//   If selector is an object, returns it directly.
//
// getGlobalSelector(name) -> TargetSelector | null
//   Returns a globally registered selector by name.
//   Built-in selectors: selfTopDeckCard, opponentTopDeckCard, etc.
//
// validateSelection(candidates, selector) -> { valid, error? }
//   Checks if a selection meets min/max/upTo constraints.
//
// applyDistinctBy(candidates, field) -> CardInstance[]
//   Filters candidates so all have distinct values for the field.

// =============================================================================
// TARGETSELECTOR SCHEMA (from schema.json)
// =============================================================================
// TargetSelector = {
//   side: 'self' | 'opponent' | 'both',   // Whose cards to consider
//   type: 'leader' | 'character' | 'thisCard' | 'any' | 'deck' | 'trash' | etc.,
//   zones?: string[],                      // Specific zones to search
//   filters?: Filter[],                    // Additional filter expressions
//   min?: number,                          // Minimum cards to select
//   max?: number,                          // Maximum cards to select
//   upTo?: boolean,                        // True if "up to" wording (can select fewer)
//   whoChooses?: 'self' | 'opponent' | 'system',
//   bindAs?: string,                       // Variable name for binding result
//   distinctBy?: string                    // Field for distinct values
// }

// =============================================================================
// GLOBAL SELECTOR REGISTRY
// =============================================================================
// Built-in global selectors (registered by name):
// - 'selfTopDeckCard': Top card of active player's deck
// - 'opponentTopDeckCard': Top card of opponent's deck
// - 'selfTopLifeCard': Top card of active player's life
// - 'opponentTopLifeCard': Top card of opponent's life
// - 'selfLeader': Active player's leader
// - 'opponentLeader': Opponent's leader
// - 'selfThisCard': Resolves to context.thisCard
// - 'selfTriggerSourceCard': Resolves to context.triggerSource

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - selector: TargetSelector object or string reference
// - context: execution context with thisCard, triggerSource, etc.
//
// OUTPUTS:
// - CardInstance[]: matching cards
// - TargetSelector: resolved selector object
// - Validation result: { valid: boolean, error?: string }
//
// CONTEXT SHAPE:
// context = {
//   thisCard: CardInstance,       // The card whose ability is being evaluated
//   triggerSource: CardInstance,  // For Trigger abilities, the life card
//   activePlayer: 'player1' | 'player2',
//   boundVars: Map<string, any>   // Variables bound during resolution
// }

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: resolving action targets
// - src/engine/actions/*.js: all action modules use selectors
// - src/engine/rules/evaluator.js: condition evaluation with selectors
// - src/engine/core/replacement.js: replacement target matching
//
// DEPENDS ON:
// - src/engine/core/gameState.js: getCardsByZone, getCardInstance
// - src/engine/rules/expressions.js: filter evaluation
//
// USED BY UI (indirectly):
// When UI needs to show valid targets for an action, the engine
// evaluates selectors and returns candidate lists.

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// SIDE RESOLUTION:
// 'self' = the player whose effect this is (from context)
// 'opponent' = the other player
// 'both' = search both players' zones
// Map these to 'player1'/'player2' based on context.activePlayer.
//
// TYPE RESOLUTION:
// - 'leader': Only leader cards
// - 'character': Only characters on field
// - 'thisCard': context.thisCard (special case)
// - 'any': Any card type
// - 'leaderOrCharacter': Leader or character on field
// Other types map to specific zones (deck, trash, hand, etc.)
//
// ZONE FILTERING:
// If 'zones' is specified, only search those zones.
// If not specified, infer from 'type':
// - leader -> leader zone
// - character -> characters zone
// - etc.
//
// FILTER EVALUATION ORDER:
// 1. Get candidates by side/type/zones
// 2. Apply each filter in order (AND logic by default)
// 3. Apply distinctBy if present
// 4. Validate against min/max/upTo
//
// THISCARD SPECIAL HANDLING:
// When type is 'thisCard', return [context.thisCard] directly.
// No zone search needed; it's a direct reference.
//
// BINDING:
// If selector.bindAs is set, the result should be stored
// in context.boundVars[bindAs] for later use in the same ability.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: evaluateSelector finds characters by side
//   Input: Selector { side: 'self', type: 'character' }, 3 self characters
//   Expected: Returns array of 3 CardInstances
//
// TEST: evaluateSelector applies filter
//   Input: Selector with filter { field: 'cost', op: '<=', value: 3 }
//   Expected: Only returns cards with cost <= 3
//
// TEST: resolveSelector looks up global selector
//   Input: 'selfTopDeckCard'
//   Expected: Returns selector for top of deck
//
// TEST: validateSelection checks min constraint
//   Input: 1 card selected, selector { min: 2 }
//   Expected: { valid: false, error: 'Must select at least 2' }
//
// TEST: thisCard type returns context card
//   Input: Selector { type: 'thisCard' }, context.thisCard set
//   Expected: Returns [context.thisCard]
//
// TEST: distinctBy filters duplicates
//   Input: 3 cards, 2 with same cardName, distinctBy: 'cardName'
//   Expected: Only 2 cards returned (one of each name)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement global selector registry
// [ ] 2. Implement resolveSelector for string lookups
// [ ] 3. Implement side resolution logic
// [ ] 4. Implement type-to-zone mapping
// [ ] 5. Implement zone candidate gathering
// [ ] 6. Wire filter evaluation to expressions.js
// [ ] 7. Implement distinctBy filtering
// [ ] 8. Implement validateSelection
// [ ] 9. Handle thisCard and triggerSource types
// [ ] 10. Implement binding (bindAs) support

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

// Global selector registry
const GLOBAL_SELECTORS = {
  selfTopDeckCard: { side: 'self', type: 'deck', zones: ['deck'], max: 1 },
  opponentTopDeckCard: { side: 'opponent', type: 'deck', zones: ['deck'], max: 1 },
  selfTopLifeCard: { side: 'self', type: 'any', zones: ['life'], max: 1 },
  opponentTopLifeCard: { side: 'opponent', type: 'any', zones: ['life'], max: 1 },
  selfLeader: { side: 'self', type: 'leader' },
  opponentLeader: { side: 'opponent', type: 'leader' },
  selfThisCard: { type: 'thisCard' },
  selfTriggerSourceCard: { type: 'triggerSource' }
};

export const evaluateSelector = (gameState, selector, context = {}) => {
  // TODO: Find all matching cards
  return [];
};

export const resolveSelector = (selector, context = {}) => {
  // Handle string reference vs inline object
  if (typeof selector === 'string') {
    return GLOBAL_SELECTORS[selector] || null;
  }
  return selector;
};

export const getGlobalSelector = (name) => {
  return GLOBAL_SELECTORS[name] || null;
};

export const validateSelection = (candidates, selector) => {
  // TODO: Check min/max/upTo constraints
  return { valid: true };
};

export const applyDistinctBy = (candidates, field) => {
  // TODO: Filter to distinct values
  return candidates;
};

export default {
  evaluateSelector,
  resolveSelector,
  getGlobalSelector,
  validateSelection,
  applyDistinctBy,
  GLOBAL_SELECTORS
};
