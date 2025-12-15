'use strict';
/*
 * damageAndLife.js — Damage processing & Life handling with Trigger support
 * =============================================================================
 *
 * PURPOSE
 *  - Provide core utilities for dealing damage to Leaders (via Life).
 *  - Implement the "damage processing" rule: move top Life cards to hand
 *    OR activate [Trigger] abilities when available.
 *  - Support Banish keyword (trash life, no trigger allowed).
 *
 * KEY FUNCTIONS
 *  - dealDamageToLeader(gameState, side, count, options) - async
 *  - executeLifeTrigger(gameState, lifeCard, context) - async
 *
 * NOTES / ASSUMPTIONS
 *  - side is 'player' or 'opponent' (the player whose leader is taking damage)
 *  - A Life card is represented as a CardInstance stored in gameState.players[side].life array.
 *  - When a life card has a trigger (hasTrigger=true or has Trigger keyword), the player
 *    is prompted to choose: activate trigger OR add to hand.
 *  - If Trigger is activated, the life card is typically trashed after resolution.
 *  - If Banish is applied, life cards go to trash and cannot activate triggers.
 * =============================================================================
 */

import engine from '../index.js';
import interpreter from '../actions/interpreter.js';
import evaluator from '../rules/evaluator.js';

/**
 * Helper: popTopLife(gameState, side)
 * Removes and returns the top Life card for the side (or null if none).
 * We use index 0 as top-of-life.
 */
export function popTopLife(gameState, side) {
  if (!gameState || !gameState.players || !gameState.players[side]) return null;
  const p = gameState.players[side];
  if (!Array.isArray(p.life) || p.life.length === 0) return null;
  const top = p.life.shift(); // remove first element as top
  return top;
}

/**
 * addCardToHand(gameState, side, cardInstance)
 * Adds the card instance to the specified side's hand.
 */
export function addCardToHand(gameState, side, cardInstance) {
  if (!gameState || !gameState.players || !gameState.players[side]) return false;
  const p = gameState.players[side];
  if (!Array.isArray(p.hand)) p.hand = [];
  p.hand.push(cardInstance);
  if (cardInstance) cardInstance.zone = 'hand';
  return true;
}

/**
 * addCardToTrash(gameState, side, cardInstance)
 * Adds the card instance to the specified side's trash.
 */
export function addCardToTrash(gameState, side, cardInstance) {
  if (!gameState || !gameState.players || !gameState.players[side]) return false;
  const p = gameState.players[side];
  if (!Array.isArray(p.trash)) p.trash = [];
  cardInstance.zone = 'trash';
  p.trash.push(cardInstance);
  return true;
}

/**
 * Check if a life card has a trigger ability.
 */
