'use strict';
/*
 * koAction.js — KO Action Handler (effect-based KO)
 * =============================================================================
 *
 * Responsibilities:
 *  - Resolve targets from action.target (simple forms supported)
 *  - Filter targets to characters on the field
 *  - For each target:
 *      * Check replacement effects (event: 'wouldBeKO') and apply the first replacement found
 *      * If replacement applied -> record replaced:true and skip KO
 *      * Otherwise call core.ko(gameState, instanceId, 'effect')
 *
 * Action shape (supported minimal):
 * {
 *   type: 'ko',
 *   target: <instanceId|string|array|object>,
 *   may?: boolean,         // optional - if may=true and context.confirm===false, do nothing
 *   condition?: <ignored>, // optional - not evaluated by this minimal impl
 * }
 *
 * Result:
 *  {
 *    success: true,
 *    results: [
 *      { instanceId, status: 'koed'|'replaced'|'skipped'|'invalid', error?, replacementId? }
 *    ]
 *  }
 *
 * This implementation intentionally keeps selectors minimal: common use-cases like
 * passing a single instanceId or an array of instanceIds are supported. If you
 * need rich selectors later, integrate src/engine/rules/selector.js.
 * =============================================================================
 */

import { findInstance } from '../core/zones.js';
import koCore from '../core/ko.js';
import replacement from '../core/replacement.js';

export const execute = (gameState, action = {}, context = {}) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action || action.type !== 'ko') return { success: false, error: 'invalid action' };

  // Handle 'may' semantics: if caller specified may=true and context.confirm === false => no-op
  if (action.may === true && context && context.confirm === false) {
    return { success: true, results: [] };
  }

  // Normalize targets to array of instanceIds
  const rawTarget = action.target;
  let targetIds = [];

  if (!rawTarget) {
    return { success: false, error: 'no target specified' };
  }

  if (typeof rawTarget === 'string') {
    targetIds = [rawTarget];
  } else if (Array.isArray(rawTarget)) {
    targetIds = rawTarget.slice();
  } else if (typeof rawTarget === 'object') {
    // Accept shape { instanceId } or { instanceIds: [...] }
    if (rawTarget.instanceId) targetIds = [rawTarget.instanceId];
    else if (Array.isArray(rawTarget.instanceIds)) targetIds = rawTarget.instanceIds.slice();
    else {
      // unsupported selector object - for now error
      return { success: false, error: 'unsupported selector object; provide instanceId or instanceIds' };
    }
  } else {
    return { success: false, error: 'unsupported target type' };
  }

  const results = [];

  for (const tid of targetIds) {
    if (!tid) {
      results.push({ instanceId: tid, status: 'invalid', error: 'empty id' });
      continue;
    }

    const loc = findInstance(gameState, tid);
    if (!loc || !loc.instance) {
      results.push({ instanceId: tid, status: 'invalid', error: 'target not found' });
      continue;
    }

    // Only characters can be KO'd via this action
    if (loc.zone !== 'char' && loc.zone !== 'attached') {
      results.push({ instanceId: tid, status: 'skipped', error: `target in zone ${loc.zone} cannot be KO'd by effect` });
      continue;
    }

    // Check replacement effects for 'wouldBeKO'
    try {
      const chk = replacement.checkReplacements(gameState, 'wouldBeKO', { targetInstanceId: tid, generatorOwner: context && context.activePlayer });
      if (chk && chk.hasReplacement && Array.isArray(chk.effects) && chk.effects.length > 0) {
        // Apply the first replacement (simple policy)
        const repl = chk.effects[0];
        // Apply replacement (we don't execute replacement.actions here)
        const app = replacement.applyReplacement(gameState, repl.id, 'accept');
        results.push({
          instanceId: tid,
          status: 'replaced',
          replacementId: repl.id,
          replacementApplied: !!app.success
        });
        // Skip the KO itself
        continue;
      }
    } catch (e) {
      // If replacement system errors, fall through to attempting KO and record an error
      results.push({ instanceId: tid, status: 'error', error: `replacement check failed: ${String(e)}` });
      continue;
    }

    // No replacement -> perform KO via core ko
    try {
      const k = koCore.ko(gameState, tid, 'effect');
      if (k && k.success) {
        results.push({ instanceId: tid, status: 'koed', movedDonCount: k.movedDonCount || k.movedDonCount === 0 ? k.movedDonCount : k.movedDonCount || k.movedDonCount === 0 ? 0 : k.movedDonCount });
      } else if (k && k.replaced) {
        // koCore returning replaced signals its own replacement handling
        results.push({ instanceId: tid, status: 'replaced', replacements: k.replacements || [] });
      } else {
        results.push({ instanceId: tid, status: 'error', error: (k && k.error) || 'unknown ko error' });
      }
    } catch (e) {
      results.push({ instanceId: tid, status: 'error', error: String(e) });
    }
  }

  return { success: true, results };
};

export default { execute };
