'use strict';

/**
 * evaluator.js — Ability and Effect Evaluator (implemented subset)
 *
 * The implementation focuses on providing:
 * - canActivateAbility: timing, frequency, condition and basic cost checks.
 * - evaluateAbilityCondition: delegating to expressions.js.
 * - getTriggeredAbilities: scan instances for abilities matching timing and condition.
 * - checkFrequency + markAbilityTriggered: simple usage tracking (metadata.abilityUsage).
 * - canPayCost: lightweight checks for common cost objects (restDonFromCostArea,
 *   trashFromHand, restThis, donMinus, multiCost).
 *
 * Notes:
 * - This implementation intentionally keeps some behaviors conservative/simple
 *   to match the engine's current state and test needs. It expects ability
 *   definitions to be found either on the instance as `instance.abilities` or
 *   via engine.getCardMeta(instance.cardId).abilities.
 */

import expressions from './expressions.js';
import * as selectorModule from './selector.js';
import engine from '../index.js';
import donManager from '../modifiers/donManager.js';
import { getCardInstanceById } from '../core/gameState.js';
import zones from '../core/zones.js';

//
// Utilities
//

function _ensureMetadata(gameState) {
  if (!gameState) return;
  if (!gameState.metadata) gameState.metadata = {};
  if (!Array.isArray(gameState.metadata.abilityUsage)) gameState.metadata.abilityUsage = [];
}

/**
 * Find a card instance and return its abilities array (either stored on instance
 * or via engine.getCardMeta(cardId).abilities).
 */
function _getAbilitiesForInstance(gameState, inst) {
  if (!inst) return [];
  if (Array.isArray(inst.abilities)) return inst.abilities;
  // Fallback: ask engine for card meta (engine.getCardMeta currently stubbed,
  // but card JSON may be present in src/data/cards in the future)
  try {
    const meta = engine.getCardMeta(inst.cardId);
    if (meta && Array.isArray(meta.abilities)) return meta.abilities;
  } catch (e) {
    // ignore
  }
  return [];
}

/**
 * timingMatches: flexible comparison between ability timing and a current timing.
 * Supports a couple of convenient equivalences used in the engine:
 * - 'activateMain' <-> 'main'
 * - 'whenAttackingOrOnOpponentsAttack' matches either 'whenAttacking' or 'onOpponentsAttack'
 */
function timingMatches(abilityTiming, currentTiming) {
  if (!abilityTiming || !currentTiming) return false;
  if (abilityTiming === currentTiming) return true;
  if ((abilityTiming === 'activateMain' && currentTiming === 'main') ||
      (abilityTiming === 'main' && currentTiming === 'activateMain')) return true;
  if (abilityTiming === 'whenAttackingOrOnOpponentsAttack' &&
      (currentTiming === 'whenAttacking' || currentTiming === 'onOpponentsAttack')) return true;
  // allow 'whenAttackingOrOnOpponentsAttack' to match both sides
  return false;
}

//
// Implementation
//

/**
 * evaluateAbilityCondition(ability, gameState, context)
 * Delegates to expressions.evaluateCondition; returns true when there's no condition.
 */
export const evaluateAbilityCondition = (ability, gameState, context = {}) => {
  if (!ability) return false;
  if (!ability.condition) return true;
  try {
    return expressions.evaluateCondition(ability.condition, gameState, context);
  } catch (e) {
    // be conservative on errors: treat as false
    return false;
  }
};

/**
 * checkFrequency(gameState, instanceId, ability)
 *
 * Data structure used:
 * gameState.metadata.abilityUsage = [
 *   { instanceId, abilityIndex, frequency, turnNumber, battleId, ts }
 * ]
 */
