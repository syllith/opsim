'use strict';
// gameState.js — Core Game State Management
// =============================================================================
// PURPOSE:
// This module defines the canonical GameState structure and provides functions
// to create, clone, and query game state. GameState is the single source of
// truth for all game information at any point in time. All mutations go through
// actions that produce new state snapshots.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Define the GameState schema/shape that all modules use
// - Provide createInitialState() to set up a new game
// - Provide cloneState() for immutable-style updates
// - Provide getCardInstance() to look up cards by instanceId
// - Provide getCardsByZone() to query cards in specific zones
// - Track instance IDs and generate new ones when cards change zones
// - Manage the "used abilities" tracking for once-per-turn effects

// =============================================================================
// PUBLIC API
// =============================================================================
// createInitialState(player1Deck, player2Deck, options) -> GameState
//   Creates a fresh game state from two deck definitions.
//   Options: { startingPlayer: 'player1'|'player2', seed?: number }
//   Returns: A fully initialized GameState ready for play.
//
// cloneState(gameState) -> GameState
//   Returns a deep clone of the game state. Used before mutations
//   to preserve immutability semantics.
//
// getCardInstance(gameState, instanceId) -> CardInstance | null
//   Finds a card instance anywhere in the game by its unique instanceId.
//   Returns null if not found (card may have left play).
//
// getCardsByZone(gameState, side, zone) -> CardInstance[]
//   Returns all cards in a specific zone for a side.
//   side: 'player1' | 'player2'
//   zone: 'leader' | 'characters' | 'hand' | 'deck' | 'trash' | 'life' | 'donDeck' | 'costArea' | 'stage'
//
// generateInstanceId(gameState) -> { newId: string, newState: GameState }
//   Generates a new unique instance ID and increments the counter in state.
//
// markAbilityUsed(gameState, instanceId, abilityIndex) -> GameState
//   Records that a specific ability on a card has been used this turn/game.
//
// resetTurnAbilities(gameState) -> GameState
//   Called at end of turn to reset once-per-turn ability tracking.

