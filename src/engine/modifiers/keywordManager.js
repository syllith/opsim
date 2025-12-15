'use strict';
// keywordManager.js — Keyword State Management
// =============================================================================
// PURPOSE:
// This module manages keyword state for cards. It tracks granted and revoked
// keywords, handles duration expiry, and computes the final set of keywords
// a card currently has.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Track keyword grants (temporary keywords added)
// - Track keyword revokes (keywords disabled)
// - Compute effective keywords for a card
// - Handle keyword duration expiry
// - Clean up keywords on zone change

// =============================================================================
// PUBLIC API
// =============================================================================
// grantKeyword(gameState, instanceId, keyword, duration, sourceId) -> GameState
//   Grants a keyword to a card instance.
//
// revokeKeyword(gameState, instanceId, keyword, duration, sourceId) -> GameState
//   Revokes/disables a keyword on a card instance.
//
// getKeywords(gameState, instanceId) -> string[]
//   Returns all effective keywords for a card.
//   Includes printed + granted - revoked.
//
// hasKeyword(gameState, instanceId, keyword) -> boolean
//   Checks if a card currently has a specific keyword.
//
// isKeywordRevoked(gameState, instanceId, keyword) -> boolean
//   Checks if a keyword is actively revoked on a card.
//
// clearKeywordsForInstance(gameState, instanceId) -> GameState
//   Removes all keyword modifiers for an instance (zone change).
//
// expireKeywords(gameState, trigger) -> GameState
//   Removes expired keyword grants/revokes based on trigger.

// =============================================================================
// KEYWORD MODIFIER SCHEMA
// =============================================================================
// KeywordModifier = {
//   id: string,
//   instanceId: string,       // Target card
//   keyword: string,          // Keyword name
//   operation: 'grant' | 'revoke',
//   duration: Duration,
//   sourceInstanceId: string, // Card that created this
//   createdTurn: number,
//   ownerId: 'player1' | 'player2'
// }

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - instanceId: target card instance
// - keyword: keyword name string
// - duration: how long the modification lasts
// - sourceId: card creating the modification
//
// OUTPUTS:
// - GameState with updated keyword modifiers
// - string[] for keyword lists
// - boolean for presence checks
//
// STORAGE:
// gameState.keywordModifiers: KeywordModifier[]

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/keywordEffect.js: grants/revokes keywords
// - src/engine/core/zones.js: clears on zone change
// - src/engine/core/turnController.js: expires at turn end
// - src/engine/core/battle.js: checks Blocker, Rush, Double Attack
// - src/engine/index.js: getKeywordsFor, hasDisabledKeyword
//
// DEPENDS ON:
// - src/engine/core/gameState.js: card instance access
// - Card database: printed keywords

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// KEYWORD COMPUTATION:
// 1. Start with card's printed keywords (from card JSON)
// 2. Add all granted keywords (not revoked)
// 3. Remove all revoked keywords
// Result = printed + granted - revoked
//
// REVOKE PRECEDENCE:
// If a keyword is both printed/granted AND revoked:
// - Revoke wins (keyword is not active)
// - This is the "negation" behavior
//
// MULTIPLE GRANTS/REVOKES:
// Multiple grants of the same keyword don't stack.
// Card either has the keyword or doesn't.
// Revoking an already-revoked keyword is a no-op.
//
// DURATION HANDLING:
// Same as continuousEffects:
// - 'thisTurn': Until turn ends
// - 'thisBattle': Until battle ends
// - 'permanent': Until zone change
//
// COMMON KEYWORDS:
// - Blocker: Can declare as blocker during opponent's attack
// - Rush: Can attack the turn it's played
// - Double Attack: Deals 2 damage on successful leader attack
// - Banish: KO'd cards go to opponent's deck bottom
//
// ZONE CHANGE:
// All keyword modifiers for an instanceId are removed on zone change.
// The new instance starts fresh with only printed keywords.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: grantKeyword adds keyword
//   Input: Character without Blocker, grant Blocker
//   Expected: hasKeyword returns true for Blocker
//
// TEST: revokeKeyword removes keyword
//   Input: Character with Rush (printed), revoke Rush
//   Expected: hasKeyword returns false for Rush
//
// TEST: revoke beats grant
//   Input: Grant Blocker, then revoke Blocker
//   Expected: hasKeyword returns false
//
// TEST: getKeywords combines all
//   Input: Printed [Rush], granted Blocker, revoked Rush
//   Expected: getKeywords returns [Blocker]
//
// TEST: expireKeywords cleans up
//   Input: Grant with 'thisTurn', expire at turn end
//   Expected: Keyword no longer present
//
// TEST: clearKeywordsForInstance removes all
//   Input: Card has 3 keyword modifiers, clear
//   Expected: No keyword modifiers for that instance

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement grantKeyword
// [ ] 2. Implement revokeKeyword
// [ ] 3. Implement getKeywords with printed + granted - revoked
// [ ] 4. Implement hasKeyword
// [ ] 5. Implement isKeywordRevoked
// [ ] 6. Implement clearKeywordsForInstance
// [ ] 7. Implement expireKeywords
// [ ] 8. Handle duplicate grants (no-op)
// [ ] 9. Integrate with card database for printed keywords
// [ ] 10. Add logging

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const grantKeyword = (gameState, instanceId, keyword, duration, sourceId) => {
  // TODO: Grant keyword
  return gameState;
};

export const revokeKeyword = (gameState, instanceId, keyword, duration, sourceId) => {
  // TODO: Revoke keyword
  return gameState;
};

export const getKeywords = (gameState, instanceId) => {
  // TODO: Compute effective keywords
  return [];
};

export const hasKeyword = (gameState, instanceId, keyword) => {
  // TODO: Check for specific keyword
  return false;
};

export const isKeywordRevoked = (gameState, instanceId, keyword) => {
  // TODO: Check if keyword is revoked
  return false;
};

export const clearKeywordsForInstance = (gameState, instanceId) => {
  // TODO: Remove all keyword mods for instance
  return gameState;
};

export const expireKeywords = (gameState, trigger) => {
  // TODO: Remove expired keyword mods
  return gameState;
};

export default {
  grantKeyword,
  revokeKeyword,
  getKeywords,
  hasKeyword,
  isKeywordRevoked,
  clearKeywordsForInstance,
  expireKeywords
};