function _hasLifeTrigger(lifeCard) {
  if (!lifeCard) return false;
  if (lifeCard.hasTrigger === true) return true;
  if (Array.isArray(lifeCard.keywords) && lifeCard.keywords.includes('Trigger')) return true;
  if (Array.isArray(lifeCard.abilities)) {
    for (const ab of lifeCard.abilities) {
      if (ab && (ab.timing === 'Trigger' || ab.timing === 'trigger' || ab.trigger === true)) {
        return true;
      }
    }
  }
  try {
    const meta = engine.getCardMeta(lifeCard.cardId);
    if (meta) {
      if (Array.isArray(meta.keywords) && meta.keywords.includes('Trigger')) return true;
      if (Array.isArray(meta.abilities)) {
        for (const ab of meta.abilities) {
          if (ab && (ab.timing === 'Trigger' || ab.timing === 'trigger' || ab.trigger === true)) {
            return true;
          }
        }
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

/**
 * Get the trigger ability from a life card.
 */
function _getTriggerAbility(lifeCard) {
  if (!lifeCard) return null;
  if (Array.isArray(lifeCard.abilities)) {
    for (let i = 0; i < lifeCard.abilities.length; i++) {
      const ab = lifeCard.abilities[i];
      if (ab && (ab.timing === 'Trigger' || ab.timing === 'trigger' || ab.trigger === true)) {
        return { ability: ab, index: i };
      }
    }
  }
  try {
    const meta = engine.getCardMeta(lifeCard.cardId);
    if (meta && Array.isArray(meta.abilities)) {
      for (let i = 0; i < meta.abilities.length; i++) {
        const ab = meta.abilities[i];
        if (ab && (ab.timing === 'Trigger' || ab.timing === 'trigger' || ab.trigger === true)) {
          return { ability: ab, index: i };
        }
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * executeLifeTrigger(gameState, lifeCard, context)
 * Execute the [Trigger] ability of a life card via interpreter.
 */
export async function executeLifeTrigger(gameState, lifeCard, context = {}) {
  if (!gameState || !lifeCard) {
    return { success: false, error: 'missing gameState or lifeCard' };
  }
  const triggerInfo = _getTriggerAbility(lifeCard);
  if (!triggerInfo) {
    return { success: false, error: 'no trigger ability found on life card' };
  }
  const { ability, index: abilityIndex } = triggerInfo;
  const side = context.activePlayer || lifeCard.owner;
  const execContext = {
    ...context,
    thisCard: lifeCard,
    triggerSource: lifeCard,
    activePlayer: side,
    owner: side
  };
  if (ability.actions && Array.isArray(ability.actions)) {
    for (const action of ability.actions) {
      try {
        const res = await interpreter.executeAction(gameState, action, execContext);
        if (!res.success) {
          try { engine.emit('triggerActionError', { instanceId: lifeCard.instanceId, error: res.error }); } catch (_) {}
        }
      } catch (e) {
        try { engine.emit('triggerActionError', { instanceId: lifeCard.instanceId, error: String(e) }); } catch (_) {}
      }
    }
  } else if (ability.effect) {
    try {
      const res = await interpreter.executeAction(gameState, ability.effect, execContext);
      if (!res.success) {
        try { engine.emit('triggerActionError', { instanceId: lifeCard.instanceId, error: res.error }); } catch (_) {}
      }
    } catch (e) {
      try { engine.emit('triggerActionError', { instanceId: lifeCard.instanceId, error: String(e) }); } catch (_) {}
    }
  }
  try {
    evaluator.markAbilityTriggered(gameState, lifeCard.instanceId, abilityIndex);
  } catch (e) { /* ignore */ }
  return { success: true, instanceId: lifeCard.instanceId, abilityIndex };
}

/**
 * dealDamageToLeader(gameState, side, count, options)
 * Process damage to the leader. Supports trigger prompts and Banish.
 * @param {object} options - { banish: boolean, allowTriggers: boolean }
 * @returns {Promise<object>}
 */
export async function dealDamageToLeader(gameState, side, count = 1, options = {}) {
  if (!gameState || !gameState.players || !gameState.players[side]) {
    return { success: false, error: 'invalid gameState or side' };
  }
  if (!Number.isInteger(count) || count <= 0) {
    return { success: false, error: 'count must be positive integer' };
  }

  const banish = options.banish === true;
  const allowTriggers = options.allowTriggers !== false && !banish;

  const result = { success: true, moved: 0, triggers: [], banished: 0 };

  for (let i = 0; i < count; i++) {
    const p = gameState.players[side];
    const lifeCount = Array.isArray(p.life) ? p.life.length : 0;
    
    if (lifeCount === 0) {
      gameState.defeat = gameState.defeat || {};
      gameState.defeat.loser = side;
      result.defeat = { loser: side };
      try {
        engine.emit('event:defeat', { gameState: engine.getGameStateSnapshot(gameState), loser: side });
      } catch (_) {}
      break;
    }

    const lifeCard = popTopLife(gameState, side);
    if (!lifeCard) continue;

    if (banish) {
      addCardToTrash(gameState, side, lifeCard);
      result.banished++;
      result.triggers.push({ instanceId: lifeCard.instanceId, activated: false, banished: true, canActivateTrigger: false });
      continue;
    }

    const hasTrigger = _hasLifeTrigger(lifeCard);
    
    if (hasTrigger && allowTriggers) {
      lifeCard.zone = null;
      const payload = {
        gameState: engine.getGameStateSnapshot(gameState),
        side,
        lifeCard: {
          instanceId: lifeCard.instanceId,
          cardId: lifeCard.cardId,
          printedName: lifeCard.printedName || lifeCard.cardId,
          hasTrigger: true,
          printedText: lifeCard.printedText || ''
        }
      };
      const choice = await engine.prompt('lifeTrigger', payload);
      
      if (choice && choice.action === 'activate') {
        result.triggers.push({ instanceId: lifeCard.instanceId, activated: true, canActivateTrigger: true });
        await executeLifeTrigger(gameState, lifeCard, { activePlayer: side });
        if (lifeCard.zone === null) {
          addCardToTrash(gameState, side, lifeCard);
        }
        try {
          engine.emit('event:triggerActivated', { gameState: engine.getGameStateSnapshot(gameState), side, instanceId: lifeCard.instanceId });
        } catch (_) {}
      } else {
        addCardToHand(gameState, side, lifeCard);
        result.moved++;
        result.triggers.push({ instanceId: lifeCard.instanceId, activated: false, canActivateTrigger: true });
      }
    } else {
      addCardToHand(gameState, side, lifeCard);
      result.moved++;
      result.triggers.push({ instanceId: lifeCard.instanceId, activated: false, canActivateTrigger: false });
    }
  }
  
  try {
    engine.emit('event:damage', { gameState: engine.getGameStateSnapshot(gameState), side, amount: count, triggers: result.triggers });
  } catch (_) {}

  return result;
}

export default {
  popTopLife,
  addCardToHand,
  addCardToTrash,
  dealDamageToLeader,
  executeLifeTrigger
};
