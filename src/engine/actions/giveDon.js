'use strict';
/*
 * giveDon.js — Give DON Action Handler (implementation)
 * =============================================================================
 * Implements execute(gameState, action, context) for ActionGiveDon.
 *
 * Simplified behavior for now:
 *  - action: { type:'giveDon', count, enterRested?, side?, target: instanceIdOrObj, sourceDonState?, may? }
 *  - context: { activePlayer } — used as owner by default
 *
 * Returns:
 *  { success: true, moved, newGivenCount, attachedDonIds }
 *  or { success: false, error }
 *
 * This implementation delegates the actual movement to src/engine/modifiers/donManager.js
 * and performs basic validation of the target.
 */
import { findInstance } from '../core/zones.js';
import donManager from '../modifiers/donManager.js';

/**
 * Helper: resolveOwner(context, action)
 */
function resolveOwner(context = {}, action = {}) {
  if (context && context.activePlayer) return context.activePlayer;
  if (action && action.side) return action.side;
  return 'player';
}

/**
 * Helper: resolveTargetInstanceId(action)
 * Accepts:
 *   - string (instanceId)
 *   - object with instanceId property
 */
function resolveTargetInstanceId(action) {
  if (!action) return null;
  if (typeof action.target === 'string') return action.target;
  if (action.target && typeof action.target === 'object' && action.target.instanceId) return action.target.instanceId;
  // legacy: maybe action.targetInstanceId
  if (action.targetInstanceId && typeof action.targetInstanceId === 'string') return action.targetInstanceId;
  return null;
}

/**
 * execute(gameState, action, context)
 */
export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action) return { success: false, error: 'missing action' };

  const count = Number.isInteger(action.count) && action.count > 0 ? action.count : 1;
  const owner = resolveOwner(context, action);
  const targetInstanceId = resolveTargetInstanceId(action);

  if (!targetInstanceId) return { success: false, error: 'missing target' };

  // Validate target exists and is on field
  const loc = findInstance(gameState, targetInstanceId);
  if (!loc || !loc.instance) return { success: false, error: `target ${targetInstanceId} not found` };

  // Validate target zone: allow leader or char
  if (loc.zone !== 'leader' && loc.zone !== 'char' && loc.zone !== 'stage') {
    return { success: false, error: `invalid target zone: ${loc.zone}` };
  }

  // Delegate to donManager; it will move up to count available DONs.
  const res = donManager.giveDon(gameState, owner, targetInstanceId, count);
  if (!res || !res.success) {
    // If may option is true, allow non-fatal result (partial or none) — here we just return the result
    return { success: false, error: res && res.error ? res.error : 'giveDon failed' };
  }

  // Optionally set enterRested on attached DONs
  if (action.enterRested && Array.isArray(res.attachedDonIds) && res.attachedDonIds.length > 0) {
    for (const donId of res.attachedDonIds) {
      const donLoc = findInstance(gameState, donId);
      if (donLoc && donLoc.instance) {
        donLoc.instance.state = 'rested';
      }
    }
  }

  return {
    success: true,
    moved: res.moved,
    newGivenCount: res.newGivenCount,
    attachedDonIds: res.attachedDonIds || []
  };
};

export default { execute };
