'use strict';
/*
 * ruleProcessor.js — Rule/Timing Queue & Event Processor
 * =============================================================================
 * PURPOSE
 *  - Centralize event processing and timing for the engine.
 *  - Handle simultaneous abilities, replacement resolution, and expiry of
 *    duration-based effects (thisBattle, thisTurn).
 *  - Process events in proper order according to OPTCG Comprehensive Rules.
 *
 * API
 *  - enqueueEvent(gameState, event): Add an event to the queue
 *  - processQueue(gameState): Process all queued events (may be async)
 *  - clearQueue(gameState): Clear the event queue
 *
 * EVENT TYPES
 *  - 'damage': Damage dealt to leader
 *  - 'onPlay': Card played to field
 *  - 'whenAttacking': Attack declared
 *  - 'onBlock': Blocker declared
 *  - 'onKO': Character KO'd
 *  - 'endOfTurn': Turn ending
 *  - 'endOfBattle': Battle ending
 *  - 'onDraw': Card drawn
 *  - 'trigger': Trigger ability activated
 * =============================================================================
 */

import engine from '../index.js';
import evaluator from '../rules/evaluator.js';
import interpreter from '../actions/interpreter.js';
import replacement from './replacement.js';
import continuousEffects from '../modifiers/continuousEffects.js';
import { payCost } from '../actions/payCost.js';

/**
 * Ensure the event queue exists on gameState
 */
function _ensureQueue(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Array.isArray(gameState.eventQueue)) gameState.eventQueue = [];
}

/**
 * enqueueEvent(gameState, event)
 * Add an event to the processing queue.
 * 
 * @param {object} gameState - The game state
 * @param {object} event - Event object with { type, payload, priority? }
 */
export function enqueueEvent(gameState, event) {
  if (!gameState) return;
  if (!event || !event.type) return;
  
  _ensureQueue(gameState);
  
  // Add timestamp for ordering
  const evt = {
    ...event,
    _timestamp: Date.now(),
    _id: `evt-${(gameState.nextEventId = (gameState.nextEventId || 0) + 1)}`
  };
  
  gameState.eventQueue.push(evt);
}

/**
 * processQueue(gameState)
 * Process all queued events until the queue is empty.
 * Returns a Promise since event processing may involve prompts.
 * 
 * @param {object} gameState - The game state
 * @returns {Promise<object>} Results summary
 */
export async function processQueue(gameState) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  
  _ensureQueue(gameState);
  
  const results = {
    processed: 0,
    errors: [],
    triggersActivated: []
  };
  
  // Process until queue is empty (events may add new events)
  while (gameState.eventQueue.length > 0) {
    // Sort by priority (lower = higher priority), then by timestamp
    gameState.eventQueue.sort((a, b) => {
      const pa = a.priority || 0;
      const pb = b.priority || 0;
      if (pa !== pb) return pa - pb;
      return (a._timestamp || 0) - (b._timestamp || 0);
    });
    
    const event = gameState.eventQueue.shift();
    
    try {
      await _processSingleEvent(gameState, event, results);
      results.processed++;
    } catch (e) {
      results.errors.push({ eventId: event._id, type: event.type, error: String(e) });
    }
  }
  
  return results;
}

/**
 * Process a single event
 */