export const checkFrequency = (gameState, instanceId, ability, abilityIndex = null) => {
  if (!ability || !ability.frequency || ability.frequency === 'none') return { ok: true };

  _ensureMetadata(gameState);
  const usage = gameState.metadata.abilityUsage || [];
  const freq = ability.frequency;

  if (freq === 'oncePerGame') {
    const found = usage.find(u => u.instanceId === instanceId && u.abilityIndex === abilityIndex);
    if (found) return { ok: false, reason: 'Already used this game' };
    return { ok: true };
  }

  if (freq === 'oncePerTurn') {
    const tn = typeof gameState.turnNumber === 'number' ? gameState.turnNumber : null;
    const found = usage.find(u => u.instanceId === instanceId && u.abilityIndex === abilityIndex && u.turnNumber === tn);
    if (found) return { ok: false, reason: 'Already used this turn' };
    return { ok: true };
  }

  if (freq === 'oncePerBattle') {
    // Basic support: uses metadata.currentBattleId if present
    const bid = (gameState.metadata && gameState.metadata.currentBattleId) || null;
    if (bid === null) {
      // If no battle context, conservatively allow (or could disallow)
      return { ok: true };
    }
    const found = usage.find(u => u.instanceId === instanceId && u.abilityIndex === abilityIndex && u.battleId === bid);
    if (found) return { ok: false, reason: 'Already used this battle' };
    return { ok: true };
  }

  // Unknown frequency mode — allow
  return { ok: true };
};

/**
 * Helper - count total DON available to an owner (costArea + attached on leader/characters).
 */
function countTotalDonForOwner(gameState, owner) {
  if (!gameState || !gameState.players || !gameState.players[owner]) return 0;
  const p = gameState.players[owner];
  let total = 0;
  if (Array.isArray(p.costArea)) total += p.costArea.length;
  // leader
  if (p.leader && Array.isArray(p.leader.attachedDons)) total += p.leader.attachedDons.length;
  // characters
  if (Array.isArray(p.char)) {
    for (const ch of p.char) {
      if (ch && Array.isArray(ch.attachedDons)) total += ch.attachedDons.length;
    }
  }
  return total;
}

/**
 * canPayCost(gameState, ability, context)
 *
 * Performs a "can pay?" check for the common cost types. This *does not* pay
 * costs — it only verifies they are possible.
 */
