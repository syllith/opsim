'use strict';
/*
 * battle.js — Minimal Battle Engine (async, prompt-driven Counter Step)
 * =============================================================================
 *
 * Implements a simplified Attack/Block/Damage/End-of-Battle flow sufficient for
 * early simulation and unit tests. The Counter Step now prompts the defending
 * player (via promptManager.requestChoice) to optionally trash a counter card
 * from their hand and apply its counter value as +power to the battle target
 * for this battle.
 *
 * - conductBattle is async and should be awaited by callers.
 * - If prompt times out or is cancelled, the Counter step is treated as "no action".
 *
 * Notes:
 * - The prompt choiceSpec is intentionally minimal and server-side: it carries
 *   a `choices` array with { id, label, counter } so the UI knows what to show.
 * =============================================================================
 */

import zones from './zones.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import { dealDamage } from '../actions/dealDamage.js';
import { modifyStat } from '../actions/modifyStat.js';
import promptManager from '../core/promptManager.js';
import engine from '../index.js'; // for emitting/observing events if needed

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
   Helper: find an active blocker for a defender
   ------------------------- */
function _findActiveBlocker(gameState, defenderOwner) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.char)) return null;
  for (const c of p.char) {
    if (!c) continue;
    const kws = Array.isArray(c.keywords) ? c.keywords : [];
    if (kws.includes('Blocker') && c.state === 'active') return c;
  }
  return null;
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
   Counter Step implementation (async; prompts defender)
   ------------------------- */
async function _performCounterStep(gameState, defenderOwner, targetInstanceId) {
  const p = gameState.players && gameState.players[defenderOwner];
  if (!p || !Array.isArray(p.hand)) return { success: true, applied: false };

  // find all counter cards in hand (counter > 0)
  const candidates = [];
  for (const inst of p.hand) {
    if (inst && typeof inst.counter === 'number' && inst.counter > 0) {
      candidates.push(inst);
    }
  }
  if (candidates.length === 0) return { success: true, applied: false };

  // Prepare a choiceSpec with the candidates for the UI
  const choices = candidates.map(c => ({
    id: c.instanceId,
    label: `${c.cardId || c.instanceId} (Counter ${c.counter})`,
    counter: c.counter
  }));

  const choiceSpec = {
    type: 'select',
    min: 0,
    max: 1,
    message: 'You may trash a counter card from your hand to add its counter to the target for this battle.',
    choices
  };

  // Request choice from the defender. Use a modest timeout so tests/automations don't hang.
  let promptResult = null;
  try {
    const { promptId, promise } = promptManager.requestChoice(gameState, defenderOwner, choiceSpec, { timeoutMs: 30000, debug: { source: 'counterStep' } });
    // Wait for selection or timeout/cancel
    try {
      const resolved = await promise;
      // normalized: resolved.selection is whatever the client chose
      promptResult = resolved && resolved.selection ? resolved.selection : null;
    } catch (e) {
      // Timeout or cancel -> treat as no choice
      // emit an event for visibility
      try { engine.emit('counterPromptFailed', { defenderOwner, reason: String(e) }); } catch (_e) {}
      promptResult = null;
    }
  } catch (e) {
    // If requestChoice itself throws, log and treat as no choice
    try { engine.emit('counterPromptError', { defenderOwner, error: String(e) }); } catch (_e) {}
    promptResult = null;
  }

  // If no selection or empty, treat as no action
  if (!promptResult || (Array.isArray(promptResult) && promptResult.length === 0)) {
    return { success: true, applied: false };
  }

  // The selection may be an array of chosen ids (we accepted max:1)
  const chosenId = Array.isArray(promptResult) ? promptResult[0] : promptResult;

  // Find the card in hand and trash it
  const index = p.hand.findIndex(h => h && h.instanceId === chosenId);
  if (index === -1) {
    // Chosen card not found (client lied or race) -> treat as no action
    return { success: true, applied: false, reason: 'chosen card not found' };
  }

  const [trashed] = p.hand.splice(index, 1);
  if (!Array.isArray(p.trash)) p.trash = [];
  trashed.zone = 'trash';
  p.trash.push(trashed);

  // Apply modifier for this battle to the target instance
  try {
    const desc = {
      stat: 'power',
      mode: 'add',
      amount: trashed.counter,
      targetInstanceIds: [targetInstanceId],
      duration: 'thisBattle',
      sourceInstanceId: trashed.instanceId,
      ownerId: defenderOwner
    };
    modifyStat(gameState, desc);
  } catch (e) {
    return { success: false, error: String(e) };
  }

  return { success: true, applied: true, trashedInstanceId: trashed.instanceId, amount: trashed.counter };
}

/* -------------------------
   conductBattle (async)
   ------------------------- */
export async function conductBattle(gameState, attackerInstanceId, targetInstanceId) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!attackerInstanceId || !targetInstanceId) return { success: false, error: 'missing instance ids' };

  const attackerLoc = findInstance(gameState, attackerInstanceId);
  const targetLocInitial = findInstance(gameState, targetInstanceId);

  if (!attackerLoc || !attackerLoc.instance) return { success: false, error: 'attacker not found' };
  if (!targetLocInitial || !targetLocInitial.instance) return { success: false, error: 'target not found' };

  const attacker = attackerLoc.instance;
  const attackerOwner = attackerLoc.owner;

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

  // Block Step: automatic first active blocker if target is a leader or character
  let blockedBy = null;
  if (targetLoc.zone === 'leader' || targetLoc.zone === 'char') {
    const defenderOwner = targetLoc.owner;
    const blockerInst = _findActiveBlocker(gameState, defenderOwner);
    if (blockerInst) {
      // Rest blocker and set as new target
      blockerInst.state = 'rested';
      blockedBy = blockerInst;
      const newLoc = findInstance(gameState, blockerInst.instanceId);
      if (newLoc) targetLoc = newLoc;
    }
  }

  // Counter Step: prompt defender to trash a counter card (async)
  if (targetLoc && targetLoc.owner) {
    try {
      await _performCounterStep(gameState, targetLoc.owner, targetLoc.instance.instanceId);
    } catch (e) {
      // ignore errors for now – Counter step is optional
      try { engine.emit('counterStepError', { error: String(e) }); } catch (_e) {}
    }
  }

  // Damage Step: compute powers and resolve
  const attackerPower = _computePower(gameState, attacker, { isOwnerTurn: false });
  const targetInstance = targetLoc.instance;
  const targetPower = _computePower(gameState, targetInstance, { isOwnerTurn: false });

  const result = {
    success: true,
    attacker: { id: attackerInstanceId, power: attackerPower, owner: attackerOwner },
    target: { id: targetLoc.instance.instanceId, zone: targetLoc.zone, power: targetPower, owner: targetLoc.owner },
    blockedBy: blockedBy ? { id: blockedBy.instanceId } : null,
    winner: null,
    ko: [],
    leaderDamage: null,
    error: null
  };

  // Compare powers
  if (attackerPower >= targetPower) {
    result.winner = 'attacker';
    if (targetLoc.zone === 'leader') {
      // Deal 1 damage to the leader's owner
      const dmgRes = dealDamage(gameState, targetLoc.owner, 1);
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

/* Default export for convenience */
export default {
  conductBattle
};
