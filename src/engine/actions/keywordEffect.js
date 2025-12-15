'use strict';
/*
 * keywordEffect.js — Keyword Effect Action Handler
 *
 * Minimal, practical implementation:
 *  - Supports simple target shapes: string id, array of ids, {instanceId}, {instanceIds}
 *  - Supports operations: 'grant', 'revoke', 'static'
 *  - Honors `may` (if may:true and context.confirm===false -> no-op success)
 *  - Registers modifiers via keywordManager
 */

import keywordManager from '../modifiers/keywordManager.js';

/**
 * normalizeTargets(action.target) -> array of instanceIds
 */
function normalizeTargets(target) {
  if (!target) return [];
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.slice();
  if (typeof target === 'object') {
    if (target.instanceId) return [target.instanceId];
    if (Array.isArray(target.instanceIds)) return target.instanceIds.slice();
  }
  return [];
}

export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action || action.type !== 'keywordEffect') return { success: false, error: 'invalid action' };

  // may semantics
  if (action.may === true && context && context.confirm === false) {
    return { success: true, registered: [] };
  }

  const op = (action.operation || '').toLowerCase();
  if (!['grant', 'revoke', 'static'].includes(op)) {
    return { success: false, error: `unknown operation ${action.operation}` };
  }

  const keyword = action.keyword;
  if (!keyword) return { success: false, error: 'missing keyword' };

  const duration = action.duration || (op === 'static' ? 'permanent' : 'permanent');
  const sourceInstanceId = (context && context.thisCard && context.thisCard.instanceId) || action.sourceInstanceId || null;
  const ownerId = action.ownerId || (context && context.activePlayer) || null;

  const targets = normalizeTargets(action.target);
  if (targets.length === 0) {
    return { success: false, error: 'no targets' };
  }

  const registered = [];
  for (const tid of targets) {
    if (!tid) continue;
    if (op === 'grant' || op === 'static') {
      // static = grant permanent, but record operation as grant so engine can compute keywords
      const dur = (op === 'static') ? 'permanent' : duration;
      const r = keywordManager.grantKeyword(gameState, tid, keyword, dur, sourceInstanceId, ownerId);
      if (r && r.success) registered.push(r.id || r.modifier && r.modifier.id);
    } else if (op === 'revoke') {
      const r = keywordManager.revokeKeyword(gameState, tid, keyword, duration, sourceInstanceId, ownerId);
      if (r && r.success) registered.push(r.id || r.modifier && r.modifier.id);
    }
  }

  return { success: true, registered };
};

export default { execute };
