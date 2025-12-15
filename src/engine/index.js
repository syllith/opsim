'use strict';
// index.js — Engine Façade
// =============================================================================
// PURPOSE:
// This is the SINGLE PUBLIC API the UI calls. All game engine functionality
// is accessed through this façade. The UI components (Board.jsx, Actions.jsx,
// etc.) will import from this file only. It delegates internally to modules
// under core/, actions/, modifiers/, rules/, rng/, and persistence/.
//
// The façade provides:
// 1. State inspection functions (read-only queries about game state)
// 2. Mutation functions (actions that change game state)
// 3. Event bus interface (on/off/emit for UI subscriptions)
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Export all public inspection functions the UI needs to query game state
// - Export all mutation functions the UI needs to change game state
// - Maintain an event bus for UI components to subscribe to state changes
// - Delegate to internal modules; never implement complex logic here
// - Return consistent, immutable-like snapshots of game state after mutations
// - Ensure all mutations are atomic from the UI's perspective
// - Handle errors gracefully and return structured error responses

// =============================================================================
// PUBLIC API — INSPECTION FUNCTIONS
// =============================================================================
// getCardMeta(cardId: string) -> CardMeta | null
//   Returns static card data (name, colors, cost, power, etc.) from card DB.
//   Does NOT include runtime state. Returns null if card not found.
//
// getTotalPower(instanceId: string, gameState: GameState) -> number
//   Returns the computed total power of a card instance on the field,
//   including base power, DON attachments (+1000 each during owner's turn),
//   and all continuous/temporary power modifiers.
//
// getKeywordsFor(instanceId: string, gameState: GameState) -> string[]
//   Returns the list of keywords currently active on a card instance,
//   including printed keywords and granted temporary keywords, minus
//   any disabled/revoked keywords.
//
// hasDisabledKeyword(instanceId: string, keyword: string, gameState: GameState) -> boolean
//   Returns true if the specified keyword is currently disabled/revoked
//   on the card instance (e.g., by negateEffects or keywordEffect revoke).
//
// getAreasForView(gameState: GameState, viewingSide: 'self'|'opponent') -> ViewAreas
//   Returns a view-appropriate representation of all zones, hiding
//   face-down cards and opponent's hand as appropriate.
//
// getGameStateSnapshot(gameState: GameState) -> GameStateSnapshot
//   Returns a deep clone of the canonical game state for safe UI usage.
//   The UI can hold this snapshot without worrying about mutations.

// =============================================================================
// PUBLIC API — MUTATION FUNCTIONS
// =============================================================================
// applyPowerMod(instanceId, amount, duration, gameState) -> MutationResult
//   Applies a power modifier to a card. Duration determines when it expires.
//   Returns { success: boolean, newState?: GameState, logEntry?: string }
//
// grantTempKeyword(instanceId, keyword, duration, gameState) -> MutationResult
//   Grants a keyword to a card for the specified duration.
//
// disableKeyword(instanceId, keyword, duration, gameState) -> MutationResult
//   Disables/revokes a keyword from a card for the specified duration.
//
// moveDonFromCostToCard(targetInstanceId, count, gameState) -> MutationResult
//   Moves active DON from cost area to attach to a card on the field.
//   DON gives +1000 power during owner's turn.
//
// returnDonFromCardToDeck(targetInstanceId, count, gameState) -> MutationResult
//   Returns DON attached to a card back to the DON deck.
//
// detachDonFromCard(targetInstanceId, count, gameState) -> MutationResult
//   Detaches DON from a card and returns it to the cost area.
//
// restCard(instanceId, gameState) -> MutationResult
//   Sets a card to rested state.
//
// setActive(instanceId, gameState) -> MutationResult
//   Sets a card to active state.
//
// playCard(cardId, sourceZone, options, gameState) -> MutationResult
//   Plays a card from the specified zone. Options include:
//   { payCost?: boolean, enterRested?: boolean, targetZone?: string }
//   Triggers [On Play] abilities as appropriate.
//
// moveCard(instanceId, destination, options, gameState) -> MutationResult
//   Moves a card to a destination zone. Options include ordering, faceUp.
//   Note: Moving to a new zone creates a new instance (zone-change identity).
//
// startDeckSearch(count, filters, addTo, gameState) -> MutationResult
//   Initiates a deck search, looking at top N cards or entire deck.
//
// shuffleFromTrashToDeck(count, filters, gameState) -> MutationResult
//   Moves cards from trash to deck and shuffles.
//
// drawCards(side, count, gameState) -> MutationResult
//   Has the specified side draw cards from deck to hand.
//
// payLife(side, count, gameState) -> MutationResult
//   Removes life cards (for damage or costs). Handles Trigger resolution.
//
// dealDamage(side, count, gameState) -> MutationResult
//   Deals damage to a leader, removing life. Handles Trigger timing.
//
// ko(instanceId, cause, gameState) -> MutationResult
//   KOs a character. Cause is 'battle' | 'effect'.
//   Triggers replacement effects and [When KO'd] abilities.
//
// registerReplacementEffect(effect, gameState) -> MutationResult
//   Registers a replacement effect that listens for a named event.
//
// markAbilityUsed(instanceId, abilityIndex, gameState) -> MutationResult
//   Marks a once-per-turn or once-per-game ability as used.