export const canPayCost = (gameState, ability, context = {}) => {
  if (!ability || !ability.cost) return { ok: true };

  // ability.cost may be a single cost object or multiCost
  function _checkOneCost(costObj) {
    if (!costObj || typeof costObj.type !== 'string') return { ok: false, reason: 'Invalid cost object' };

    const owner = (context && context.owner) || (context.thisCard && context.thisCard.owner) || null;
    const thisCard = (context && context.thisCard) || null;

    switch (costObj.type) {
      case 'restDonFromCostArea': {
        const cnt = Number.isInteger(costObj.count) ? costObj.count : 0;
        if (!owner) return { ok: false, reason: 'Missing owner for DON check' };
        const p = gameState.players && gameState.players[owner];
        if (!p) return { ok: false, reason: `owner ${owner} not found` };
        // count active DONs in costArea (treat undefined state as 'active')
        const active = (p.costArea || []).filter(d => d && (d.state === undefined || d.state === 'active')).length;
        if (active < cnt) return { ok: false, reason: `Not enough active DON in cost area: need ${cnt}, have ${active}` };
        return { ok: true };
      }

      case 'donMinus': {
        const cnt = Number.isInteger(costObj.count) ? costObj.count : 0;
        if (!owner) return { ok: false, reason: 'Missing owner for DON- check' };
        const available = countTotalDonForOwner(gameState, owner);
        if (available < cnt) return { ok: false, reason: `Not enough total DON for DON!! −${cnt} (have ${available})` };
        return { ok: true };
      }

      case 'trashFromHand': {
        const ownerKey = (context && context.owner) || (thisCard && thisCard.owner);
        if (!ownerKey) return { ok: false, reason: 'Missing owner for trashFromHand' };
        const p = gameState.players && gameState.players[ownerKey];
        if (!p) return { ok: false, reason: `owner ${ownerKey} not found` };
        const minCards = Number.isInteger(costObj.minCards) ? costObj.minCards : 0;
        if ((p.hand || []).length < minCards) return { ok: false, reason: `Not enough cards in hand to trash (need ${minCards})` };
        // Note: filters or bound choices are not strictly enforced here; we keep it simple.
        return { ok: true };
      }

      case 'restThis': {
        if (!thisCard) return { ok: false, reason: 'restThis requires thisCard in context' };
        // interpret state: prefer state property; otherwise use rested boolean
        const state = thisCard.state || (thisCard.rested ? 'rested' : 'active');
        if (state === 'rested') return { ok: false, reason: 'Card already rested' };
        return { ok: true };
      }

      case 'trashThis': {
        if (!thisCard) return { ok: false, reason: 'trashThis requires thisCard in context' };
        // Many printed costs "trash this" are valid only when self is in hand — we allow if present
        return { ok: true };
      }

      case 'multiCost': {
        if (!Array.isArray(costObj.costs) || costObj.costs.length === 0) return { ok: false, reason: 'multiCost invalid' };
        for (const sub of costObj.costs) {
          const r = _checkOneCost(sub);
          if (!r.ok) return r;
        }
        return { ok: true };
      }

      // Basic selectors-based checks: restFromField, trashFromField, moveFromField, bottomDeckFromField
      // For these we attempt to resolve the selector and ensure some target exists.
      case 'restFromField':
      case 'trashFromField':
      case 'moveFromField':
      case 'bottomDeckFromField': {
        if (!costObj.selector) return { ok: false, reason: `${costObj.type} missing selector` };
        const matches = selectorModule.evaluateSelector(gameState, costObj.selector, context) || [];
        if (!matches.length) return { ok: false, reason: `${costObj.type} selector found no targets` };
        return { ok: true };
      }

      case 'moveFromField': {
        // (handled above) duplicate for clarity; actual behavior checked by selector
        if (!costObj.selector) return { ok: false, reason: 'moveFromField missing selector' };
        const matches = selectorModule.evaluateSelector(gameState, costObj.selector, context) || [];
        if (!matches.length) return { ok: false, reason: 'moveFromField selector found no targets' };
        return { ok: true };
      }

      case 'trashTopDeck': {
        // treat as OK as long as the acting player's deck has at least `count`
        const side = (context && context.owner) || (thisCard && thisCard.owner);
        if (!side) return { ok: false, reason: 'Missing owner for trashTopDeck' };
        const p = gameState.players && gameState.players[side];
        const cnt = Number.isInteger(costObj.count) ? costObj.count : 1;
        const deckLen = (p && p.deck) ? p.deck.length : 0;
        if (deckLen < cnt) return { ok: false, reason: 'Not enough cards in deck to trashTopDeck' };
        return { ok: true };
      }

      default:
        // Unknown cost types: optimistically allow (caller should implement real check if needed)
        return { ok: true };
    }
  }

  // top-level cost: either a single cost or multiCost (schema supports multiCost explicitly)
  if (Array.isArray(ability.cost)) {
    for (const c of ability.cost) {
      const res = _checkOneCost(c);
      if (!res.ok) return res;
    }
    return { ok: true };
  }

  // single cost object
  return _checkOneCost(ability.cost);
};

/**
 * markAbilityTriggered(gameState, instanceId, abilityIndex)
 *
 * Record a usage entry; consumers can use this for frequency checks.
 */
export const markAbilityTriggered = (gameState, instanceId, abilityIndex) => {
  if (!gameState) return gameState;
  _ensureMetadata(gameState);

  // find ability object if possible (to store frequency)
  let frequency = (abilityIndex === null) ? null : null;
  // attempt to locate ability to read frequency
  try {
    const res = getCardInstanceById(gameState, instanceId);
    const inst = res && res.instance;
    const abs = inst ? _getAbilitiesForInstance(gameState, inst) : [];
    const ability = (Number.isInteger(abilityIndex) && abs[abilityIndex]) ? abs[abilityIndex] : null;
    frequency = ability ? ability.frequency : null;
  } catch (e) {
    // ignore
  }

  const record = {
    instanceId,
    abilityIndex: Number.isInteger(abilityIndex) ? abilityIndex : null,
    frequency: frequency || 'none',
    turnNumber: (typeof gameState.turnNumber === 'number') ? gameState.turnNumber : null,
    battleId: (gameState.metadata && gameState.metadata.currentBattleId) || null,
    ts: Date.now()
  };

  gameState.metadata.abilityUsage.push(record);
  return gameState;
};

