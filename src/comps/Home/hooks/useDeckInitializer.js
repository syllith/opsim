/**
 * useDeckInitializer - STUB
 * TODO: Replace with engine.core.gameState.createInitialState()
 * 
 * This hook previously handled deck initialization and shuffling.
 * Now returns stub functions. Real implementation in src/engine/
 */
import { useCallback } from 'react';

// Creates empty areas structure for UI rendering
export function createInitialAreas() {
    const createSideAreas = (isPlayer) => ({
        top: isPlayer ? { don: [], cost: [] } : { hand: [], don: [], cost: [] },
        middle: { deck: [], leader: [], stage: [], leaderDon: [] },
        bottom: isPlayer ? { hand: [], don: [], cost: [] } : { don: [], cost: [] },
        life: [],
        trash: [],
        char: [],
        charDon: []
    });

    return {
        player: createSideAreas(true),
        opponent: createSideAreas(false)
    };
}

export function useDeckInitializer({
    metaById,
    getAssetForId,
    createCardBacks,
    setAreas,
    setLibrary,
    setOppLibrary
}) {
    // STUB: Engine will handle deck initialization
    const initializeDeck = useCallback((deckList, side = 'player') => {
        console.warn('[useDeckInitializer.initializeDeck] STUB - engine not implemented');
        return [];
    }, []);

    // STUB: Engine will handle shuffling
    const shuffleDeck = useCallback((side = 'player') => {
        console.warn('[useDeckInitializer.shuffleDeck] STUB - engine not implemented');
    }, []);

    return {
        initializeDeck,
        shuffleDeck,
        createInitialAreas
    };
}

export default useDeckInitializer;
