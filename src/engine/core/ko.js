'use strict';
/*
 * ko.js — KO Processing System (implemented)
 *
 * This module implements a pragmatic KO flow:
 *  - canBeKOd: checks for static preventKO abilities
 *  - wouldBeKO: checks replacement.registered replacements for 'wouldBeKO'
 *  - processKOAbilities: fires onKO abilities and executes their actions
 *  - ko: main flow (detach dons, remove modifiers, move to trash, process KO abilities)
 */

import zones from './zones.js';
import donManager from '../modifiers/donManager.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import replacement from './replacement.js';
import expressions from '../rules/expressions.js';
import evaluator from '../rules/evaluator.js';
import interpreter from '../actions/interpreter.js';

const { findInstance, removeInstance } = zones;

/**
 * canBeKOd(gameState, instanceId, cause='effect')
 * Returns true if the instance can be K.O.'d by the given cause.
 * Checks for static preventKO abilities on the instance.
 */
export const canBeKOd = (gameState, instanceId, cause = 'effect') => {
  if (!gameState || !instanceId) return true;

  // find the instance
  const loc = findInstance(gameState, instanceId);
  if (!loc || !loc.instance) return true;

  const inst = loc.instance;

  // Abilities could be on instance.abilities or card meta; prefer instance
  const abilities = Array.isArray(inst.abilities) ? inst.abilities.slice() : (inst.abilities || []);

  // Build event context used to evaluate preventKO condition
  const eventType = (cause === 'effect') ? 'effectKO' : (cause === 'battle' ? 'battleKO' : 'effectKO');
  const context = {
    eventType,
    koTarget: 'this',
    thisCard: inst,
    activePlayer: loc.owner
  };

  // Scan static abilities for preventKO actions
  for (const ab of abilities) {
    if (!ab || ab.timing !== 'static') continue;
    // If there's no actions, skip
    const actions = Array.isArray(ab.actions) ? ab.actions : (ab.actions ? [ab.actions] : []);
    for (const act of actions) {
      if (!act) continue;
      if (act.type === 'preventKO') {
        // If preventKO has a condition, evaluate it. If no condition, assume prevention.
        const cond = act.condition || ab.condition || null;
        if (!cond) {
          // unconditional prevention for this timing -> cannot be KO'd
          return false;
        }
        try {
          // We want expressions to resolve both instance fields and event/context fields
          // so build a card-like object merging instance and context properties.
          const cardContext = Object.assign({}, inst, context);
          const ok = expressions.evaluateExpression(cond, cardContext, gameState, context);
          if (ok) return false;
        } catch (e) {
          // conservative: treat evaluation errors as not preventing KO
        }
      }
    }
  }

  // No prevention found
  return true;
};

/**
 * wouldBeKO(gameState, instanceId, cause = 'effect')
 *
 * Check replacement effects registered via replacement.js for the event 'wouldBeKO'.
 * Returns: { hasReplacement: boolean, effects: [], canBeKOd: boolean }
 */
export const wouldBeKO = (gameState, instanceId, cause = 'effect') => {
  if (!gameState || !instanceId) return { hasReplacement: false, effects: [], canBeKOd: true };

  // Ask replacement system for 'wouldBeKO' replacements, pass generatorOwner === owner if available
  const loc = findInstance(gameState, instanceId);
  const owner = loc && loc.owner ? loc.owner : null;
  try {
    const chk = replacement.checkReplacements(gameState, 'wouldBeKO', { targetInstanceId: instanceId, generatorOwner: owner });
    if (chk && chk.hasReplacement) {
      return { hasReplacement: true, effects: chk.effects, canBeKOd: canBeKOd(gameState, instanceId, cause) };
    }
  } catch (e) {
    // On error, behave conservatively: no replacement found
  }

  // Also respect static preventKO rules via canBeKOd
  const can = canBeKOd(gameState, instanceId, cause);
  return { hasReplacement: false, effects: [], canBeKOd: can };
};

