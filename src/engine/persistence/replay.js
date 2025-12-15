'use strict';
// replay.js — Game Replay System (implemented replayStep/replayAll)
//
// This module provides simple deterministic replaying of actions by delegating
// to the engine's action interpreter. The design is intentionally simple:
// - replayStep(replay, i) replays actions 0..i (inclusive) and returns the
//   resulting state (deep-cloned).
// - replayAll(replay) replays all actions and returns final state.
// - createReplay uses structuredClone to snapshot the starting state.
//
// Notes:
// - actionLog entries can be either plain action objects, or ActionEntry
//   wrappers: { sequence, playerId, actionType, params } where the action
//   object is in params.
// - For deterministic replay we clone the starting state and pass that clone to
//   the interpreter. The interpreter mutates the provided state.
import { executeAction } from '../actions/interpreter.js';

const CURRENT_VERSION = 1;

function _safeClone(obj) {
  // Prefer structuredClone if available in runtime, fallback to JSON clone.
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export const createSnapshot = (gameState) => {
  return {
    version: CURRENT_VERSION,
    timestamp: Date.now(),
    gameState: _safeClone(gameState),
    rngState: gameState && gameState.rngState
  };
};

export const loadSnapshot = (snapshot) => {
  if (!snapshot) throw new Error('missing snapshot');
  if (snapshot.version !== CURRENT_VERSION) {
    console.warn(`Snapshot version ${snapshot.version} may not be compatible with engine version ${CURRENT_VERSION}`);
  }
  return _safeClone(snapshot.gameState);
};

export const createReplay = (startingState, rngSeed, actionLog) => {
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
 * replayStep(replay, stepIndex)
 * Replays actions from 0..stepIndex (inclusive) and returns the resulting state.
 *
 * If stepIndex is >= actionLog.length - 1, all actions are applied (alias of replayAll).
 * If stepIndex < 0, the starting state clone is returned.
 *
 * Throws if the replay is invalid or an action fails during execution.
 */
export const replayStep = (replay, stepIndex) => {
  if (!replay) throw new TypeError('replay is required');
  if (!Array.isArray(replay.actionLog)) throw new TypeError('replay.actionLog must be an array');

  const state = _safeClone(replay.startingState);
  if (!replay.actionLog.length || stepIndex < 0) return state;

  const last = Math.min(stepIndex, replay.actionLog.length - 1);

  for (let i = 0; i <= last; i++) {
    const entry = replay.actionLog[i];
    // Entry can be a plain action or an ActionEntry wrapper.
    const action = entry && entry.params ? entry.params : entry;
    const context = {};
    if (entry && (entry.playerId || entry.player)) {
      context.activePlayer = entry.playerId || entry.player;
    }
    // Execute using the engine interpreter. The interpreter mutates `state`.
    const res = executeAction(state, action, context);
    // Interpreter returns { success: true/false, ... } or custom shape.
    if (!res) {
      throw new Error(`Replay action at index ${i} returned no result`);
    }
    if (res && res.success === false) {
      throw new Error(`Replay action failed at index ${i}: ${res.error || 'unknown error'}`);
    }
    // Otherwise continue. We don't capture per-action snapshots here.
  }

  return state;
};

/**
 * replayAll(replay)
 * Replays all actions in the replay.actionLog and returns the final state.
 */
export const replayAll = (replay) => {
  if (!replay) throw new TypeError('replay is required');
  if (!Array.isArray(replay.actionLog)) throw new TypeError('replay.actionLog must be an array');
  // If no actions, return a clone of starting state
  if (!replay.actionLog.length) return _safeClone(replay.startingState);
  // Reuse replayStep to apply all
  return replayStep(replay, replay.actionLog.length - 1);
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