// =============================================================================
// PUBLIC API — EVENT BUS
// =============================================================================
// on(event: string, handler: Function) -> void
//   Subscribe to an engine event. Events include:
//   - 'areasChanged': fired after any zone/card state change
//   - 'log': fired when a log entry is created
//   - 'phaseChanged': fired when game phase changes
//   - 'abilityUsed': fired when an ability activates
//   - 'replacementRegistered': fired when a replacement effect is registered
//   - 'battleStarted': fired when combat begins
//   - 'battleEnded': fired when combat resolves
//   - 'turnStarted': fired at the start of a turn
//   - 'turnEnded': fired at the end of a turn
//   - 'gameOver': fired when win/lose condition is met
//
// off(event: string, handler: Function) -> void
//   Unsubscribe from an engine event.
//
// emit(event: string, payload: any) -> void
//   Internal use primarily; emits an event to all subscribers.

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUT SHAPES:
// - instanceId: string — unique ID for a card instance on the field
// - cardId: string — the card's database ID (e.g., "OP01-001")
// - gameState: GameState — the canonical game state object (see core/gameState.js)
// - duration: 'thisTurn' | 'thisBattle' | 'untilStartOfYourNextTurn' | 'permanent' | etc.
// - filters: Filter[] — array of filter expressions (see rules/expressions.js)
//
// OUTPUT SHAPE — MutationResult:
// {
//   success: boolean,
//   newState?: GameState,    // The updated game state (if success)
//   logEntry?: string,       // Human-readable log of what happened
//   error?: string           // Error message (if !success)
// }
//
// STATE:
// - The façade does NOT hold its own state; it receives gameState as a parameter
// - Each mutation returns a new gameState snapshot
// - The UI is responsible for managing the current state (e.g., via React state)
// - All mutations are synchronous and atomic

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// INTERNAL DEPENDENCIES (what this façade delegates to):
// - core/gameState.js: createInitialState, cloneState, getCardInstance
// - core/zones.js: zone manipulation helpers
// - core/turnController.js: phase management, turn switching
// - core/battle.js: combat resolution
// - core/damageAndLife.js: life/damage handling, Trigger resolution
// - core/ko.js: KO processing and replacement effects
// - core/replacement.js: replacement effect registration and checking
// - rules/selector.js: target selection logic
// - rules/expressions.js: condition/filter evaluation
// - rules/evaluator.js: ability condition checking
// - actions/interpreter.js: action execution dispatcher
// - actions/*: individual action implementations
// - modifiers/continuousEffects.js: power/stat modifier tracking
// - modifiers/keywordManager.js: keyword grant/revoke tracking
// - modifiers/donManager.js: DON attachment tracking
// - rng/rng.js: random number generation (seeded for replays)
// - persistence/logger.js: game log generation
// - persistence/replay.js: replay data capture
//
// UI DEPENDENCIES (what calls this façade):
// - src/comps/Home/Board.jsx: renders game state, subscribes to areasChanged
// - src/comps/Home/Actions.jsx: calls mutation functions on user actions
// - src/comps/Home/Battle.jsx: uses battle-related functions
// - src/comps/Home/CardViewer.jsx: uses getCardMeta for card display
// - src/comps/Home/Don.jsx: uses DON-related functions
// - src/comps/Home/DeckSearch.jsx: uses startDeckSearch

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// ZONE-CHANGE IDENTITY RULES:
// When a card moves from one zone to another, it becomes a new instance.
// All modifiers, attachments, and effects on the old instance are cleared
// unless rules explicitly say otherwise. The instanceId changes.
// Example: A character returned to hand loses all power modifiers.
//
// REPLACEMENT EFFECT PRECEDENCE:
// 1. Generator of the effect chooses first (card whose ability created it)
// 2. Turn player's effects resolve before non-turn player's
// 3. A replacement effect cannot apply to the same event more than once
// 4. Infinite loops are prevented by tracking applied replacements
//
// TRIGGER FLOW FOR LIFE/TRIGGER:
// When damage removes a Life card:
// 1. Reveal the Life card
// 2. Check if it has a [Trigger] ability
// 3. If yes, the card is "in limbo" while Trigger resolves
// 4. After Trigger resolution, card goes to trash (unless effect says otherwise)
// 5. Continue with next damage if multiple
//
// DON RULES:
// - Only active (untapped) DON can be given from cost area
// - DON attachments grant +1000 power during owner's turn only
// - During Refresh Phase, all DON returns to cost area and becomes rested
// - DON can be returned to DON deck via costs or effects
//
// CONTINUOUS EFFECT LAYERING:
// Apply in this order:
// 1. Base printed power
// 2. setBase effects (last one wins)
// 3. Additive modifiers (+X / -X)
// 4. DON bonus (+1000 per attached DON, if owner's turn)
//
// ATOMICITY:
// Each public mutation function must either:
// - Succeed completely and return the new state, OR
// - Fail completely and return an error (original state unchanged)
// Partial mutations are not allowed.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: getGameStateSnapshot returns canonical shape
//   Input: A valid GameState object
//   Expected: Returns deep clone with all zones (leader, characters, hand, etc.)
//
// TEST: applyPowerMod returns success shape (stub behavior)
//   Input: Valid instanceId, amount=1000, duration='thisTurn', gameState
//   Expected: { success: false, error: 'Not implemented' } initially
//   Later: { success: true, newState: ..., logEntry: 'X gained +1000 power' }
//
// TEST: on/off event subscription works
//   Input: Subscribe to 'areasChanged', emit event, unsubscribe
//   Expected: Handler called once while subscribed, not called after off()
//
// TEST: getTotalPower computes DON bonus correctly
//   Input: Card with 5000 base, 2 DON attached, owner's turn
//   Expected: 7000 (5000 + 2*1000)
//
// TEST: moveCard creates new instance and clears modifiers
//   Input: Character with +2000 power mod, move to hand
//   Expected: New instanceId, power mod not present on new instance
//
// TEST: ko triggers replacement effects
//   Input: Character with registered preventKO replacement
//   Expected: Replacement effect checked before KO proceeds

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Import and wire to core/gameState.js for state management
// [ ] 2. Implement event bus (on/off/emit) with Map of handlers
// [ ] 3. Implement getGameStateSnapshot using cloneState
// [ ] 4. Implement getCardMeta by looking up card database
// [ ] 5. Wire getTotalPower to modifiers/continuousEffects.js
// [ ] 6. Wire getKeywordsFor to modifiers/keywordManager.js
// [ ] 7. Implement mutation functions as delegators to actions/interpreter.js
// [ ] 8. Add logging calls via persistence/logger.js
// [ ] 9. Add event emissions after each mutation
// [ ] 10. Comprehensive error handling and validation

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

