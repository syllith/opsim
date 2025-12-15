'use strict';
/*
 * replacement.js — Minimal Replacement Effect System
 * =============================================================================
 *
 * This module implements a pragmatic replacement-effect system sufficient for
 * early engine flows and tests. It intentionally avoids complex selector parsing
 * or UI-driven cost prompts; instead it provides a clean API and sensible
 * defaults that can be extended later.
 *
 * Key features implemented:
 *  - registerReplacement(gameState, effect): add a replacement to gameState.activeReplacements
 *  - checkReplacements(gameState, eventName, eventPayload): find applicable replacements
 *  - applyReplacement(gameState, replacementId, choice): mark trigger / remove when exhausted
 *  - expireReplacements(gameState, trigger): remove replacements by duration
 *  - getActiveReplacements(gameState)
 *
 * Simplifying assumptions (for now):
 *  - targetSelector is a lightweight object { instanceId?, owner?, any?:true }.
 *  - Matching is done using instanceId equality or owner equality or 'any' fallback.
 *  - No costs or player prompts are implemented yet.
 *  - Precedence: results are returned in registration order. If the eventPayload
 *    includes a generatorOwner, we bump effects owned by that generator first.
 *
 * This file is designed to be easy to reason about and extend as the engine
 * grows: later we can plug in full selector evaluation (src/engine/rules/selector.js)
 * and interpreter-driven execution of replacement actions.
 * =============================================================================
 */

// Helper to ensure activeReplacements exists on gameState
function _ensureActiveReplacements(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Array.isArray(gameState.activeReplacements)) gameState.activeReplacements = [];
}

/**
 * generateReplacementId(gameState)
 * Mutates gameState to keep a monotonically increasing replacement id counter.
 */
function generateReplacementId(gameState) {
  if (typeof gameState.nextReplacementId !== 'number') gameState.nextReplacementId = 1;
  const id = `repl-${gameState.nextReplacementId}`;
  gameState.nextReplacementId += 1;
  return id;
}

/**
 * normalizeEffect(effect)
 * Ensure required fields and defaults.
 */
function normalizeEffect(effect) {
  const e = Object.assign({}, effect);
  if (!e.event) throw new Error('replacement effect must have event');
  if (!e.duration) e.duration = 'permanent';
  if (typeof e.triggerCount !== 'number') e.triggerCount = 0;
  if (typeof e.maxTriggers === 'undefined') e.maxTriggers = null;
  if (!e.ownerId && e.sourceOwner) e.ownerId = e.sourceOwner;
  return e;
}

/**
 * registerReplacement(gameState, effect)
 * Adds the effect to gameState.activeReplacements and returns { success, id }.
 */
export const registerReplacement = (gameState, effect) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!effect || typeof effect !== 'object') return { success: false, error: 'invalid effect' };

  _ensureActiveReplacements(gameState);

  let e;
  try {
    e = normalizeEffect(effect);
  } catch (err) {
    return { success: false, error: String(err) };
  }

  if (!e.id) {
    e.id = generateReplacementId(gameState);
  }
  if (!e.sourceInstanceId && e.source) e.sourceInstanceId = e.source;
  if (!e.targetSelector) e.targetSelector = { any: true };

  // track registration time for stable ordering
  e._registeredAt = Date.now();

  // ensure triggerCount numeric
  if (typeof e.triggerCount !== 'number') e.triggerCount = 0;

  gameState.activeReplacements.push(e);
  return { success: true, id: e.id, effect: e };
};

/**
 * _matchesTarget(effect, eventPayload)
 * Minimal target-matching:
 * - If effect.targetSelector.instanceId exists: match eventPayload.targetInstanceId
 * - Else if effect.targetSelector.owner exists: match eventPayload.owner or targetOwner
 * - Else if targetSelector.any === true => match anything
 */
function _matchesTarget(effect, eventPayload = {}) {
  const sel = effect.targetSelector || {};
  // instanceId match
  if (sel.instanceId) {
    return eventPayload && eventPayload.targetInstanceId && sel.instanceId === eventPayload.targetInstanceId;
  }
  // owner match: eventPayload.owner or eventPayload.targetOwner
  if (sel.owner) {
    const ownerField = eventPayload.owner || eventPayload.targetOwner || eventPayload.targetOwnerId;
    return ownerField === sel.owner;
  }
  // any
  if (sel.any) return true;
  // fallback: no selector -> treat as any
  return true;
}

