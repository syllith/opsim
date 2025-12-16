/**
 * usePlayCard.js - Hook for playing cards from hand to field
 * 
 * Provides functionality to play Character and Event cards from hand,
 * paying DON costs through the engine.
 */
import { useCallback } from 'react';
import engine from '../../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas, getInstanceIdFromAreas } from './engineAdapter.js';

/**
 * usePlayCard - Hook for playing cards via engine
 * 
 * @param {object} options
 * @param {object} options.areas - UI areas state
 * @param {function} options.setAreas - State setter for areas
 * @param {string} options.turnSide - Current turn side
 * @param {number} options.turnNumber - Current turn number
 * @param {string} options.phase - Current phase
 * @param {function} options.appendLog - Log function
 * @param {function} options.hasEnoughDonFor - Check if side has enough DON
 */
export default function usePlayCard({
  areas,
  setAreas,
  turnSide,
  turnNumber = 1,
  phase,
  appendLog,
  hasEnoughDonFor,
}) {
  /**
   * Check if a card can be played from hand
   * @param {object} card - Card object
   * @param {string} side - Side to play from
   * @returns {{ canPlay: boolean, reason?: string }}
   */
  const canPlayCard = useCallback((card, side) => {
    if (!card) {
      return { canPlay: false, reason: 'No card selected' };
    }

    // Must be your turn
    if (turnSide !== side) {
      return { canPlay: false, reason: 'Not your turn' };
    }

    // Must be Main phase
    const phaseLower = (phase || '').toLowerCase();
    if (phaseLower !== 'main') {
      return { canPlay: false, reason: 'Can only play cards during Main phase' };
    }

    // Get card cost
    const cost = card.cost ?? 0;

    // Check if enough DON
    if (cost > 0 && hasEnoughDonFor && !hasEnoughDonFor(side, cost)) {
      return { canPlay: false, reason: `Not enough DON (need ${cost})` };
    }

    // Check card type - only Characters and Events can be played
    const cardType = (card.type || card.cardType || '').toLowerCase();
    if (cardType && !['character', 'event', 'stage'].includes(cardType)) {
      return { canPlay: false, reason: `Cannot play ${cardType} cards` };
    }

    return { canPlay: true };
  }, [turnSide, phase, hasEnoughDonFor]);

  /**
   * Play a card from hand to the field
   * @param {string} side - Side playing the card
   * @param {number} handIndex - Index of card in hand
   * @param {object} options - Play options
   * @param {boolean} options.payCost - Whether to pay DON cost (default true)
   * @param {string} options.destination - Where to play ('char' or 'stage')
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const playCardFromHand = useCallback(async (side, handIndex, options = {}) => {
    const { payCost = true, destination = 'char' } = options;

    if (!areas) {
      appendLog?.('[PlayCard] No game state available');
      return { success: false, error: 'No game state' };
    }

    // Get instance ID from hand
    const section = side === 'player' ? 'bottom' : 'top';
    const instanceId = getInstanceIdFromAreas(areas, side, section, 'hand', handIndex);
    
    if (!instanceId) {
      appendLog?.('[PlayCard] Could not find card in hand');
      return { success: false, error: 'Card not found' };
    }

    // Get the card data to check playability
    const handArr = side === 'player' 
      ? areas?.player?.bottom?.hand 
      : areas?.opponent?.top?.hand;
    const card = handArr?.[handIndex];

    if (!card) {
      appendLog?.('[PlayCard] Card not found at index');
      return { success: false, error: 'Card not found' };
    }

    // Check if can play
    const { canPlay, reason } = canPlayCard(card, side);
    if (!canPlay) {
      appendLog?.(`[PlayCard] Cannot play: ${reason}`);
      return { success: false, error: reason };
    }

    try {
      // Convert UI state to engine state
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      // Execute playCard action
      const result = engine.executeAction(gameState, {
        type: 'playCard',
        instanceId,
        destination,
        options: { payCost }
      }, { activePlayer: side });

      if (result.success) {
        // Convert back and update UI
        const newAreas = convertGameStateToAreas(gameState);
        setAreas?.(newAreas);
        
        const cardName = card.name || card.cardId || card.id || 'Card';
        appendLog?.(`[PlayCard] ${cardName} played to ${destination}${payCost ? ` (paid ${card.cost || 0} DON)` : ''}`);
        
        return { success: true };
      } else {
        appendLog?.(`[PlayCard] Failed: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (e) {
      appendLog?.(`[PlayCard] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  }, [areas, setAreas, turnSide, turnNumber, phase, appendLog, canPlayCard]);

  /**
   * Play an Event card (goes to trash after effect)
   * Events are special - they resolve immediately
   */
  const playEventFromHand = useCallback(async (side, handIndex, options = {}) => {
    // For now, events work similar to characters but with special handling
    // The engine will need to process event effects
    return playCardFromHand(side, handIndex, { 
      ...options, 
      destination: 'stage' // Events go to stage temporarily
    });
  }, [playCardFromHand]);

  return {
    canPlayCard,
    playCardFromHand,
    playEventFromHand
  };
}