// Event bus storage (internal)
const _eventHandlers = new Map();

// --- INSPECTION FUNCTIONS ---

export const getCardMeta = (cardId) => {
  // TODO: Look up card in database by cardId
  return null;
};

export const getTotalPower = (instanceId, gameState) => {
  // TODO: Delegate to modifiers/continuousEffects.js
  // Compute: basePower + setBase + additives + DON bonus
  return 0;
};

export const getKeywordsFor = (instanceId, gameState) => {
  // TODO: Delegate to modifiers/keywordManager.js
  // Return: printed keywords + granted - revoked
  return [];
};

export const hasDisabledKeyword = (instanceId, keyword, gameState) => {
  // TODO: Check keywordManager for revoked keywords
  return false;
};

export const getAreasForView = (gameState, viewingSide) => {
  // TODO: Filter hidden information based on viewingSide
  return { success: false, error: 'Not implemented' };
};

export const getGameStateSnapshot = (gameState) => {
  // TODO: Return deep clone of gameState
  return { success: false, error: 'Not implemented' };
};

// --- MUTATION FUNCTIONS ---

export const applyPowerMod = (instanceId, amount, duration, gameState) => {
  // TODO: Delegate to actions/modifyStat.js
  return { success: false, error: 'Not implemented' };
};

export const grantTempKeyword = (instanceId, keyword, duration, gameState) => {
  // TODO: Delegate to actions/keywordEffect.js
  return { success: false, error: 'Not implemented' };
};