/**
 * checkReplacements(gameState, eventName, eventPayload = {})
 *
 * Returns:
 *   { hasReplacement: boolean, effects: ReplacementEffect[], gameState }
 *
 * Effects are returned in registration order; if eventPayload.generatorOwner is present,
 * effects owned by that generator are moved to the front (simple precedence).
 */
export const checkReplacements = (gameState, eventName, eventPayload = {}) => {
  if (!gameState) return { hasReplacement: false, effects: [], gameState };

  _ensureActiveReplacements(gameState);

  const candidates = [];
  for (const eff of gameState.activeReplacements) {
    if (!eff) continue;
    if (eff.event !== eventName) continue;
    // skip exhausted effects
    if (eff.maxTriggers !== null && typeof eff.maxTriggers === 'number' && eff.triggerCount >= eff.maxTriggers) continue;
    if (_matchesTarget(eff, eventPayload)) {
      candidates.push(eff);
    }
  }

  // Precedence: if generatorOwner provided, bring its effects first
  const generatorOwner = eventPayload && eventPayload.generatorOwner;
  if (generatorOwner) {
    candidates.sort((a, b) => {
      const aIsGen = a.ownerId === generatorOwner ? 0 : 1;
      const bIsGen = b.ownerId === generatorOwner ? 0 : 1;
      if (aIsGen !== bIsGen) return aIsGen - bIsGen;
      // else registration order (by _registeredAt)
      return (a._registeredAt || 0) - (b._registeredAt || 0);
    });
  } else {
    // sort by registration time to ensure stable order
    candidates.sort((a, b) => (a._registeredAt || 0) - (b._registeredAt || 0));
  }

  return { hasReplacement: candidates.length > 0, effects: candidates.slice(), gameState };
};

/**
 * applyReplacement(gameState, replacementId, choice = 'accept')
 *
 * For now this function:
 *  - Locates the replacement
 *  - If choice === 'decline' returns { success: false, error: 'declined' }
 *  - Increments triggerCount and, if maxTriggers reached, removes the replacement
 *  - Returns { success: true, replacement, removed: boolean }
 *
 * Note: executing replacement.actions is not implemented here — that should be
 * done by the interpreter or caller if desired.
 */
export const applyReplacement = (gameState, replacementId, choice = 'accept') => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!replacementId) return { success: false, error: 'missing replacementId' };

  _ensureActiveReplacements(gameState);

  const idx = gameState.activeReplacements.findIndex(r => r && r.id === replacementId);
  if (idx === -1) return { success: false, error: 'replacement not found' };

  const eff = gameState.activeReplacements[idx];

  if (choice === 'decline') {
    return { success: false, error: 'declined' };
  }

  // If maxTriggers set and exhausted, cannot apply
  if (eff.maxTriggers !== null && typeof eff.maxTriggers === 'number' && eff.triggerCount >= eff.maxTriggers) {
    // Remove if exhausted
    gameState.activeReplacements.splice(idx, 1);
    return { success: false, error: 'replacement exhausted and removed' };
  }

  // Increment trigger count
  eff.triggerCount = (eff.triggerCount || 0) + 1;

  // If we've reached maxTriggers, remove the effect
  let removed = false;
  if (eff.maxTriggers !== null && typeof eff.maxTriggers === 'number' && eff.triggerCount >= eff.maxTriggers) {
    gameState.activeReplacements.splice(idx, 1);
    removed = true;
  }

  return { success: true, replacement: eff, removed };
};

/**
 * expireReplacements(gameState, trigger)
 *
 * Removes replacements whose duration maps to the supplied trigger.
 * Mapping:
 *  - trigger === 'turnEnd' removes duration 'thisTurn'
 *  - trigger === 'battleEnd' removes 'thisBattle'
 *  - any exact match removes effects with same duration
 *
 * Returns: { success: true, removed: number }
 */
export const expireReplacements = (gameState, trigger) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  _ensureActiveReplacements(gameState);
  const before = gameState.activeReplacements.length;

  gameState.activeReplacements = gameState.activeReplacements.filter(eff => {
    if (!eff || !eff.duration) return true;
    if (trigger === 'turnEnd' && eff.duration === 'thisTurn') return false;
    if (trigger === 'battleEnd' && eff.duration === 'thisBattle') return false;
    if (trigger === eff.duration) return false;
    return true;
  });

  const after = gameState.activeReplacements.length;
  return { success: true, removed: before - after };
};

/**
 * getActiveReplacements(gameState)
 */
export const getActiveReplacements = (gameState) => {
  _ensureActiveReplacements(gameState);
  return gameState.activeReplacements;
};

export default {
  registerReplacement,
  checkReplacements,
  applyReplacement,
  expireReplacements,
  getActiveReplacements
};