/**
 * canActivateAbility(gameState, instanceId, abilityIndex, context)
 *
 * Full activation check: timing, frequency, condition, cost.
 * Returns { can: true } or { can: false, reason: '...' }
 */
export const canActivateAbility = (gameState, instanceId, abilityIndex, context = {}) => {
  if (!gameState) return { can: false, reason: 'missing gameState' };
  if (!instanceId) return { can: false, reason: 'missing instanceId' };
  if (!Number.isInteger(abilityIndex)) return { can: false, reason: 'invalid ability index' };

  const instRes = getCardInstanceById(gameState, instanceId);
  if (!instRes || !instRes.instance) return { can: false, reason: 'instance not found' };

  const inst = instRes.instance;
  const owner = instRes.owner;

  const abilities = _getAbilitiesForInstance(gameState, inst);
  if (!Array.isArray(abilities) || !abilities[abilityIndex]) return { can: false, reason: 'ability not found' };
  const ability = abilities[abilityIndex];

  // TIMING: require context.timing or allow activation for appropriate signage
  const currentTiming = context && context.timing ? context.timing : null;
  if (currentTiming) {
    // Only certain timings are activatable; ensure they match
    if (!timingMatches(ability.timing, currentTiming)) {
      return { can: false, reason: `Wrong timing: ability=${ability.timing} current=${currentTiming}` };
    }
  }

  // FREQUENCY
  const freqCheck = checkFrequency(gameState, instanceId, ability, abilityIndex);
  if (!freqCheck.ok) return { can: false, reason: freqCheck.reason || 'Frequency prevents activation' };

  // CONDITION
  const condCtx = Object.assign({}, context, { thisCard: inst, activePlayer: context.activePlayer || owner });
  const condOk = evaluateAbilityCondition(ability, gameState, condCtx);
  if (!condOk) return { can: false, reason: 'Condition not satisfied' };

  // COST
  const costOk = canPayCost(gameState, ability, Object.assign({}, condCtx, { owner }));
  if (!costOk.ok) {
    return { can: false, reason: costOk.reason || 'Cannot pay cost' };
  }

  return { can: true };
};

/**
 * getTriggeredAbilities(gameState, timing, event = {})
 *
 * Find all abilities on all card instances whose timing matches the provided
 * timing and whose conditions (if any) pass. Returns array of:
 *  { instanceId, abilityIndex, ability, ownerId }
 */
export const getTriggeredAbilities = (gameState, timing, event = {}) => {
  if (!gameState) return [];

  const results = [];
  // iterate all players and relevant zones
  const players = gameState.players || {};
  for (const ownerId of Object.keys(players)) {
    const p = players[ownerId];

    // helper to scan a single instance
    function _scanInstance(inst) {
      if (!inst) return;
      const abs = _getAbilitiesForInstance(gameState, inst);
      if (!Array.isArray(abs) || !abs.length) return;
      for (let i = 0; i < abs.length; i++) {
        const a = abs[i];
        if (!a || !a.timing) continue;
        if (!timingMatches(a.timing, timing)) continue;
        // evaluate condition in a context that includes thisCard and activePlayer
        const ctx = Object.assign({}, event.context || {}, { thisCard: inst, activePlayer: event.activePlayer || ownerId });
        if (!evaluateAbilityCondition(a, gameState, ctx)) continue;
        results.push({ instanceId: inst.instanceId, abilityIndex: i, ability: a, ownerId });
      }
    }

    // leader, stage, char[], life[] (include life to find [Trigger] abilities)
    if (p.leader) _scanInstance(p.leader);
    if (p.stage) _scanInstance(p.stage);
    (p.char || []).forEach(_scanInstance);
    (p.hand || []).forEach(_scanInstance);
    (p.trash || []).forEach(_scanInstance);
    (p.life || []).forEach(_scanInstance);
  }

  return results;
};

export default {
  canActivateAbility,
  evaluateAbilityCondition,
  getTriggeredAbilities,
  checkFrequency,
  canPayCost,
  markAbilityTriggered
};
