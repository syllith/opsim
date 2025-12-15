'use strict';
/*
 * engine/index.js — Engine façade (minimal)
 * =============================================================================
 * PURPOSE
 *  - Provide a thin engine façade exposing a small set of functions the UI and
 *    hooks expect. For now we implement:
 *      - getTotalPower(gameState, instanceId, options)
 *      - getCardMeta(cardId) (minimal)
 *      - getKeywordsFor(instanceOrCardId) (minimal)
 *      - hasDisabledKeyword(...) (stub)
 *      - Event bus: on/off/emit
 *
 *  - This file intentionally stays small and delegates real work to core modules:
 *      - core/gameState.js
 *      - modifiers/continuousEffects.js
 *      - actions/modifyStat.js (tests use it)
 *
 * NOTES
 *  - getTotalPower consults instance.basePower if present as the printed/base
 *    value. Later we will pull printed base from a card database (src/data/cards).
 *  - getTotalPower calls modifiers.getComputedStat to apply setBase/add and DON.
 * =============================================================================
 */

import EventEmitter from 'events';
import { getCardInstanceById } from './core/gameState.js';
import continuousEffects from './modifiers/continuousEffects.js';

// Minimal event bus (EventEmitter)
const eventBus = new EventEmitter();

/**
 * getCardMeta(cardId)
 * Minimal card meta lookup. For now, we return a placeholder if cardId is null.
 * In future this should read from src/data/cards/ and cache results.
 */
export function getCardMeta(cardId) {
  if (!cardId) {
    return {
      cardId: null,
      cardName: null,
      power: 0,
      cost: 0,
      keywords: [],
      printedText: ''
    };
  }
  // Placeholder: we do not read the actual JSON card database yet.
  return {
    cardId,
    cardName: cardId,
    power: 0,
    cost: 0,
    keywords: [],
    printedText: ''
  };
}

/**
 * getKeywordsFor(instanceOrCardId)
 * If passed an instance object, return its keywords if present,
 * else fallback to printed keywords via getCardMeta.
 */
export function getKeywordsFor(arg) {
  if (!arg) return [];
  // If arg looks like an instance with `instanceId` and `cardId`
  if (typeof arg === 'object' && arg.instanceId) {
    // runtime keywords (if available) otherwise printed
    return Array.isArray(arg.keywords) ? arg.keywords.slice() : (getCardMeta(arg.cardId).keywords || []);
  }
  // else treat arg as cardId string
  return getCardMeta(arg).keywords || [];
}

/**
 * hasDisabledKeyword(...) -> boolean
 * Stub: engine-level keyword disabling not implemented yet.
 */
export function hasDisabledKeyword(/* side, section, keyName, index, keyword */) {
  return false;
}

/**
 * getTotalPower(gameState, instanceId, options = {})
 * options:
 *  - isOwnerTurn: boolean (if true, DON bonus applies)
 *  - fallbackBase: number (used if instance has no basePower)
 *
 * Returns computed power (number).
 */
export function getTotalPower(gameState, instanceId, options = {}) {
  if (!gameState) return 0;
  if (!instanceId) return 0;

  // Locate instance (using gameState helper)
  const res = getCardInstanceById(gameState, instanceId);
  if (!res || !res.instance) {
    // not found
    return 0;
  }
  const inst = res.instance;

  // Determine base power:
  // 1) if instance.basePower present, use it
  // 2) else if options.fallbackBase provided, use it
  // 3) else use 0 (TODO: consult printed card metadata)
  const baseValue = (typeof inst.basePower === 'number') ? inst.basePower : (typeof options.fallbackBase === 'number' ? options.fallbackBase : 0);

  // Delegate to continuousEffects.getComputedStat which implements setBase/add and DON bonus handling
  const computed = continuousEffects.getComputedStat(gameState, instanceId, 'power', baseValue, {
    isOwnerTurn: !!options.isOwnerTurn
  });

  return computed;
}

/**
 * getGameStateSnapshot(gameState)
 * Minimal helper to return a deep copy snapshot for UI. Uses JSON clone for now.
 */
export function getGameStateSnapshot(gameState) {
  if (!gameState) return null;
  // Note: Cloning large state with JSON is acceptable for test/demo. Replace with structuredClone later.
  return JSON.parse(JSON.stringify(gameState));
}

/**
 * Event bus helpers
 */
export function on(evt, handler) {
  eventBus.on(evt, handler);
}
export function off(evt, handler) {
  eventBus.off(evt, handler);
}
export function emit(evt, payload) {
  eventBus.emit(evt, payload);
}

/* Default export */
export default {
  getCardMeta,
  getKeywordsFor,
  hasDisabledKeyword,
  getTotalPower,
  getGameStateSnapshot,
  on,
  off,
  emit
};
