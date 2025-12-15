'use strict';
/*
 * payCost.js — Cost Payment Action API
 * =============================================================================
 * PURPOSE
 *  - Provide a general `payCost` function that actually mutates state to pay costs.
 *  - Works with cost objects from ability descriptors.
 *  - Called by interpreter/evaluator after canPayCost() returns OK.
 *
 * SUPPORTED COST TYPES
 *  - restDonFromCostArea: Rest specified count of active DONs in costArea
 *  - donMinus: Return specified count of DONs from attachedDons/costArea to donDeck
 *  - trashFromHand: Trash specified cards from hand
 *  - restThis: Rest the thisCard
 *  - trashThis: Trash the thisCard
 *  - multiCost: Pay multiple subcosts
 *  - restFromField: Rest cards matching selector
 *  - trashFromField: Trash cards matching selector
 *  - moveFromField: Move cards matching selector to destination
 *  - bottomDeckFromField: Move cards matching selector to bottom of deck
 *  - trashTopDeck: Trash top card(s) of deck
 * =============================================================================
 */

import * as selectorModule from '../rules/selector.js';
import donManager from '../modifiers/donManager.js';
import zones from '../core/zones.js';

const { findInstance, removeInstance } = zones;

/**
 * payCost(gameState, costObject, context)
 * 
 * Pay a cost by mutating gameState. Returns { success: true } or { success: false, error: string }
 * 
 * @param {object} gameState - The game state to mutate
 * @param {object} costObject - The cost descriptor object
 * @param {object} context - Context including { owner, thisCard, ... }
 * @returns {object} Result with success boolean
 */
