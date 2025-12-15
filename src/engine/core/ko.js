'use strict';
/*
 * ko.js — KO Processing System (basic implementation)
 * =============================================================================
 * PURPOSE:
 *  - Implement a conservative KO flow useful for battle and effect-driven KOs.
 *  - This implementation focuses on correctness for the common flow:
 *      * detach DONs
 *      * remove modifiers
 *      * move to trash
 *      * trigger post-KO hooks (placeholder)
 *
 *  - More advanced behavior (replacement checks, trigger interrupts, immunity checks)
 *    are stubbed or simplified for now.
 * =============================================================================
 */

import zones from './zones.js';
import donManager from '../modifiers/donManager.js';
import continuousEffects from '../modifiers/continuousEffects.js';

const { findInstance, removeInstance } = zones;

/**
 * canBeKOd(gameState, instanceId)
 * Placeholder that returns true unless an immunity modifier exists (not implemented).
 */
export const canBeKOd = (gameState, instanceId) => {
  // TODO: Check for KO-immunity continuous effects / permanent effects
  return true;
};

/**
 * wouldBeKO(gameState, instanceId, cause)
 * Placeholder: checks for replacement effects. Currently we don't have replacement
 * effects implemented here, so always return no replacement available.
 */
export const wouldBeKO = (gameState, instanceId, cause = 'effect') => {
  // TODO: integrate with replacement effect system
  return { hasReplacement: false, effects: [], canBeKOd: canBeKOd(gameState, instanceId) };
};

/**
 * processKOAbilities(gameState, koedCardId, cause)
 * Placeholder that triggers [On K.O.] or other KO-related abilities.
 * For now this is a no-op. Real implementation should evaluate abilities and
 * schedule/resolve them in the proper timing window.
 */
export const processKOAbilities = (gameState, koedCardId, cause = 'effect') => {
  // TODO: Evaluate abilities on the trashed card and on other cards that react
  return gameState;
};

/**
 * ko(gameState, instanceId, cause)
 *
 * Main KO processing flow (conservative):
 * 1. Validate target exists and is a Character on field
 * 2. Check canBeKOd
 * 3. Check wouldBeKO (replacements) — if replacement present, return info
 * 4. Detach DONs: return any attached DONs to owner's costArea (rested)
 * 5. Remove continuous modifiers targeting instance
 * 6. Remove instance from field and move to owner's trash
 * 7. Call processKOAbilities
 */
export const ko = (gameState, instanceId, cause = 'effect') => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  // Find instance on field
  const loc = findInstance(gameState, instanceId);
  if (!loc || !loc.instance) return { success: false, error: 'instance not found on field' };

  const { instance, zone, owner } = loc;

  // Only characters on the field should be KO'd by this flow (leaders handled elsewhere)
  if (zone !== 'char' && zone !== 'attached') {
    return { success: false, error: `instance ${instanceId} in zone ${zone} cannot be KO'd by ko()` };
  }

  // Check canBeKOd
  if (!canBeKOd(gameState, instanceId)) {
    return { success: false, error: 'instance is currently immune to KO' };
  }

  // Check replacement effects (TODO)
  const rep = wouldBeKO(gameState, instanceId, cause);
  if (rep && rep.hasReplacement) {
    return { success: false, replaced: true, replacements: rep.effects };
  }

  // 1) Detach all: if attachedDons exists, return them
  let movedDonCount = 0;
  try {
    if (Array.isArray(instance.attachedDons) && instance.attachedDons.length > 0) {
      const toReturn = instance.attachedDons.length;
      const ret = donManager.returnDonFromCard(gameState, instanceId, toReturn);
      if (ret && ret.success) {
        movedDonCount = ret.moved || 0;
        // mark returned dons as rested (returnDonFromCard already sets don.zone and placed)
        if (Array.isArray(ret.returnedDonIds)) {
          for (const id of ret.returnedDonIds) {
            const rloc = findInstance(gameState, id);
            if (rloc && rloc.instance) rloc.instance.state = 'rested';
          }
        }
      }
    }
  } catch (e) {
    // non-fatal — continue with KO but record info
    // console.warn('Error returning DONs during KO:', e);
  }

  // 2) Remove modifiers that target this instance
  try {
    continuousEffects.removeModifiersForInstance(gameState, instanceId);
  } catch (e) {
    // non-fatal
  }

  // 3) Move the instance to trash
  // removeInstance returns the removed instance object
  const removed = removeInstance(gameState, instanceId);
  if (!removed) {
    return { success: false, error: 'failed to remove instance from field' };
  }

  // Ensure trash exists
  if (!gameState.players || !gameState.players[owner]) {
    return { success: false, error: `owner ${owner} not found` };
  }
  const ownerObj = gameState.players[owner];
  if (!Array.isArray(ownerObj.trash)) ownerObj.trash = [];

  // Set zone and push to trash
  removed.zone = 'trash';
  ownerObj.trash.push(removed);

  // 4) Process KO abilities (placeholder)
  try {
    processKOAbilities(gameState, removed.instanceId, cause);
  } catch (e) {
    // Ignore for now
  }

  return {
    success: true,
    instanceId: removed.instanceId,
    owner,
    movedDonCount
  };
};

export default {
  ko,
  wouldBeKO,
  processKOAbilities,
  canBeKOd
};
