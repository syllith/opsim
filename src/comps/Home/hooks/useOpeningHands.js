/**
 * useOpeningHands - STUB
 * TODO: Replace with engine setup flow
 * 
 * This hook previously managed opening hand selection state and mechanics.
 * Now returns stub state and functions for UI compatibility.
 * Real implementation will be in src/engine/
 */
import { useState, useCallback, useRef } from 'react';

export default function useOpeningHands(props = {}) {
    // Destructure what Home.jsx passes (even though we don't use it)
    const {
        gameMode,
        multiplayer,
        library,
        oppLibrary,
        setLibrary,
        setOppLibrary,
        setAreas,
        createCardBacks,
        getAssetForId,
        openingHandRef,
        appendLog,
        executeRefreshPhaseRef,
        broadcastStateToOpponentRef,
        setTurnSide,
        setTurnNumber,
        setPhase,
        setSetupPhase,
        setOpeningHandShown,
        getPlayerDisplayName,
        firstPlayer
    } = props;

    // State
    const [playerHandSelected, setPlayerHandSelected] = useState(false);
    const [opponentHandSelected, setOpponentHandSelected] = useState(false);
    const [openingHandsBothSelected, setOpeningHandsBothSelected] = useState(false);

    // Refs (for async callbacks)
    const playerHandSelectedRef = useRef(false);
    const opponentHandSelectedRef = useRef(false);
    const guestHandInitializedRef = useRef(false);
    const openingHandsFinalizedRef = useRef(false);

    // STUB: Apply opening hand for a side
    const applyOpeningHandForSide = useCallback((side) => {
        console.warn('[useOpeningHands.applyOpeningHandForSide] STUB - engine not implemented');
    }, []);

    // STUB: Finalize opening hands
    const finalizeOpeningHands = useCallback(() => {
        console.warn('[useOpeningHands.finalizeOpeningHands] STUB - engine not implemented');
        setOpeningHandsBothSelected(true);
    }, []);

    // STUB: Handle hand selected
    const handleHandSelected = useCallback((side) => {
        console.warn('[useOpeningHands.handleHandSelected] STUB - engine not implemented');
        if (side === 'player') {
            setPlayerHandSelected(true);
            playerHandSelectedRef.current = true;
        } else {
            setOpponentHandSelected(true);
            opponentHandSelectedRef.current = true;
        }
    }, []);

    // Reset state
    const resetHands = useCallback(() => {
        setPlayerHandSelected(false);
        setOpponentHandSelected(false);
        setOpeningHandsBothSelected(false);
        playerHandSelectedRef.current = false;
        opponentHandSelectedRef.current = false;
        guestHandInitializedRef.current = false;
        openingHandsFinalizedRef.current = false;
    }, []);

    return {
        // State
        playerHandSelected,
        setPlayerHandSelected,
        opponentHandSelected,
        setOpponentHandSelected,
        openingHandsBothSelected,
        setOpeningHandsBothSelected,
        
        // Refs
        playerHandSelectedRef,
        opponentHandSelectedRef,
        guestHandInitializedRef,
        openingHandsFinalizedRef,
        
        // Functions
        applyOpeningHandForSide,
        finalizeOpeningHands,
        handleHandSelected,
        resetHands
    };
}
