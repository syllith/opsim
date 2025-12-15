/**
 * useBoard.js - React State Wrapper for Board/Zones
 * 
 * PURPOSE: Provides React state that triggers re-renders when zones change.
 * This is a THIN WRAPPER - it holds state that the engine will update.
 * 
 * FUTURE: When engine is implemented, this hook will:
 * 1. Subscribe to engine.on('stateChange', ...)
 * 2. Call setAreas() when engine emits state changes
 * 3. The engine manages the canonical state, this just mirrors it for React
 */
import { useState, useCallback } from 'react';
import _ from 'lodash';
import { createInitialAreas } from './useDeckInitializer';

export default function useBoard() {
    // React state for zones - triggers re-renders
    const [areas, setAreas] = useState(createInitialAreas);

    // Clone helper for immutable updates
    const cloneAreas = useCallback((prev) => _.cloneDeep(prev), []);

    // Mutation wrapper - used by UI until engine takes over
    // TODO: Replace direct mutations with engine.actions.* calls
    const mutateAreas = useCallback((recipeFn, { onErrorLabel } = {}) => {
        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            try {
                recipeFn(next, prev);
                return next;
            } catch (error) {
                console.warn(onErrorLabel || '[mutateAreas] Failed', error);
                return prev;
            }
        });
    }, []);

    // Read-only accessors (used by UI for rendering)
    const getSideLocation = useCallback((side) => areas?.[side], [areas]);
    
    const getHandCostLocation = useCallback(
        (side) => side === 'player' ? areas?.player?.bottom : areas?.opponent?.top,
        [areas]
    );

    const getCharArray = useCallback(
        (side) => side === 'player' ? (areas?.player?.char || []) : (areas?.opponent?.char || []),
        [areas]
    );

    const getLeaderArray = useCallback(
        (side) => side === 'player' 
            ? (areas?.player?.middle?.leader || []) 
            : (areas?.opponent?.middle?.leader || []),
        [areas]
    );

    // Legacy mutation helpers - TODO: Remove when engine handles all mutations
    const addCardToAreaUnsafe = useCallback((side, section, key, card) => {
        if (!card) return;
        mutateAreas((next) => {
            const target = key ? next[side]?.[section]?.[key] : next[side]?.[section];
            if (Array.isArray(target)) {
                target.push(_.cloneDeep(card));
            }
        });
    }, [mutateAreas]);

    const removeCardFromAreaUnsafe = useCallback((side, section, key) => {
        mutateAreas((next) => {
            const target = key ? next[side]?.[section]?.[key] : next[side]?.[section];
            if (Array.isArray(target) && target.length > 0) {
                target.pop();
            }
        });
    }, [mutateAreas]);

    return {
        // State
        areas,
        setAreas,
        
        // Helpers
        cloneAreas,
        mutateAreas,
        
        // Read-only accessors
        getSideLocation,
        getHandCostLocation,
        getCharArray,
        getLeaderArray,
        
        // Legacy (to be removed)
        addCardToAreaUnsafe,
        removeCardFromAreaUnsafe
    };
}
