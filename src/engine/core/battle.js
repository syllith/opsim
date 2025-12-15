'use strict';
/*
 * battle.js — Minimal Battle Engine (sync-or-async counter support)
 * =============================================================================
 *
 * This version keeps conductBattle callable synchronously in the common case
 * (no prompt / immediate counter resolution) but also supports the counter
 * step returning a Promise (for prompt-driven interaction) by returning a
 * Promise from conductBattle when necessary.
 *
 * The function computeDamageAndResolve(...) contains the damage-resolution
 * logic so it can be invoked synchronously or after the counter Promise.
 *
 * The Counter Step currently:
 *  - looks for counter cards in defender hand and, if found, trashes the first
 *    such card and applies its counter value as a +power modifier for thisBattle.
 *
 * =============================================================================
 */

import zones from './zones.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import { dealDamage } from '../actions/dealDamage.js';
import { modifyStat } from '../actions/modifyStat.js';
import engine from '../index.js';

const { findInstance, removeInstance } = zones;

/* -------------------------
   Helper: get instance base power
   ------------------------- */
function _getInstanceBasePower(instance) {
  if (!instance) return 0;
  return typeof instance.basePower === 'number' ? instance.basePower : 0;
}

/* -------------------------
   Helper: compute effective power using continuousEffects
   ------------------------- */
function _computePower(gameState, instance, options = {}) {
  const base = _getInstanceBasePower(instance);
  try {
    return continuousEffects.getComputedStat(gameState, instance.instanceId, 'power', base, options);
  } catch (e) {
    // In error cases return base to avoid breaking battle resolution
    return base;
  }
}

/* -------------------------
   Helper: find an active blocker for a defender (returns first - legacy)
   ------------------------- */
function _findActiveBlocker(gameState, defenderOwner) {
  const blockers = _findActiveBlockers(gameState, defenderOwner);
  return blockers.length > 0 ? blockers[0] : null;
}

/* -------------------------
   Helper: find ALL active blockers for a defender (for prompt flow)
   ------------------------- */
function _findActiveBlockers(gameState, defenderOwner) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.char)) return [];
  const blockers = [];
  for (const c of p.char) {
    if (!c) continue;
    const kws = Array.isArray(c.keywords) ? c.keywords : [];
    if (kws.includes('Blocker') && c.state === 'active') {
      blockers.push(c);
    }
  }
  return blockers;
}

/* -------------------------
   Helper: K.O. character (remove -> trash)
   ------------------------- */
function _koCharacter(gameState, instance) {
  if (!instance || !instance.instanceId) return { success: false, error: 'invalid instance' };
  // remove from field (zones.removeInstance)
  const removed = removeInstance(gameState, instance.instanceId);
  if (!removed) return { success: false, error: 'failed to remove instance for KO' };
  const owner = instance.owner;
  if (!gameState.players || !gameState.players[owner]) {
    return { success: false, error: `owner ${owner} not found` };
  }
  if (!Array.isArray(gameState.players[owner].trash)) gameState.players[owner].trash = [];
  removed.zone = 'trash';
  gameState.players[owner].trash.push(removed);
  return { success: true, instanceId: removed.instanceId, owner };
}

/* -------------------------
   Counter Step implementation (async with prompt support)
   ------------------------- */
/**
 * _performCounterStep(gameState, defenderOwner, targetInstanceId)
 *
 * Prompts the defender to choose counter cards to trash from hand and/or
 * counter Events to activate. Falls back to automatic first-counter behavior
 * if no prompt handler is registered.
 *
 * Returns a Promise resolving to { success, applied, trashedCards, appliedAmount }
 */