async function _processSingleEvent(gameState, event, results) {
  const eventType = event.type;
  const payload = event.payload || {};
  
  // 1. Check for replacements
  const replacementCheck = replacement.checkReplacements(gameState, eventType, payload);
  
  if (replacementCheck.hasReplacement && replacementCheck.effects.length > 0) {
    // Prompt player to choose a replacement if multiple exist
    const owner = payload.owner || payload.targetOwner || gameState.turnPlayer;
    
    if (replacementCheck.effects.length === 1) {
      // Single replacement - apply automatically or prompt
      const repl = replacementCheck.effects[0];
      const replPayload = {
        gameState: engine.getGameStateSnapshot(gameState),
        eventName: eventType,
        replacements: [{
          id: repl.id,
          sourceInstanceId: repl.sourceInstanceId,
          ownerId: repl.ownerId,
          description: repl.description || `Replacement effect`,
          actions: repl.actions || (repl.effects && repl.effects.actions) || []
        }]
      };
      
      const replChoice = await engine.prompt('replacement', replPayload);
      
      if (replChoice && replChoice.chosenReplacementId) {
        await replacement.applyReplacement(gameState, replChoice.chosenReplacementId, 'accept', {
          activePlayer: owner,
          ...payload
        });
        // Replacement was applied - the original event is replaced
        return;
      }
      // If declined or no handler, continue with original event
    } else {
      // Multiple replacements - must prompt
      const replPayload = {
        gameState: engine.getGameStateSnapshot(gameState),
        eventName: eventType,
        replacements: replacementCheck.effects.map(r => ({
          id: r.id,
          sourceInstanceId: r.sourceInstanceId,
          ownerId: r.ownerId,
          description: r.description || `Replacement effect`,
          actions: r.actions || (r.effects && r.effects.actions) || []
        }))
      };
      
      const replChoice = await engine.prompt('replacement', replPayload);
      
      if (replChoice && replChoice.chosenReplacementId) {
        await replacement.applyReplacement(gameState, replChoice.chosenReplacementId, 'accept', {
          activePlayer: owner,
          ...payload
        });
        return;
      }
    }
  }
  
  // 2. Get triggered abilities for this event
  const triggeredAbilities = evaluator.getTriggeredAbilities(gameState, eventType, {
    context: payload,
    activePlayer: payload.activePlayer || gameState.turnPlayer
  });
  
  if (triggeredAbilities.length > 0) {
    // Sort by turn player first (rule 8-6-1)
    const turnPlayer = gameState.turnPlayer;
    triggeredAbilities.sort((a, b) => {
      const aIsTurn = a.ownerId === turnPlayer ? 0 : 1;
      const bIsTurn = b.ownerId === turnPlayer ? 0 : 1;
      return aIsTurn - bIsTurn;
    });
    
    // Process each triggered ability
    for (const triggerInfo of triggeredAbilities) {
      const { instanceId, abilityIndex, ability, ownerId } = triggerInfo;
      
      // Check frequency
      const freqCheck = evaluator.checkFrequency(gameState, instanceId, ability, abilityIndex);
      if (!freqCheck.ok) continue;
      
      // Check cost (if any)
      const costCheck = evaluator.canPayCost(gameState, ability, {
        owner: ownerId,
        thisCard: { instanceId, owner: ownerId }
      });
      
      if (!costCheck.ok) continue;
      
      // Pay cost if required
      if (ability.cost) {
        const costResult = payCost(gameState, ability.cost, {
          owner: ownerId,
          thisCard: { instanceId, owner: ownerId }
        });
        if (!costResult.success) continue;
      }
      
      // Execute ability actions
      if (ability.actions && Array.isArray(ability.actions)) {
        for (const action of ability.actions) {
          try {
            await interpreter.executeAction(gameState, action, {
              activePlayer: ownerId,
              thisCard: { instanceId, owner: ownerId },
              ...payload
            });
          } catch (e) {
            // Log error but continue
            try { engine.emit('triggerActionError', { instanceId, error: String(e) }); } catch (_) {}
          }
        }
      }
      
      // Mark ability as triggered
      evaluator.markAbilityTriggered(gameState, instanceId, abilityIndex);
      results.triggersActivated.push({ instanceId, abilityIndex, ownerId });
    }
  }
  
  // 3. Handle special event types
  switch (eventType) {
    case 'endOfBattle':
    case 'battleEnd':
      // Expire thisBattle modifiers
      continuousEffects.expireModifiers(gameState, 'battleEnd');
      replacement.expireReplacements(gameState, 'battleEnd');
      break;
      
    case 'endOfTurn':
    case 'turnEnd':
      // Expire thisTurn modifiers
      continuousEffects.expireModifiers(gameState, 'turnEnd');
      replacement.expireReplacements(gameState, 'turnEnd');
      break;
  }
  
  // 4. Emit the event for UI/logging
  try {
    engine.emit(`event:${eventType}`, {
      gameState: engine.getGameStateSnapshot(gameState),
      ...payload
    });
  } catch (_) {}
}

/**
 * clearQueue(gameState)
 * Clear the event queue.
 */
export function clearQueue(gameState) {
  if (!gameState) return;
  gameState.eventQueue = [];
}

/**
 * getQueueLength(gameState)
 * Get the number of events in the queue.
 */
export function getQueueLength(gameState) {
  if (!gameState || !Array.isArray(gameState.eventQueue)) return 0;
  return gameState.eventQueue.length;
}

/**
 * peekQueue(gameState)
 * Get the next event without removing it.
 */
export function peekQueue(gameState) {
  if (!gameState || !Array.isArray(gameState.eventQueue) || gameState.eventQueue.length === 0) {
    return null;
  }
  return gameState.eventQueue[0];
}

export default {
  enqueueEvent,
  processQueue,
  clearQueue,
  getQueueLength,
  peekQueue
};
