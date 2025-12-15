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
import cardLoader from './cardLoader.js';

// Minimal event bus (EventEmitter)
const eventBus = new EventEmitter();

// Prompt handlers registry for request/response style prompts
const promptHandlers = new Map();

/**
 * registerPromptHandler(name, handler)
 * Register a handler for a prompt type. Handler signature: (payload) => Promise<response> or sync result.
 * @param {string} name - The prompt name (e.g., 'lifeTrigger', 'blocker', 'counter', 'replacement')
 * @param {function} handler - Handler function that receives payload and returns response
 */
export function registerPromptHandler(name, handler) {
  if (typeof name !== 'string' || typeof handler !== 'function') {
    throw new Error('registerPromptHandler requires a name string and handler function');
  }
  promptHandlers.set(name, handler);
}

/**
 * unregisterPromptHandler(name)
 * Remove a registered prompt handler.
 * @param {string} name - The prompt name to unregister
 */
export function unregisterPromptHandler(name) {
  promptHandlers.delete(name);
}

/**
 * prompt(name, payload)
 * Call a registered prompt handler and return its result as a Promise.
 * If no handler is registered, returns a default safe resolution (null).
 * This allows engine modules to pause and wait for UI response.
 * 
 * @param {string} name - The prompt type
 * @param {object} payload - Data to pass to the handler
 * @returns {Promise<any>} - The handler's response or null if no handler
 */
export function prompt(name, payload) {
  const handler = promptHandlers.get(name);
  if (!handler) {
    // No handler registered - return default resolution
    // Default behaviors:
    // - lifeTrigger: addToHand (safer default)
    // - blocker: null (no blocker, or first if available)
    // - counter: empty arrays (no counters)
    // - replacement: decline
    return Promise.resolve(null);
  }
  try {
    const result = handler(payload);
    // Ensure we always return a Promise
    if (result && typeof result.then === 'function') {
      return result;
    }
    return Promise.resolve(result);
  } catch (e) {
    // Handler threw - return null as safe fallback
    return Promise.resolve(null);
  }
}

/**
 * hasPromptHandler(name)
 * Check if a prompt handler is registered.
 * @param {string} name - The prompt name to check
 * @returns {boolean}
 */
export function hasPromptHandler(name) {
  return promptHandlers.has(name);
}

/**
 * getCardMeta(cardId)
 * Card meta lookup using cardLoader. Returns card metadata or a placeholder if not found.
 */
export function getCardMeta(cardId) {
  if (!cardId) {
    return {
      cardId: null,
      cardName: null,
      power: 0,
      cost: 0,
      keywords: [],
      abilities: [],
      printedText: ''
    };
  }
  
  // Try to get from cardLoader
  const meta = cardLoader.getCardMeta(cardId);
  if (meta) {
    return meta;
  }
  
  // Fallback: return placeholder for unknown cards
  return {
    cardId,
    cardName: cardId,
    power: 0,
    cost: 0,
    keywords: [],
    abilities: [],
    printedText: ''
  };
}

/**
 * loadCardData()
 * Initialize card data loading. Call this at startup.
 */
export async function loadCardData() {
  return cardLoader.loadCards();
}

/**
 * isCardDataLoaded()
 * Check if card data has been loaded.
 */
export function isCardDataLoaded() {
  return cardLoader.isLoaded();
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
  // Card data loading
  loadCardData,
  isCardDataLoaded,
  // Event bus
  on,
  off,
  emit,
  // Prompt API for interactive choice points
  registerPromptHandler,
  unregisterPromptHandler,
  prompt,
  hasPromptHandler
};
