'use strict';
// turnController.js — Turn Phase Management
// =============================================================================
// PURPOSE:
// This module manages the turn structure and phase progression in the One Piece
// TCG. It handles turn start/end procedures, phase transitions, and the refresh
// step mechanics (DON return, card untap, DON addition).
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Track and advance game phases in correct order
// - Execute start-of-turn procedures (Refresh Phase)
// - Execute end-of-turn procedures
// - Handle DON addition during Don Phase
// - Reset once-per-turn abilities at turn end
// - Manage active player switching
// - Emit phase change events

// =============================================================================
// PUBLIC API
// =============================================================================
// startTurn(gameState) -> GameState
//   Begins a new turn for the active player.
//   Executes Refresh Phase automatically.
//
// advancePhase(gameState) -> GameState
//   Moves to the next phase in order.
//   Phase order: refresh -> draw -> don -> main -> end
//
// getCurrentPhase(gameState) -> string
//   Returns the current phase name.
//
// endTurn(gameState) -> GameState
//   Ends the current turn, switches active player, increments turn counter.
//   Triggers end-of-turn effects and resets turn-based tracking.
//
// executeRefreshPhase(gameState) -> GameState
//   - Return all DON from cards to cost area (rested)
//   - Set all DON in cost area to rested
//   - Set all characters and leader to active
//   - Clear "until end of turn" effects
//
// executeDrawPhase(gameState) -> GameState
//   Active player draws 1 card (except turn 1).
//
// executeDonPhase(gameState) -> GameState
//   Add 2 DON from DON deck to cost area (1 DON on turn 1 for first player).
//   Set added DON to active.
//
// getActivePlayer(gameState) -> 'player1' | 'player2'
//   Returns who is currently taking their turn.

// =============================================================================
// PHASE ORDER
// =============================================================================
// 1. REFRESH PHASE
//    - DON cards attached to Characters/Leaders return to Cost Area (rested)
//    - All DON in Cost Area become rested
//    - All Characters and your Leader become active
//    - "Until end of turn" effects expire
//
// 2. DRAW PHASE
//    - Draw 1 card from deck (skip on first player's first turn)
//
// 3. DON!! PHASE
//    - Add DON from DON Deck to Cost Area (active)
//    - Turn 1: First player adds 1 DON
//    - Turn 1: Second player adds 2 DON
//    - All other turns: Add 2 DON (up to 10 max in cost area)
//
// 4. MAIN PHASE
//    - Player can take actions: play cards, attack, activate abilities
//    - No automatic actions; player controls timing
//
// 5. END PHASE
//    - "Until end of turn" effects that haven't expired do so
//    - End of turn triggers fire
//    - Switch active player

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
//
// OUTPUTS:
// - GameState: updated state after phase operations
//
// STATE TRACKING:
// - gameState.phase: current phase string
// - gameState.turn: turn number (1-indexed)
// - gameState.activePlayer: who is taking the turn

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/index.js: phase advancement on UI requests
// - Game flow controller (when UI signals phase done)
//
// DEPENDS ON:
// - src/engine/core/gameState.js: cloneState, resetTurnAbilities
// - src/engine/core/zones.js: setCardState, moveToZone
// - src/engine/modifiers/continuousEffects.js: expire effects by duration
// - src/engine/modifiers/donManager.js: return DON to cost area
// - src/engine/index.js emit: phase change events
//
// UI INTERACTION:
// - Actions.jsx shows available actions based on current phase
// - Board.jsx may highlight phase indicator
// - UI calls advancePhase when player clicks "End Phase" or similar

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// TURN 1 SPECIAL RULES:
// - First player: Draw 0, add 1 DON
// - Second player: Draw 1, add 2 DON (or 1? check rules)
// - Neither player can attack on turn 1 (enforced elsewhere)
//
// DON RETURN DURING REFRESH:
// All DON attached to characters/leader returns to cost area.
// This DON becomes rested, not active.
// The cost area DON is also set to rested at refresh.
// DON becomes active when newly added from DON deck.
//
// EFFECT DURATION EXPIRY:
// Effects with duration 'thisTurn' should expire at end of turn.
// Effects with duration 'untilStartOfYourNextTurn' expire at next refresh.
// Track which effects to clean up based on their duration and when created.
//
// PHASE TRANSITION EVENTS:
// Emit 'phaseChanged' with { phase, turn, activePlayer } payload
// after each phase change for UI updates.

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: startTurn initializes with Refresh Phase
//   Input: GameState at end phase
//   Expected: Phase is 'refresh', then auto-advances after refresh actions
//
// TEST: executeRefreshPhase returns DON correctly
//   Input: Player has 3 DON attached to characters
//   Expected: All 3 DON in cost area, rested state
//
// TEST: executeRefreshPhase untaps characters
//   Input: 2 rested characters
//   Expected: Both characters now active
//
// TEST: executeDonPhase adds correct DON count
//   Input: Turn 3, player has 4 DON in cost area
//   Expected: Now has 6 DON (4 + 2), new ones active
//
// TEST: turn 1 first player gets 1 DON
//   Input: Turn 1, first player's DON phase
//   Expected: 1 DON added (not 2)
//
// TEST: endTurn switches active player
//   Input: player1's turn ending
//   Expected: activePlayer becomes 'player2', turn increments

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement phase constant and ordering
// [ ] 2. Implement startTurn with refresh phase execution
// [ ] 3. Implement advancePhase with proper order
// [ ] 4. Implement executeRefreshPhase (DON return, untap)
// [ ] 5. Implement executeDrawPhase (with turn 1 skip)
// [ ] 6. Implement executeDonPhase (with turn 1 rules)
// [ ] 7. Implement endTurn (player switch, turn increment)
// [ ] 8. Wire to continuousEffects for duration expiry
// [ ] 9. Emit phase change events
// [ ] 10. Handle edge cases (empty DON deck, deck out on draw)

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const PHASES = ['refresh', 'draw', 'don', 'main', 'end'];

export const startTurn = (gameState) => {
  // TODO: Begin new turn, execute refresh
  return { success: false, error: 'Not implemented' };
};

export const advancePhase = (gameState) => {
  // TODO: Move to next phase
  return { success: false, error: 'Not implemented' };
};

export const getCurrentPhase = (gameState) => {
  return gameState?.phase || 'unknown';
};

export const endTurn = (gameState) => {
  // TODO: End turn, switch player
  return { success: false, error: 'Not implemented' };
};

export const executeRefreshPhase = (gameState) => {
  // TODO: DON return, untap all
  return { success: false, error: 'Not implemented' };
};

export const executeDrawPhase = (gameState) => {
  // TODO: Draw 1 card (skip turn 1 first player)
  return { success: false, error: 'Not implemented' };
};

export const executeDonPhase = (gameState) => {
  // TODO: Add DON from DON deck
  return { success: false, error: 'Not implemented' };
};

export const getActivePlayer = (gameState) => {
  return gameState?.activePlayer || 'player1';
};

export default {
  PHASES,
  startTurn,
  advancePhase,
  getCurrentPhase,
  endTurn,
  executeRefreshPhase,
  executeDrawPhase,
  executeDonPhase,
  getActivePlayer
};
