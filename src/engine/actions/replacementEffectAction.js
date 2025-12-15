'use strict';
/*
 * replacementEffectAction.js — Replacement Effect Registration Action
 * =============================================================================
 *
 * This module handles the ActionReplacementEffect action type. It parses
 * a replacement-effect action descriptor and registers a ReplacementEffect
 * object using src/engine/core/replacement.registerReplacement.
 *
 * The implementation is intentionally pragmatic and conservative:
 *  - Supports common action fields (event, duration, target, maxTriggers, actions)
 *  - Sets sourceInstanceId from context.thisCard (if provided)
 *  - Sets ownerId from context.activePlayer or action.ownerId
 *  - Leaves cost/may/condition handling as TODO
 *
 * Returns:
 *  { success: true, id } on success or { success: false, error }
 *
 * Integration:
 *  - Replacement execution (applying nested actions) is not handled here.
 *    The replacement core stores the replacement entry; when an event occurs
 *    the engine calls replacement.checkReplacements to find effects and may
 *    then feed the replacement.actions to the interpreter for execution.
 * =============================================================================
 */

import replacement from '../core/replacement.js';

export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action || action.type !== 'replacementEffect' && action.type !== 'replacement') {
    return { success: false, error: 'invalid action' };
  }

  const evt = action.event || action.eventName;
  if (!evt) return { success: false, error: 'replacement action missing event' };

  // Duration default
  const duration = action.duration || 'permanent';

  // Target selector: accept simple shapes
  let targetSelector = action.target || action.targetSelector || { any: true };
  // Normalize if passed as a plain instanceId string
  if (typeof targetSelector === 'string') targetSelector = { instanceId: targetSelector };

  // maxTriggers
  const maxTriggers = (typeof action.maxTriggers === 'number') ? action.maxTriggers : (typeof action.max_triggers === 'number' ? action.max_triggers : null);

  // Owner and source
  const ownerId = action.ownerId || (context && context.activePlayer) || null;
  const sourceInstanceId = (context && context.thisCard && context.thisCard.instanceId) || action.sourceInstanceId || action.source || null;

  // Build replacement effect object
  const eff = {
    event: evt,
    duration,
    targetSelector,
    maxTriggers,
    ownerId,
    sourceInstanceId,
    // store the nested actions to be executed by the caller (interpreter) when applying replacement
    actions: Array.isArray(action.actions) ? action.actions.slice() : (action.actions ? [action.actions] : []),
    // optional tracking fields
    condition: action.condition || null,
    may: !!action.may,
    cost: action.cost || null
  };

  // Register with core replacement system
  try {
    const reg = replacement.registerReplacement(gameState, eff);
    if (!reg || !reg.success) {
      return { success: false, error: reg && reg.error ? reg.error : 'failed to register replacement' };
    }
    return { success: true, id: reg.id, effect: reg.effect };
  } catch (e) {
    return { success: false, error: String(e) };
  }
};

export default { execute };