/**
 * processKOAbilities(gameState, koedCardId, cause='effect')
 *
 * Finds all abilities that trigger on 'onKO' timing and executes their actions.
 * Uses evaluator.getTriggeredAbilities to locate applicable abilities, then
 * executes each action via the interpreter. Abilities are marked via evaluator.markAbilityTriggered.
 *
 * This implementation executes the abilities immediately and synchronously, which
 * is acceptable for deterministic engine tests. In a full engine we'd schedule
 * these into the rule/timing queue.
 */
export const processKOAbilities = (gameState, koedCardId, cause = 'effect') => {
  if (!gameState || !koedCardId) return gameState;

  // Build event payload passed to evaluator: this will be merged into each ability's condition context
  const event = {
    koedCardId,
    cause,
    // activePlayer left undefined — evaluator will set it to each ability owner if not provided
  };

  // Get triggered abilities for 'onKO' timing
  let triggered = [];
  try {
    triggered = evaluator.getTriggeredAbilities(gameState, 'onKO', event);
  } catch (e) {
    // If evaluator fails, bail out gently
    return gameState;
  }

  if (!Array.isArray(triggered) || triggered.length === 0) return gameState;

  for (const t of triggered) {
    try {
      // Mark the ability as used (respect oncePerTurn/oncePerGame)
      evaluator.markAbilityTriggered(gameState, t.instanceId, t.abilityIndex, t.ability);

      // Execute each action in the ability
      const actions = Array.isArray(t.ability.actions) ? t.ability.actions : (t.ability.actions ? [t.ability.actions] : []);
      for (const act of actions) {
        if (!act) continue;
        // Provide a context: set activePlayer to ownerId and include event fields
        const ctx = Object.assign({}, event, { activePlayer: t.ownerId });
        try {
          interpreter.executeAction(gameState, act, ctx);
        } catch (e) {
          // swallow action errors so KO flow continues; a real engine should log
        }
      }
    } catch (e) {
      // continue processing others even if one ability errors
    }
  }

  return gameState;
};

/**
 * ko(gameState, instanceId, cause)
 *
 * Main KO processing flow:
 *  - validate
 *  - canBeKOd
 *  - wouldBeKO (replacements)
 *  - detach DONs
 *  - remove continuous effects
 *  - remove from field -> trash
 *  - processKOAbilities
 */
export const ko = (gameState, instanceId, cause = 'effect') => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  const loc = findInstance(gameState, instanceId);
  if (!loc || !loc.instance) return { success: false, error: 'instance not found on field' };

  const { instance, zone, owner } = loc;

  if (zone !== 'char' && zone !== 'attached') {
    return { success: false, error: `instance ${instanceId} in zone ${zone} cannot be KO'd by ko()` };
  }

  // Check static/prevent immunity
  if (!canBeKOd(gameState, instanceId, cause)) {
    return { success: false, error: 'instance is currently immune to KO' };
  }

  // Check replacements
  const rep = wouldBeKO(gameState, instanceId, cause);
  if (rep && rep.hasReplacement) {
    return { success: false, replaced: true, replacements: rep.effects };
  }

  // Detach DONs
  let movedDonCount = 0;
  try {
    if (Array.isArray(instance.attachedDons) && instance.attachedDons.length > 0) {
      const toReturn = instance.attachedDons.length;
      const ret = donManager.returnDonFromCard(gameState, instanceId, toReturn);
      if (ret && ret.success) {
        movedDonCount = ret.moved || 0;
        if (Array.isArray(ret.returnedDonIds)) {
          for (const id of ret.returnedDonIds) {
            const rloc = findInstance(gameState, id);
            if (rloc && rloc.instance) rloc.instance.state = 'rested';
          }
        }
      }
    }
  } catch (e) {
    // non-fatal
  }

  // Remove modifiers
  try {
    continuousEffects.removeModifiersForInstance(gameState, instanceId);
  } catch (e) {
    // non-fatal
  }

  // Remove and push to trash
  const removed = removeInstance(gameState, instanceId);
  if (!removed) return { success: false, error: 'failed to remove instance from field' };

  if (!gameState.players || !gameState.players[owner]) return { success: false, error: `owner ${owner} not found` };
  const ownerObj = gameState.players[owner];
  if (!Array.isArray(ownerObj.trash)) ownerObj.trash = [];

  removed.zone = 'trash';
  ownerObj.trash.push(removed);

  // Process KO abilities
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
