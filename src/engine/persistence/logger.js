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

/* (header comments kept as in original file) */

// NOTE: The module already implemented most functions. We only implement a
// richer formatForDisplay() that returns human-friendly strings for a
// selection of important event types.

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

/**
 * formatForDisplay(logEntry) -> string
 *
 * Produce a human-readable string suitable for UI activity feed. We support a
 * set of well-known event types (CARD_PLAYED, CARD_MOVED, ATTACK_DECLARED,
 * DAMAGE_DEALT, CARD_KO, DON_ATTACHED, DON_DETACHED). Unknown event types fall
 * back to a safe JSON representation.
 *
 * Examples:
 *  [1] 2025-02-01T12:00:00.000Z player plays OP01-003 -> char
 *  [2] 2025-02-01T12:00:12.000Z player moves OP01-003 from hand to char
 */
export const formatForDisplay = (logEntry) => {
  if (!logEntry || typeof logEntry !== 'object') return String(logEntry);

  const atTime = (ts) => {
    try {
      return new Date(ts).toISOString();
    } catch (e) {
      return String(ts || '');
    }
  };

  const seq = typeof logEntry.sequence === 'number' ? `[${logEntry.sequence}]` : '[?]';
  const time = atTime(logEntry.timestamp);

  const ev = (logEntry.eventType || '').toUpperCase();
  const p = logEntry.payload || {};
  const player = p.playerId || p.player || p.owner || p.playerId === '' ? p.playerId : (p.player || p.owner || '');

  // Helper to pick a textual card identifier
  const cardIdOrInst = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj.cardId === 'string') return obj.cardId;
    if (typeof obj.instanceId === 'string') return obj.instanceId;
    return JSON.stringify(obj);
  };

  let message = '';

  switch (ev) {
    case 'CARD_PLAYED': {
      // payload: { playerId, cardId, instanceId, destination }
      const who = player || p.playerId || 'player';
      const card = p.cardId || p.card || cardIdOrInst(p.instanceId);
      const dest = (p.destination && (typeof p.destination === 'string' ? p.destination : (p.destination.zone || JSON.stringify(p.destination)))) || p.to || p.addTo || '';
      message = `${who} plays ${card}${dest ? ` -> ${dest}` : ''}`;
      break;
    }

    case 'CARD_MOVED': {
      // payload: { playerId, cardId, from: { zone,.. }, to: { zone,.. } }
      const who = player || 'player';
      const card = p.cardId || p.card || cardIdOrInst(p.instanceId);
      const from = (p.from && (p.from.zone || p.from)) || p.fromZone || '';
      const to = (p.to && (p.to.zone || p.to)) || p.toZone || p.destination || '';
      message = `${who} moves ${card}${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`;
      break;
    }

    case 'ATTACK_DECLARED': {
      // payload: { playerId, attackerId, targetId }
      const who = player || 'player';
      const attacker = p.attackerId || p.attacker || '';
      const target = p.targetId || p.target || '';
      message = `${who} attacks ${target || '(unknown)'} with ${attacker || '(unknown)'}`;
      break;
    }

    case 'DAMAGE_DEALT': {
      // payload: { playerId, target, count }
      const count = Number.isFinite(p.count) ? p.count : (p.damage || p.count || 1);
      const target = p.target || p.side || p.owner || '';
      message = `${count} damage dealt to ${target || '(unknown)'}`;
      break;
    }

    case 'CARD_KO': {
      // payload: { playerId, instanceId, cardId }
      const who = player || p.playerId || p.owner || '';
      const card = p.cardId || p.card || (p.instanceId ? p.instanceId : '');
      message = `${card} K.O.'d${who ? ` (owner ${who})` : ''}`;
      break;
    }

    case 'DON_ATTACHED':
    case 'DON_ADDED_TO_FIELD': {
      // payload: { playerId, targetId, donIds }
      const who = player || p.playerId || '';
      const target = p.targetId || p.target || '';
      const count = Array.isArray(p.donIds) ? p.donIds.length : (p.count || p.moved || (p.attachedDonIds && p.attachedDonIds.length) || 0);
      message = `${who} attached ${count} DON${count === 1 ? '' : 's'} to ${target || '(unknown)'}`;
      break;
    }

    case 'DON_DETACHED':
    case 'DON_DETACHED_FROM_CARD': {
      const who = player || p.playerId || '';
      const target = p.targetId || p.target || '';
      const count = Array.isArray(p.donIds) ? p.donIds.length : (p.count || p.moved || 0);
      message = `${who} detached ${count} DON${count === 1 ? '' : 's'} from ${target || '(unknown)'}`;
      break;
    }

    default: {
      // Fallback generic representation
      let details = '';
      try {
        details = JSON.stringify(p);
      } catch (e) {
        details = String(p);
      }
      message = `${logEntry.eventType || '(event)'}: ${details}`;
      break;
    }
  }

  return `${seq} ${time} ${message}`;
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