export const disableKeyword = (instanceId, keyword, duration, gameState) => {
  // TODO: Delegate to actions/keywordEffect.js with revoke operation
  return { success: false, error: 'Not implemented' };
};

export const moveDonFromCostToCard = (targetInstanceId, count, gameState) => {
  // TODO: Delegate to actions/giveDon.js
  return { success: false, error: 'Not implemented' };
};

export const returnDonFromCardToDeck = (targetInstanceId, count, gameState) => {
  // TODO: Delegate to actions/returnDon.js
  return { success: false, error: 'Not implemented' };
};

export const detachDonFromCard = (targetInstanceId, count, gameState) => {
  // TODO: Delegate to actions/attachDon.js (detach operation)
  return { success: false, error: 'Not implemented' };
};

export const restCard = (instanceId, gameState) => {
  // TODO: Delegate to core/zones.js setState
  return { success: false, error: 'Not implemented' };
};

export const setActive = (instanceId, gameState) => {
  // TODO: Delegate to core/zones.js setState
  return { success: false, error: 'Not implemented' };
};

export const playCard = (cardId, sourceZone, options, gameState) => {
  // TODO: Delegate to actions/playCard.js
  return { success: false, error: 'Not implemented' };
};

export const moveCard = (instanceId, destination, options, gameState) => {
  // TODO: Delegate to actions/moveCard.js
  return { success: false, error: 'Not implemented' };
};

export const startDeckSearch = (count, filters, addTo, gameState) => {
  // TODO: Delegate to actions/search.js
  return { success: false, error: 'Not implemented' };
};

export const shuffleFromTrashToDeck = (count, filters, gameState) => {
  // TODO: Delegate to actions/moveCard.js with shuffle
  return { success: false, error: 'Not implemented' };
};

export const drawCards = (side, count, gameState) => {
  // TODO: Delegate to core/zones.js draw operation
  return { success: false, error: 'Not implemented' };
};

export const payLife = (side, count, gameState) => {
  // TODO: Delegate to core/damageAndLife.js
  return { success: false, error: 'Not implemented' };
};

export const dealDamage = (side, count, gameState) => {
  // TODO: Delegate to actions/dealDamage.js
  return { success: false, error: 'Not implemented' };
};

export const ko = (instanceId, cause, gameState) => {
  // TODO: Delegate to actions/koAction.js
  return { success: false, error: 'Not implemented' };
};

export const registerReplacementEffect = (effect, gameState) => {
  // TODO: Delegate to core/replacement.js
  return { success: false, error: 'Not implemented' };
};

export const markAbilityUsed = (instanceId, abilityIndex, gameState) => {
  // TODO: Track in gameState.usedAbilities
  return { success: false, error: 'Not implemented' };
};

// --- EVENT BUS ---

export const on = (event, handler) => {
  if (!_eventHandlers.has(event)) {
    _eventHandlers.set(event, new Set());
  }
  _eventHandlers.get(event).add(handler);
};

export const off = (event, handler) => {
  if (_eventHandlers.has(event)) {
    _eventHandlers.get(event).delete(handler);
  }
};

export const emit = (event, payload) => {
  if (_eventHandlers.has(event)) {
    for (const handler of _eventHandlers.get(event)) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`Error in event handler for ${event}:`, e);
      }
    }
  }
};

// Default export for convenient importing
export default {
  // Inspection
  getCardMeta,
  getTotalPower,
  getKeywordsFor,
  hasDisabledKeyword,
  getAreasForView,
  getGameStateSnapshot,
  // Mutations
  applyPowerMod,
  grantTempKeyword,
  disableKeyword,
  moveDonFromCostToCard,
  returnDonFromCardToDeck,
  detachDonFromCard,
  restCard,
  setActive,
  playCard,
  moveCard,
  startDeckSearch,
  shuffleFromTrashToDeck,
  drawCards,
  payLife,
  dealDamage,
  ko,
  registerReplacementEffect,
  markAbilityUsed,
  // Event bus
  on,
  off,
  emit
};