export function payCost(gameState, costObject, context = {}) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!costObject || typeof costObject !== 'object') return { success: false, error: 'invalid cost object' };
  
  const costType = costObject.type;
  if (!costType) return { success: false, error: 'cost object missing type' };
  
  const owner = context.owner || (context.thisCard && context.thisCard.owner);
  const thisCard = context.thisCard;
  
  try {
    switch (costType) {
      case 'restDonFromCostArea': {
        const cnt = Number.isInteger(costObject.count) ? costObject.count : 0;
        if (!owner) return { success: false, error: 'missing owner for restDonFromCostArea' };
        
        const p = gameState.players && gameState.players[owner];
        if (!p) return { success: false, error: `owner ${owner} not found` };
        
        // Find active DONs in costArea
        const costArea = p.costArea || [];
        const activeDons = costArea.filter(d => d && (d.state === undefined || d.state === 'active'));
        
        if (activeDons.length < cnt) {
          return { success: false, error: `Not enough active DON in cost area: need ${cnt}, have ${activeDons.length}` };
        }
        
        // Rest the first `cnt` active DONs
        let rested = 0;
        for (const don of costArea) {
          if (rested >= cnt) break;
          if (don && (don.state === undefined || don.state === 'active')) {
            don.state = 'rested';
            rested++;
          }
        }
        
        return { success: true, rested };
      }
      
      case 'donMinus': {
        const cnt = Number.isInteger(costObject.count) ? costObject.count : 0;
        if (!owner) return { success: false, error: 'missing owner for donMinus' };
        
        const p = gameState.players && gameState.players[owner];
        if (!p) return { success: false, error: `owner ${owner} not found` };
        
        // Collect DONs from costArea and attachedDons on characters/leader
        const donSources = [];
        
        // From costArea
        if (Array.isArray(p.costArea)) {
          for (let i = p.costArea.length - 1; i >= 0; i--) {
            if (p.costArea[i]) {
              donSources.push({ source: 'costArea', index: i, don: p.costArea[i] });
            }
          }
        }
        
        // From leader attachedDons
        if (p.leader && Array.isArray(p.leader.attachedDons)) {
          for (let i = p.leader.attachedDons.length - 1; i >= 0; i--) {
            if (p.leader.attachedDons[i]) {
              donSources.push({ source: 'leader', index: i, don: p.leader.attachedDons[i] });
            }
          }
        }
        
        // From character attachedDons
        if (Array.isArray(p.char)) {
          for (let ci = 0; ci < p.char.length; ci++) {
            const ch = p.char[ci];
            if (ch && Array.isArray(ch.attachedDons)) {
              for (let i = ch.attachedDons.length - 1; i >= 0; i--) {
                if (ch.attachedDons[i]) {
                  donSources.push({ source: 'char', charIndex: ci, index: i, don: ch.attachedDons[i] });
                }
              }
            }
          }
        }
        
        if (donSources.length < cnt) {
          return { success: false, error: `Not enough DON for DON!! −${cnt} (have ${donSources.length})` };
        }
        
        // Return `cnt` DONs to donDeck
        const returned = [];
        for (let i = 0; i < cnt && i < donSources.length; i++) {
          const src = donSources[i];
          const don = src.don;
          
          // Remove from source
          if (src.source === 'costArea') {
            p.costArea.splice(src.index, 1);
          } else if (src.source === 'leader') {
            p.leader.attachedDons.splice(src.index, 1);
          } else if (src.source === 'char') {
            p.char[src.charIndex].attachedDons.splice(src.index, 1);
          }
          
          // Add to donDeck
          if (!Array.isArray(p.donDeck)) p.donDeck = [];
          don.zone = 'donDeck';
          don.state = 'active';
          p.donDeck.push(don);
          returned.push(don.instanceId);
        }
        
        return { success: true, returned };
      }
      
      case 'trashFromHand': {
        if (!owner) return { success: false, error: 'missing owner for trashFromHand' };
        const p = gameState.players && gameState.players[owner];
        if (!p) return { success: false, error: `owner ${owner} not found` };
        
        // costObject.cardIds or costObject.instanceIds specifies which cards to trash
        const instanceIds = costObject.instanceIds || costObject.cardIds || [];
        const minCards = costObject.minCards || instanceIds.length || 1;
        
        if (!Array.isArray(p.hand)) p.hand = [];
        if (!Array.isArray(p.trash)) p.trash = [];
        
        const trashed = [];
        for (const id of instanceIds) {
          const idx = p.hand.findIndex(c => c && c.instanceId === id);
          if (idx !== -1) {
            const [card] = p.hand.splice(idx, 1);
            card.zone = 'trash';
            p.trash.push(card);
            trashed.push(card.instanceId);
          }
        }
        
        if (trashed.length < minCards) {
          return { success: false, error: `Failed to trash enough cards: need ${minCards}, trashed ${trashed.length}` };
        }
        
        return { success: true, trashed };
      }
      
      case 'restThis': {
        if (!thisCard) return { success: false, error: 'restThis requires thisCard in context' };
        if (thisCard.state === 'rested') return { success: false, error: 'Card already rested' };
        thisCard.state = 'rested';
        return { success: true, instanceId: thisCard.instanceId };
      }
      
      case 'trashThis': {
        if (!thisCard) return { success: false, error: 'trashThis requires thisCard in context' };
        
        // Remove from current location and add to trash
        const removed = removeInstance(gameState, thisCard.instanceId);
        if (!removed) return { success: false, error: 'failed to remove thisCard for trashThis' };
        
        const cardOwner = thisCard.owner || owner;
        const p = gameState.players && gameState.players[cardOwner];
        if (!p) return { success: false, error: `owner ${cardOwner} not found` };
        
        if (!Array.isArray(p.trash)) p.trash = [];
        removed.zone = 'trash';
        p.trash.push(removed);
        
        return { success: true, instanceId: removed.instanceId };
      }
      
      case 'multiCost': {
        if (!Array.isArray(costObject.costs) || costObject.costs.length === 0) {
          return { success: false, error: 'multiCost has no subcosts' };
        }
        
        const results = [];
        for (const subcost of costObject.costs) {
          const res = payCost(gameState, subcost, context);
          results.push(res);
          if (!res.success) {
            return { success: false, error: `Failed subcost: ${res.error}`, partialResults: results };
          }
        }
        
        return { success: true, subcostResults: results };
      }
      
      case 'restFromField': {
        if (!costObject.selector) return { success: false, error: 'restFromField missing selector' };
        
        const matches = selectorModule.evaluateSelector(gameState, costObject.selector, context) || [];
        if (matches.length === 0) return { success: false, error: 'restFromField selector found no targets' };
        
        // If count specified, use that many; otherwise rest all matches
        const count = costObject.count || matches.length;
        const rested = [];
        
        for (let i = 0; i < count && i < matches.length; i++) {
          const inst = matches[i];
          if (inst && inst.state !== 'rested') {
            inst.state = 'rested';
            rested.push(inst.instanceId);
          }
        }
        
        return { success: true, rested };
      }
      
      case 'trashFromField': {
        if (!costObject.selector) return { success: false, error: 'trashFromField missing selector' };
        
        const matches = selectorModule.evaluateSelector(gameState, costObject.selector, context) || [];
        if (matches.length === 0) return { success: false, error: 'trashFromField selector found no targets' };
        
        const count = costObject.count || matches.length;
        const trashed = [];
        
        for (let i = 0; i < count && i < matches.length; i++) {
          const inst = matches[i];
          if (!inst || !inst.instanceId) continue;
          
          const removed = removeInstance(gameState, inst.instanceId);
          if (!removed) continue;
          
          const instOwner = inst.owner || owner;
          const p = gameState.players && gameState.players[instOwner];
          if (!p) continue;
          
          if (!Array.isArray(p.trash)) p.trash = [];
          removed.zone = 'trash';
          p.trash.push(removed);
          trashed.push(removed.instanceId);
        }
        
        return { success: true, trashed };
      }
      
      case 'moveFromField': {
        if (!costObject.selector) return { success: false, error: 'moveFromField missing selector' };
        if (!costObject.destination) return { success: false, error: 'moveFromField missing destination' };
        
        const matches = selectorModule.evaluateSelector(gameState, costObject.selector, context) || [];
        if (matches.length === 0) return { success: false, error: 'moveFromField selector found no targets' };
        
        const count = costObject.count || matches.length;
        const moved = [];
        
        for (let i = 0; i < count && i < matches.length; i++) {
          const inst = matches[i];
          if (!inst || !inst.instanceId) continue;
          
          const removed = removeInstance(gameState, inst.instanceId);
          if (!removed) continue;
          
          const instOwner = inst.owner || owner;
          const p = gameState.players && gameState.players[instOwner];
          if (!p) continue;
          
          const dest = costObject.destination;
          if (!Array.isArray(p[dest])) p[dest] = [];
          removed.zone = dest;
          p[dest].push(removed);
          moved.push(removed.instanceId);
        }
        
        return { success: true, moved };
      }
      
      case 'bottomDeckFromField': {
        if (!costObject.selector) return { success: false, error: 'bottomDeckFromField missing selector' };
        
        const matches = selectorModule.evaluateSelector(gameState, costObject.selector, context) || [];
        if (matches.length === 0) return { success: false, error: 'bottomDeckFromField selector found no targets' };
        
        const count = costObject.count || matches.length;
        const moved = [];
        
        for (let i = 0; i < count && i < matches.length; i++) {
          const inst = matches[i];
          if (!inst || !inst.instanceId) continue;
          
          const removed = removeInstance(gameState, inst.instanceId);
          if (!removed) continue;
          
          const instOwner = inst.owner || owner;
          const p = gameState.players && gameState.players[instOwner];
          if (!p) continue;
          
          if (!Array.isArray(p.deck)) p.deck = [];
          removed.zone = 'deck';
          p.deck.push(removed); // push to end = bottom of deck
          moved.push(removed.instanceId);
        }
        
        return { success: true, moved };
      }
      
      case 'trashTopDeck': {
        const side = owner || (context && context.activePlayer);
        if (!side) return { success: false, error: 'missing owner for trashTopDeck' };
        
        const p = gameState.players && gameState.players[side];
        if (!p) return { success: false, error: `owner ${side} not found` };
        
        const cnt = Number.isInteger(costObject.count) ? costObject.count : 1;
        if (!Array.isArray(p.deck) || p.deck.length < cnt) {
          return { success: false, error: 'Not enough cards in deck to trashTopDeck' };
        }
        
        if (!Array.isArray(p.trash)) p.trash = [];
        const trashed = [];
        
        for (let i = 0; i < cnt; i++) {
          const card = p.deck.shift(); // remove from top
          if (card) {
            card.zone = 'trash';
            p.trash.push(card);
            trashed.push(card.instanceId);
          }
        }
        
        return { success: true, trashed };
      }
      
      default:
        // Unknown cost type - fail safely
        return { success: false, error: `Unknown cost type: ${costType}` };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * payAbilityCost(gameState, ability, context)
 * 
 * Pay the cost of an ability. Handles both single cost and array of costs.
 * 
 * @param {object} gameState
 * @param {object} ability - The ability descriptor with .cost property
 * @param {object} context
 * @returns {object} Result with success boolean
 */
export function payAbilityCost(gameState, ability, context = {}) {
  if (!ability || !ability.cost) {
    return { success: true }; // No cost to pay
  }
  
  // If cost is an array, treat as multiCost
  if (Array.isArray(ability.cost)) {
    return payCost(gameState, { type: 'multiCost', costs: ability.cost }, context);
  }
  
  return payCost(gameState, ability.cost, context);
}

export default {
  payCost,
  payAbilityCost
};
