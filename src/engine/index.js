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
import promptManager from './core/promptManager.js';
import { conductBattle as coreConductBattle } from './core/battle.js';
import * as damageAndLife from './core/damageAndLife.js';
import interpreter from './actions/interpreter.js';

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

// =============================================================================
// Default Prompt Handlers (forward to promptManager)
// =============================================================================

/**
 * _forwardPromptToPromptManager(payload, playerIdFromPayload)
 * 
 * Helper to forward a prompt to promptManager.requestChoice and return selection.
 * This bridges the engine.prompt() system with promptManager, enabling the UI
 * to receive prompts via engine.on('prompt') and submit choices via promptManager.submitChoice.
 * 
 * IMPORTANT: If there are no listeners for the 'prompt' event, this returns null
 * immediately to preserve backward compatibility with tests and non-interactive use.
 * 
 * @param {object} payload - The prompt payload (becomes choiceSpec)
 * @param {string} playerIdFromPayload - The playerId extracted from payload
 * @returns {Promise<any>} - The player's selection or null
 */
async function _forwardPromptToPromptManager(payload, playerIdFromPayload) {
  const playerId = playerIdFromPayload 
    || payload?.defenderOwner 
    || payload?.side 
    || payload?.playerId 
    || payload?.lifeCard?.owner;
  
  if (!playerId) return null;

  // Check if there are any listeners for the 'prompt' event.
  // If no listeners exist (e.g., tests without UI, headless operation),
  // return null immediately to preserve fallback behavior.
  const listenerCount = eventBus.listenerCount('prompt');
  if (listenerCount === 0) {
    // No UI/transport listening - return null for auto-fallback behavior
    return null;
  }

  // Use payload itself as choiceSpec so UI can render payload-specific fields
  // (handCounterCandidates, lifeCard, blockers, etc.)
  const { promise } = promptManager.requestChoice(
    payload.gameState, 
    playerId, 
    payload, 
    { timeoutMs: null, debug: { via: 'engine-default-handler' } }
  );

  try {
    const { selection } = await promise; // resolves { selection, promptId }
    // The UI / promptManager should return an object that matches engine's expectation
    return selection || null;
  } catch (e) {
    // On timeout or cancel, return null to preserve existing fallback behavior
    return null;
  }
}

// Register default handlers for the commonly used prompt types:
// These handlers forward to promptManager, enabling interactive prompt flow.
registerPromptHandler('counter', (payload) => 
  _forwardPromptToPromptManager(payload, payload?.defenderOwner)
);

registerPromptHandler('blocker', (payload) => 
  _forwardPromptToPromptManager(payload, payload?.defenderOwner)
);

registerPromptHandler('lifeTrigger', (payload) => 
  _forwardPromptToPromptManager(payload, payload?.side || payload?.lifeCard?.owner)
);

registerPromptHandler('replacement', (payload) => 
  _forwardPromptToPromptManager(payload, payload?.playerId || payload?.side)
);

// =============================================================================
// Battle, Damage, and Interpreter API
// =============================================================================

/**
 * conductBattle(gameState, attackerInstanceId, targetInstanceId)
 * Executes a full battle sequence including blocker step, counter step, and damage resolution.
 * This is async because it may trigger prompts for blocker/counter selection.
 * 
 * @param {object} gameState - The game state object (will be mutated)
 * @param {string} attackerInstanceId - Instance ID of the attacking card
 * @param {string} targetInstanceId - Instance ID of the target (leader or rested character)
 * @returns {Promise<object>} - Battle result { success, attackerPower, defenderPower, blockedBy, ... }
 */
export async function conductBattle(gameState, attackerInstanceId, targetInstanceId) {
  return coreConductBattle(gameState, attackerInstanceId, targetInstanceId);
}

/**
 * dealDamageToLeader(gameState, side, count, options)
 * Deal damage to a leader, processing life cards and triggering prompts for trigger abilities.
 * 
 * @param {object} gameState - The game state object (will be mutated)
 * @param {string} side - 'player' or 'opponent' (the side taking damage)
 * @param {number} count - Number of damage to deal (default 1)
 * @param {object} options - { banish: boolean, allowTriggers: boolean }
 * @returns {Promise<object>} - Result { success, moved, triggers, banished, defeat? }
 */
export async function dealDamageToLeader(gameState, side, count = 1, options = {}) {
  return damageAndLife.dealDamageToLeader(gameState, side, count, options);
}

/**
 * executeAction(gameState, action, context)
 * Execute an action descriptor through the interpreter.
 * Supported action types: moveCard, playCard, modifyStat, giveDon, dealDamage, getTotalPower.
 * 
 * @param {object} gameState - The game state object (will be mutated)
 * @param {object} action - Action descriptor { type, ...params }
 * @param {object} context - Optional context (owner, source, etc.)
 * @returns {object} - Action result { success, ...result }
 */
export function executeAction(gameState, action, context = {}) {
  return interpreter.executeAction(gameState, action, context);
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
  hasPromptHandler,
  // Battle, damage, and interpreter API
  conductBattle,
  dealDamageToLeader,
  executeAction
};
