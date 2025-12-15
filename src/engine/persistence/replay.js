'use strict';
/*
 * replay.js — Game Replay System (implemented)
 *
 * - replayStep(replay, stepIndex): replay actions 0..stepIndex inclusive
 * - replayAll(replay): replay all actions
 * - createSnapshot, loadSnapshot, createReplay, serialize/deserialize, validateReplay
 *
 * Notes:
 * - Relies on interpreter.executeAction(gameState, action, context)
 * - Accepts flexible action log entry shapes (see _extractActionFromEntry)
 * - Uses structuredClone if available; falls back to JSON clone.
 */

import interpreter from '../actions/interpreter.js';

const CURRENT_VERSION = 1;

function _safeClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export const createSnapshot = (gameState) => {
  return {
    version: CURRENT_VERSION,
    timestamp: Date.now(),
    gameState: _safeClone(gameState),
    rngState: (gameState && gameState.rngState) ? _safeClone(gameState.rngState) : null
  };
};

export const loadSnapshot = (snapshot) => {
  if (!snapshot) throw new TypeError('snapshot required');
  if (snapshot.version !== CURRENT_VERSION) {
    console.warn(`Snapshot version ${snapshot.version} may not be compatible with engine version ${CURRENT_VERSION}`);
  }
  return _safeClone(snapshot.gameState);
};

export const createReplay = (startingState, rngSeed = 0, actionLog = []) => {
  if (!startingState) throw new TypeError('startingState required');
  if (!Array.isArray(actionLog)) actionLog = [];

  return {
    version: CURRENT_VERSION,
    createdAt: Date.now(),
    startingState: _safeClone(startingState),
    rngSeed: typeof rngSeed === 'number' ? rngSeed : 0,
    actionLog: [...actionLog],
    metadata: {
      players: [],
      winner: null,
      duration: null
    }
  };
};

/**
 * Helper: normalize/extract an executable action object from a log entry.
 * Accepts various shapes:
 *  - Already an action: { type: 'playCard', instanceId: ..., ... }
 *  - Wrapper: { actionType: 'playCard', params: {...}, playerId, sequence }
 *  - Logger-style: { payload: { action: {...} } } or { payload: { type: 'playCard', ... } }
 *
 * Returns an action object or null if none found.
 */
function _extractActionFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  // If it's already an action-like object with a 'type' key, return a shallow copy
  if (entry.type && typeof entry.type === 'string') {
    // Remove known log-only keys to avoid interpreter confusion
    const copy = Object.assign({}, entry);
    delete copy.sequence;
    delete copy.timestamp;
    delete copy.playerId;
    delete copy.eventType;
    delete copy.payload;
    return copy;
  }

  // If shaped as { actionType, params }
  if (entry.actionType && typeof entry.actionType === 'string') {
    const action = { type: entry.actionType };
    if (entry.params && typeof entry.params === 'object') {
      Object.assign(action, entry.params);
    } else if (entry.args && typeof entry.args === 'object') {
      Object.assign(action, entry.args);
    }
    return action;
  }

  // If logger-style with payload.action or payload.type
  if (entry.payload && typeof entry.payload === 'object') {
    const p = entry.payload;
    if (p.action && typeof p.action === 'object' && p.action.type) {
      return Object.assign({}, p.action);
    }
    if (p.type && typeof p.type === 'string') {
      return Object.assign({}, p);
    }
    // payload.actionType + payload.params
    if (p.actionType && typeof p.actionType === 'string') {
      const action = { type: p.actionType };
      if (p.params && typeof p.params === 'object') Object.assign(action, p.params);
      return action;
    }
  }

  return null;
}

/**
 * Apply a sequence of action log entries to a clone of startingState.
 * Throws on interpreter failure to make test failures explicit.
 */
function _applyActionList(startingState, actionLog) {
  const state = _safeClone(startingState);

  if (!Array.isArray(actionLog) || actionLog.length === 0) {
    return state;
  }

  for (const entry of actionLog) {
    const action = _extractActionFromEntry(entry);
    if (!action) {
      // Skip non-action log entries gracefully
      continue;
    }

    const context = {
      activePlayer: entry.playerId || entry.player || null,
      playerId: entry.playerId || entry.player || null
    };

    const res = interpreter.executeAction(state, action, context);
    if (!res || res.success === false) {
      const seq = typeof entry.sequence === 'number' ? ` (sequence=${entry.sequence})` : '';
      const err = res && res.error ? res.error : 'unknown error';
      throw new Error(`Replay action failed${seq}: ${err}`);
    }
  }

  return state;
}

/**
 * replayStep(replay, stepIndex)
 * - Replays actions 0..stepIndex inclusive.
 * - stepIndex is 0-based. If stepIndex < 0 -> starting state clone.
 * - If stepIndex >= actionLog.length -> full replay (alias of replayAll).
 */
export const replayStep = (replay, stepIndex) => {
  if (!replay) throw new TypeError('replay required');
  if (!Array.isArray(replay.actionLog)) throw new TypeError('replay.actionLog must be an array');
  if (typeof stepIndex !== 'number' || Number.isNaN(stepIndex)) throw new TypeError('stepIndex must be a number');

  const total = replay.actionLog.length;
  if (total === 0 || stepIndex < 0) {
    return _safeClone(replay.startingState);
  }

  const upto = Math.min(stepIndex, total - 1);
  const slice = replay.actionLog.slice(0, upto + 1);
  return _applyActionList(replay.startingState, slice);
};

/**
 * replayAll(replay)
 * - Applies all actions from replay.actionLog and returns the final state.
 */
export const replayAll = (replay) => {
  if (!replay) throw new TypeError('replay required');
  if (!Array.isArray(replay.actionLog)) throw new TypeError('replay.actionLog must be an array');

  return _applyActionList(replay.startingState, replay.actionLog);
};

export const serializeReplay = (replay) => {
  return JSON.stringify(replay);
};

export const deserializeReplay = (serialized) => {
  return JSON.parse(serialized);
};

export const validateReplay = (replay) => {
  const errors = [];
  if (!replay) {
    errors.push('Replay is null or undefined');
    return { valid: false, errors };
  }
  if (!replay.version) errors.push('Missing version');
  if (!replay.startingState) errors.push('Missing starting state');
  if (typeof replay.rngSeed !== 'number') errors.push('Invalid or missing RNG seed');
  if (!Array.isArray(replay.actionLog)) errors.push('Invalid or missing action log');

  // Basic sanity: actionLog entries should be objects (defensive)
  if (Array.isArray(replay.actionLog) && replay.actionLog.some(a => typeof a !== 'object')) {
    errors.push('actionLog must contain only objects');
  }

  return { valid: errors.length === 0, errors };
};

export default {
  createSnapshot,
  loadSnapshot,
  createReplay,
  replayStep,
  replayAll,
  serializeReplay,
  deserializeReplay,
  validateReplay
};