async function _performCounterStep(gameState, defenderOwner, targetInstanceId) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.hand)) return { success: true, applied: false };

  // Gather all potential counter cards in hand
  const handCounterCandidates = [];
  const eventCounterCandidates = [];
  
  for (let i = 0; i < p.hand.length; i++) {
    const c = p.hand[i];
    if (!c) continue;
    
    // Hand cards with counter value
    if (typeof c.counter === 'number' && c.counter > 0) {
      handCounterCandidates.push({
        instanceId: c.instanceId,
        cardId: c.cardId,
        counter: c.counter,
        printedName: c.printedName || c.cardId,
        index: i
      });
    }
    
    // Event cards with Counter timing (these have abilities that can be activated)
    const abilities = c.abilities || [];
    const hasCounterAbility = abilities.some(a => a && (a.timing === 'Counter' || a.timing === 'counter'));
    if (hasCounterAbility || (Array.isArray(c.keywords) && c.keywords.includes('Counter'))) {
      eventCounterCandidates.push({
        instanceId: c.instanceId,
        cardId: c.cardId,
        printedName: c.printedName || c.cardId,
        costDesc: c.cost || null,
        printedText: c.printedText || ''
      });
    }
  }
  
  // If no counter options available, return early
  if (handCounterCandidates.length === 0 && eventCounterCandidates.length === 0) {
    return { success: true, applied: false };
  }
  
  // Build prompt payload
  const payload = {
    gameState: engine.getGameStateSnapshot(gameState),
    battleId: gameState.metadata?.currentBattleId || null,
    defenderOwner,
    targetInstanceId,
    handCounterCandidates,
    eventCounterCandidates
  };
  
  // Prompt for counter choice
  const counterRes = await engine.prompt('counter', payload);
  
  let trashedHandIds = [];
  let activatedEventIds = [];
  
  if (counterRes === null) {
    // No handler registered - fallback to auto-trash first counter card (backward compatibility)
    if (handCounterCandidates.length > 0) {
      trashedHandIds = [handCounterCandidates[0].instanceId];
    }
  } else if (counterRes) {
    trashedHandIds = Array.isArray(counterRes.trashedHandIds) ? counterRes.trashedHandIds : [];
    activatedEventIds = Array.isArray(counterRes.activatedEventIds) ? counterRes.activatedEventIds : [];
  }
  
  let totalCounterApplied = 0;
  const trashedCards = [];
  
  // Process trashed hand counter cards
  for (const instanceId of trashedHandIds) {
    const idx = p.hand.findIndex(c => c && c.instanceId === instanceId);
    if (idx === -1) continue;
    
    const card = p.hand[idx];
    const counterValue = typeof card.counter === 'number' ? card.counter : 0;
    
    // Remove from hand and move to trash
    p.hand.splice(idx, 1);
    if (!Array.isArray(p.trash)) p.trash = [];
    card.zone = 'trash';
    p.trash.push(card);
    
    totalCounterApplied += counterValue;
    trashedCards.push({ instanceId, counter: counterValue });
  }
  
  // Apply total counter modifier to target
  if (totalCounterApplied > 0) {
    try {
      const desc = {
        stat: 'power',
        mode: 'add',
        amount: totalCounterApplied,
        targetInstanceIds: [targetInstanceId],
        duration: 'thisBattle',
        sourceInstanceId: trashedCards[0]?.instanceId || null,
        ownerId: defenderOwner
      };
      modifyStat(gameState, desc);
    } catch (e) {
      return { success: false, error: String(e), trashedCards, appliedAmount: totalCounterApplied };
    }
  }
  
  // TODO: Process activated Event counter cards (would require interpreter for ability execution)
  // For now, event counter activation is not fully implemented
  // This would involve: finding the card, checking/paying cost, executing Counter ability actions
  
  return { 
    success: true, 
    applied: totalCounterApplied > 0 || activatedEventIds.length > 0,
    trashedCards,
    appliedAmount: totalCounterApplied,
    activatedEventIds
  };
}

/* -------------------------
   Helper: check if instance has a keyword
   ------------------------- */
function _hasKeyword(instance, keyword) {
  if (!instance) return false;
  const kws = Array.isArray(instance.keywords) ? instance.keywords : [];
  return kws.includes(keyword) || kws.some(k => 
    typeof k === 'string' && k.toLowerCase().replace(/\s+/g, '') === keyword.toLowerCase().replace(/\s+/g, '')
  );
}

/* -------------------------
   Helper: damage computation + resolving (async for trigger support)
   ------------------------- */
async function _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy) {
  const attacker = attackerLoc.instance;
  const attackerOwner = attackerLoc.owner;

  // Fix: DON bonus only applies during the owning player's turn
  const attackerPower = _computePower(gameState, attacker, { isOwnerTurn: gameState.turnPlayer === attackerOwner });
  const targetInstance = targetLoc.instance;
  const targetPower = _computePower(gameState, targetInstance, { isOwnerTurn: gameState.turnPlayer === targetLoc.owner });

  // Check for Double Attack and Banish keywords on attacker
  const hasDoubleAttack = _hasKeyword(attacker, 'Double Attack') || _hasKeyword(attacker, 'DoubleAttack');
  const hasBanish = _hasKeyword(attacker, 'Banish');
  
  // Determine damage amount
  const damageToDeal = hasDoubleAttack ? 2 : 1;

  const result = {
    success: true,
    attacker: { id: attackerLoc.instance.instanceId, power: attackerPower, owner: attackerOwner },
    target: { id: targetLoc.instance.instanceId, zone: targetLoc.zone, power: targetPower, owner: targetLoc.owner },
    blockedBy: blockedBy ? { id: blockedBy.instanceId } : null,
    winner: null,
    ko: [],
    leaderDamage: null,
    doubleAttack: hasDoubleAttack,
    banish: hasBanish,
    error: null
  };

  if (attackerPower >= targetPower) {
    result.winner = 'attacker';
    if (targetLoc.zone === 'leader') {
      // Deal damage to the leader's owner (with Banish option if applicable)
      const dmgRes = await dealDamage(gameState, targetLoc.owner, damageToDeal, { banish: hasBanish });
      result.leaderDamage = dmgRes;
    } else if (targetLoc.zone === 'char' || targetLoc.zone === 'attached') {
      const koRes = _koCharacter(gameState, targetLoc.instance);
      if (koRes.success) result.ko.push(koRes);
      else result.ko.push({ success: false, error: koRes.error });
    } else {
      // unexpected zone - do nothing
    }
  } else {
    result.winner = 'defender';
  }

  return result;
}

