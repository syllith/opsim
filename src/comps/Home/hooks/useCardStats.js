/**
 * useCardStats - Card Statistics Hook
 * 
 * Provides card statistics (power, cost, keywords) with engine integration.
 * 
 * Previously this was a stub returning base values only. Now it calls the engine's
 * getTotalPower() to compute actual power with modifiers, DON bonuses, and effects.
 * 
 * The hook takes additional parameters to build a gameState for the engine:
 * - areas: The UI areas state
 * - turnSide: Current turn side (for DON bonus calculation)
 * - turnNumber: Current turn number
 */
import { useCallback, useMemo } from 'react';
import _ from 'lodash';
import engine from '../../../engine/index.js';
import { convertAreasToGameState, getInstanceIdFromAreas } from './engineAdapter.js';

export default function useCardStats({ 
    metaById, 
    areas = null, 
    turnSide = 'player', 
    turnNumber = 1,
    getSideLocation = null, 
    getDonPowerBonus = null 
}) {
    // Get base power from card metadata (no modifiers)
    const getBasePower = useCallback((id) => {
        // Handle both card objects and plain id strings
        const cardId = typeof id === 'object' ? (id?.cardId || id?.id) : id;
        const meta = metaById.get(cardId) || {};
        return _.get(meta, 'power', 0);
    }, [metaById]);

    // STUB: Engine will handle aura calculations
    // TODO: Implement via engine when aura system is complete
    const getAuraPowerMod = useCallback(() => 0, []);

    /**
     * getTotalPower - Get computed power for a card in play
     * 
     * Calls the engine's getTotalPower() with a converted gameState to compute
     * actual power including:
     * - Base power (printed or modified)
     * - DON bonuses (only on owner's turn)
     * - Continuous effects (setBase, add modifiers)
     * - Battle modifiers (counter bonuses, etc.)
     * 
     * @param {string} side - 'player' or 'opponent'
     * @param {string} section - Section in areas ('char', 'middle', etc.)
     * @param {string} keyName - Key within section ('leader', 'hand', etc.) or null
     * @param {number} index - Index within the array
     * @param {string|object} id - Card id string or card object
     * @returns {number} - Computed total power
     */
    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        // Get base power as fallback
        const basePower = getBasePower(id);
        
        // If we don't have areas, return base power (pre-engine state)
        if (!areas) {
            return basePower;
        }
        
        // Try to get instanceId from the card location
        let instanceId = null;
        
        // If id is a card object, it might have instanceId
        if (typeof id === 'object' && id?.instanceId) {
            instanceId = id.instanceId;
        } else {
            // Try to look up the card in areas to get its instanceId
            instanceId = getInstanceIdFromAreas(areas, side, section, keyName, index);
        }
        
        // If no instanceId available, fall back to base power
        // This can happen for UI-only cards or during setup
        if (!instanceId) {
            return basePower;
        }
        
        // Convert UI areas to engine gameState
        try {
            const gameState = convertAreasToGameState(areas, {
                turnSide,
                turnNumber,
                phase: 'Main' // Phase doesn't affect power calculation much
            });
            
            // Determine if this is the owner's turn (for DON bonus)
            const isOwnerTurn = turnSide === side;
            
            // Call engine to compute total power
            const computedPower = engine.getTotalPower(gameState, instanceId, {
                isOwnerTurn,
                fallbackBase: basePower
            });
            
            return computedPower;
        } catch (e) {
            // If engine call fails, fall back to base power
            console.warn('[useCardStats.getTotalPower] Engine call failed, using base power:', e);
            return basePower;
        }
    }, [areas, turnSide, turnNumber, getBasePower]);

    // STUB: Engine will handle cost modifiers
    // TODO: Implement via engine when cost modification system is complete
    const getAuraCostMod = useCallback(() => 0, []);

    // Get base cost from card metadata (no modifiers)
    const getCardCost = useCallback((id) => {
        if (!id) return 0;
        const cardId = typeof id === 'object' ? (id?.cardId || id?.id) : id;
        const meta = metaById.get(cardId);
        const baseCost = _.get(meta, 'cost', 0);
        return _.isNumber(baseCost) && baseCost > 0 ? baseCost : 0;
    }, [metaById]);

    // Get keywords from card metadata (engine can override with runtime keywords)
    const getKeywordsFor = useCallback((id) => {
        const cardId = typeof id === 'object' ? (id?.cardId || id?.id) : id;
        
        // If we have an instance object with runtime keywords, use those
        if (typeof id === 'object' && Array.isArray(id?.keywords)) {
            return id.keywords;
        }
        
        // Otherwise fall back to printed keywords from metadata
        return _.get(metaById.get(cardId), 'keywords', []);
    }, [metaById]);

    return {
        getBasePower,
        getAuraPowerMod,
        getTotalPower,
        getAuraCostMod,
        getCardCost,
        getKeywordsFor
    };
}
