'use strict';
// logger.js — Game Event Logger
// =============================================================================
// PURPOSE:
// This module provides structured logging for game events. Logs support:
// - Debugging during development
// - Replay generation
// - Audit trails for multiplayer
// - User-facing activity logs
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Capture game events with consistent structure
// - Support multiple log levels (debug, info, action, error)
// - Maintain event sequence for replay
// - Allow log filtering and export
// - Provide human-readable formatting option

// =============================================================================
// PUBLIC API
// =============================================================================
// createLogger() -> Logger
//   Creates a new logger instance.
//
// log(logger, level, eventType, payload) -> Logger
//   Logs an event. Returns updated logger (immutable pattern).
//   level: 'debug' | 'info' | 'action' | 'error'
//   eventType: string identifier for the event
//   payload: object with event details
//
// logAction(logger, actionType, details) -> Logger
//   Shorthand for logging game actions at 'action' level.
//
// getLog(logger) -> LogEntry[]
//   Returns all log entries.
//
// getActionLog(logger) -> LogEntry[]
//   Returns only action-level entries (for replay).
//
// formatForDisplay(logEntry) -> string
//   Formats a log entry for human reading.
//
// serializeLog(logger) -> string
//   Serializes the log for storage/export.
//
// deserializeLog(serialized) -> Logger
//   Restores a logger from serialized data.

// =============================================================================
// LOG ENTRY SCHEMA
// =============================================================================
// LogEntry = {
//   sequence: number,      // Auto-incrementing sequence ID
//   timestamp: number,     // Game turn/phase timestamp
//   level: string,         // 'debug' | 'info' | 'action' | 'error'
//   eventType: string,     // e.g., 'CARD_MOVED', 'BATTLE_RESOLVED'
//   payload: object,       // Event-specific data
//   playerId?: string,     // Player who triggered event (if applicable)
// }

// =============================================================================
// STANDARD EVENT TYPES
// =============================================================================
// GAME_STARTED
// GAME_ENDED
// TURN_STARTED
// TURN_ENDED
// PHASE_CHANGED
// CARD_DRAWN
// CARD_PLAYED
// CARD_MOVED
// DON_ATTACHED
// DON_DETACHED
// DON_ADDED_TO_FIELD
// ATTACK_DECLARED
// BLOCKER_DECLARED
// COUNTER_PLAYED
// BATTLE_RESOLVED
// DAMAGE_DEALT
// LIFE_LOST
// CARD_KO
// ABILITY_TRIGGERED
// ABILITY_ACTIVATED
// EFFECT_APPLIED
// SEARCH_STARTED
// SEARCH_COMPLETED
// TRASH_TO_DECK_SHUFFLE

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - logger: current logger state
// - level: log level
// - eventType: type identifier
// - payload: event data
//
// OUTPUTS:
// - Updated logger instance
// - Formatted strings for display
// - Serialized data for storage

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/index.js: log all public API calls
// - src/engine/actions/*: log action execution
// - src/engine/core/*: log state changes
//
// PROVIDES TO:
// - src/engine/persistence/replay.js: action log for replay
// - UI: activity display
// - Network: audit log

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// IMMUTABILITY:
// Logger state is immutable. Each log() returns new logger.
// This ensures logs are never accidentally mutated and supports
// functional patterns in the engine.
//
// SEQUENCE NUMBERS:
// Every event gets a unique sequence number.
// These establish total ordering even if timestamps collide.
//
// LOG LEVELS:
// - debug: Development/debugging info, filtered in production
// - info: State changes, not user-facing
// - action: User-visible actions (for activity log and replay)
// - error: Problems that occurred (not throw-worthy)
//
// FILTERING:
// getActionLog() returns only 'action' level entries.
// These are the minimum needed for replay.
//
// DISPLAY FORMATTING:
// formatForDisplay() produces human-readable strings like:
// "Player 1 plays Luffy (OP01-003) from hand to character area"
// "Luffy attacks Navy HQ Leader"

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: log captures all fields
//   Input: log(logger, 'action', 'CARD_PLAYED', { cardId: 'OP01-003' })
//   Expected: Entry has sequence, timestamp, level, eventType, payload
//
// TEST: sequence auto-increments
//   Input: Log 3 events
//   Expected: Sequences are 1, 2, 3
//
// TEST: getActionLog filters correctly
//   Input: Log debug, action, info, action events
//   Expected: getActionLog returns only the 2 action events
//
// TEST: serialize/deserialize roundtrip
//   Input: Log events, serialize, deserialize
//   Expected: Identical log entries
//
// TEST: formatForDisplay produces readable output
//   Input: Various event types
//   Expected: Human-readable strings

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement createLogger
// [ ] 2. Implement log with all levels
// [ ] 3. Implement logAction shorthand
// [ ] 4. Implement getLog and getActionLog
// [ ] 5. Implement formatForDisplay for all event types
// [ ] 6. Implement serialization
// [ ] 7. Add timestamp from game state
// [ ] 8. Add player ID to relevant events
// [ ] 9. Document all event types
// [ ] 10. Test with replay system

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const createLogger = () => {
  return {
    entries: [],
    nextSequence: 1
  };
};

export const log = (logger, level, eventType, payload) => {
  const entry = {
    sequence: logger.nextSequence,
    timestamp: Date.now(),
    level,
    eventType,
    payload
  };
  return {
    entries: [...logger.entries, entry],
    nextSequence: logger.nextSequence + 1
  };
};

export const logAction = (logger, actionType, details) => {
  return log(logger, 'action', actionType, details);
};

export const getLog = (logger) => {
  return logger.entries;
};

export const getActionLog = (logger) => {
  return logger.entries.filter(e => e.level === 'action');
};

export const formatForDisplay = (logEntry) => {
  // TODO: Implement human-readable formatting
  return `[${logEntry.sequence}] ${logEntry.eventType}: ${JSON.stringify(logEntry.payload)}`;
};

export const serializeLog = (logger) => {
  return JSON.stringify(logger);
};

export const deserializeLog = (serialized) => {
  return JSON.parse(serialized);
};

export default {
  createLogger,
  log,
  logAction,
  getLog,
  getActionLog,
  formatForDisplay,
  serializeLog,
  deserializeLog
};