/* -------------------------
   conductBattle (async with prompt support for blocker and counter)
   ------------------------- */
export async function conductBattle(gameState, attackerInstanceId, targetInstanceId) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!attackerInstanceId || !targetInstanceId) return { success: false, error: 'missing instance ids' };

  const attackerLoc = findInstance(gameState, attackerInstanceId);
  const targetLocInitial = findInstance(gameState, targetInstanceId);

  if (!attackerLoc || !attackerLoc.instance) return { success: false, error: 'attacker not found' };
  if (!targetLocInitial || !targetLocInitial.instance) return { success: false, error: 'target not found' };

  const attacker = attackerLoc.instance;

  // Validate attacker location and state
  if (!(attackerLoc.zone === 'leader' || attackerLoc.zone === 'char')) {
    return { success: false, error: 'attacker must be Leader or Character on field' };
  }
  if (attacker.state !== 'active') {
    return { success: false, error: 'attacker must be active to attack' };
  }

  // Validate initial target placement (leader or rested character)
  let targetLoc = targetLocInitial;
  if (targetLoc.zone === 'char') {
    if (targetLoc.instance.state !== 'rested') {
      return { success: false, error: 'target character must be rested' };
    }
  } else if (targetLoc.zone !== 'leader') {
    return { success: false, error: 'target must be leader or rested character' };
  }

  // Attack Step: rest the attacker
  attacker.state = 'rested';

  // Block Step: prompt if multiple blockers available
  let blockedBy = null;
  if (targetLoc.zone === 'leader' || targetLoc.zone === 'char') {
    const defenderOwner = targetLoc.owner;
    const blockers = _findActiveBlockers(gameState, defenderOwner);
    
    let chosenBlocker = null;
    if (blockers.length === 1) {
      // Single blocker: use prompt but fallback to automatic selection
      const payload = {
        gameState: engine.getGameStateSnapshot(gameState),
        battleId: gameState.metadata?.currentBattleId || null,
        attackerInstanceId,
        targetInstanceId,
        defenderOwner,
        blockers: blockers.map(b => ({
          instanceId: b.instanceId,
          cardId: b.cardId,
          printedName: b.printedName || b.cardId,
          basePower: b.basePower || 0,
          keywords: b.keywords || []
        }))
      };
      const blockerRes = await engine.prompt('blocker', payload);
      if (blockerRes && blockerRes.chosenBlockerId) {
        chosenBlocker = blockers.find(b => b.instanceId === blockerRes.chosenBlockerId) || null;
      } else if (blockerRes === null) {
        // No handler registered - auto-select first blocker (backward compatibility)
        chosenBlocker = blockers[0];
      }
      // If blockerRes.chosenBlockerId is explicitly null, no blocker is chosen
    } else if (blockers.length > 1) {
      // Multiple blockers: must prompt to choose
      const payload = {
        gameState: engine.getGameStateSnapshot(gameState),
        battleId: gameState.metadata?.currentBattleId || null,
        attackerInstanceId,
        targetInstanceId,
        defenderOwner,
        blockers: blockers.map(b => ({
          instanceId: b.instanceId,
          cardId: b.cardId,
          printedName: b.printedName || b.cardId,
          basePower: b.basePower || 0,
          keywords: b.keywords || []
        }))
      };
      const blockerRes = await engine.prompt('blocker', payload);
      if (blockerRes && blockerRes.chosenBlockerId) {
        chosenBlocker = blockers.find(b => b.instanceId === blockerRes.chosenBlockerId) || null;
      } else if (blockerRes === null) {
        // No handler registered - auto-select first blocker (backward compatibility)
        chosenBlocker = blockers[0];
      }
    }
    
    if (chosenBlocker) {
      // Rest blocker and set as new target
      chosenBlocker.state = 'rested';
      blockedBy = chosenBlocker;
      const newLoc = findInstance(gameState, chosenBlocker.instanceId);
      if (newLoc) targetLoc = newLoc;
    }
  }

  // Counter Step: perform with prompt support
  try {
    await _performCounterStep(gameState, targetLoc.owner, targetLoc.instance.instanceId);
  } catch (e) {
    // If counter step threw, log and still compute damage
    try { engine.emit('counterStepError', { error: String(e) }); } catch (_) {}
  }

  // Compute damage result and return (async for trigger support)
  return await _computeDamageResult(gameState, attackerLoc, targetLoc, blockedBy);
}

/* Default export for convenience */
export default {
  conductBattle
};