// =============================================================================
// GAMESTATE SCHEMA
// =============================================================================
// GameState = {
//   // Meta
//   gameId: string,
//   turn: number,                    // Current turn number (1-indexed)
//   phase: string,                   // 'refresh' | 'draw' | 'don' | 'main' | 'end' | 'battle'
//   activePlayer: 'player1' | 'player2',
//   priority: 'player1' | 'player2', // Who can act right now
//   
//   // Instance ID counter
//   nextInstanceId: number,
//   
//   // Player states
//   player1: PlayerState,
//   player2: PlayerState,
//   
//   // Global tracking
//   usedAbilities: Map<string, Set<number>>, // instanceId -> set of used ability indices
//   turnUsedAbilities: Map<string, Set<number>>, // Reset each turn
//   activeReplacements: ReplacementEffect[], // Currently registered replacement effects
//   continuousEffects: ContinuousEffect[], // Active stat/keyword modifiers
//   
//   // Battle state (null if not in battle)
//   battle: BattleState | null,
//   
//   // RNG state for deterministic replays
//   rngState: RngState,
//   
//   // Game log
//   log: LogEntry[]
// }
//
// PlayerState = {
//   leader: CardInstance | null,     // The leader card
//   characters: CardInstance[],      // Characters on field (max 5)
//   stage: CardInstance | null,      // Stage card if any
//   hand: CardInstance[],            // Cards in hand
//   deck: CardInstance[],            // Draw deck (top = index 0)
//   trash: CardInstance[],           // Discard pile
//   life: CardInstance[],            // Life cards (top = index 0)
//   donDeck: CardInstance[],         // DON!! deck
//   costArea: CardInstance[],        // Active/rested DON for costs
// }
//
// CardInstance = {
//   instanceId: string,              // Unique ID for this instance
//   cardId: string,                  // Database card ID (e.g., "OP01-001")
//   ownerId: 'player1' | 'player2',  // Who owns this card
//   state: 'active' | 'rested',      // Tap state
//   attachedDon: CardInstance[],     // DON attached to this card
//   faceUp: boolean,                 // Visibility (mainly for life)
//   zone: string,                    // Current zone name
//   // Runtime computed (not stored, computed on access):
//   // - currentPower, currentKeywords, etc.
// }

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - Deck definitions: Array of cardIds representing a deck
// - Options for game setup (starting player, RNG seed)
// - Instance IDs for lookups
//
// OUTPUTS:
// - GameState objects (always as new objects, never mutated in place)
// - CardInstance objects for queries
// - null for not-found cases
//
// STATE:
// - This module does not hold global state
// - All state is passed in and returned as GameState objects
// - Each function is pure: same inputs -> same outputs

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/index.js (façade): uses all functions for state management
// - src/engine/actions/*.js: use cloneState before mutations, getCardInstance for targets
// - src/engine/core/turnController.js: uses resetTurnAbilities at turn end
// - src/engine/core/zones.js: uses getCardsByZone for zone operations
//
// DEPENDS ON:
// - src/engine/rng/rng.js: for initializing RNG state
// - Card database (src/data/cards/): for looking up card metadata during init
//
// UI USAGE PATTERN:
// The UI (Board.jsx) receives a GameState snapshot from the façade.
// It renders based on this snapshot. When actions occur, new snapshots
// are returned, triggering React re-renders.

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// IMMUTABILITY:
// Never mutate a GameState directly. Always:
// 1. Clone with cloneState()
// 2. Make changes to the clone
// 3. Return the clone
//
// INSTANCE ID GENERATION:
// Each card instance gets a unique ID like "inst_1", "inst_2", etc.
// When a card changes zones, it gets a NEW instance ID (zone-change identity rule).
// The old instance ID becomes invalid.
//
// ZONE-CHANGE IDENTITY:
// When a card moves zones:
// 1. Remove the old CardInstance from old zone
// 2. Create a new CardInstance with new instanceId
// 3. Clear all modifiers/attachments (except as rules specify)
// 4. Add new instance to new zone
//
// DECK INITIALIZATION:
// When creating initial state:
// 1. Parse deck lists
// 2. Create CardInstances for each card
// 3. Shuffle decks (using seeded RNG)
// 4. Set up life (5 cards from deck, face-down)
// 5. Set up DON decks (10 DON each)
// 6. Draw starting hands (5 cards each)
//
// DEEP CLONE STRATEGY:
// Use structuredClone() or a recursive clone that handles:
// - Arrays (new array, clone elements)
// - Objects (new object, clone properties)
// - Maps (new Map, clone entries)
// - Sets (new Set, clone values)
// - Primitives (copy directly)
// Avoid JSON.parse(JSON.stringify()) as it loses Maps/Sets.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: createInitialState sets up correct zones
//   Input: Two 50-card decks
//   Expected: Each player has 5 life, 5 hand, ~40 deck, 10 DON deck, leader set
//
// TEST: cloneState creates independent copy
//   Input: A GameState, then modify the clone
//   Expected: Original unchanged, clone has modifications
//
// TEST: getCardInstance finds cards in any zone
//   Input: instanceId of a card in player2's trash
//   Expected: Returns the CardInstance with matching instanceId
//
// TEST: getCardInstance returns null for invalid ID
//   Input: "nonexistent_id"
//   Expected: null
//
// TEST: generateInstanceId increments counter
//   Input: GameState with nextInstanceId = 10
//   Expected: Returns { newId: "inst_10", newState: {..., nextInstanceId: 11} }
//
// TEST: markAbilityUsed tracks correctly
//   Input: Mark ability index 0 on "inst_5" as used
//   Expected: gameState.turnUsedAbilities.get("inst_5").has(0) === true

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Define PlayerState and CardInstance creation helpers
// [ ] 2. Implement createInitialState with deck parsing
// [ ] 3. Implement cloneState with proper deep clone
// [ ] 4. Implement getCardInstance with zone iteration
// [ ] 5. Implement getCardsByZone
// [ ] 6. Implement generateInstanceId
// [ ] 7. Implement markAbilityUsed and resetTurnAbilities
// [ ] 8. Add validation for deck sizes and card types
// [ ] 9. Integrate with RNG for shuffling
// [ ] 10. Add JSDoc comments for IDE support

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const createInitialState = (player1Deck, player2Deck, options = {}) => {
  // TODO: Initialize full game state from deck definitions
  return { success: false, error: 'Not implemented' };
};

export const cloneState = (gameState) => {
  // TODO: Deep clone the game state
  // Use structuredClone or recursive clone for Maps/Sets
  return { success: false, error: 'Not implemented' };
};

export const getCardInstance = (gameState, instanceId) => {
  // TODO: Search all zones for the instance
  return null;
};

export const getCardsByZone = (gameState, side, zone) => {
  // TODO: Return cards in specified zone
  return [];
};

export const generateInstanceId = (gameState) => {
  // TODO: Generate new unique ID
  return { newId: '', newState: gameState };
};

export const markAbilityUsed = (gameState, instanceId, abilityIndex) => {
  // TODO: Track ability usage
  return gameState;
};

export const resetTurnAbilities = (gameState) => {
  // TODO: Clear turn-based ability tracking
  return gameState;
};

export default {
  createInitialState,
  cloneState,
  getCardInstance,
  getCardsByZone,
  generateInstanceId,
  markAbilityUsed,
  resetTurnAbilities
};
