import { useState, useRef, useCallback, useEffect } from 'react';
import _ from 'lodash';

export default function useOpeningHands({
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
}) {
    // UI state
    const [playerHandSelected, setPlayerHandSelected] = useState(false);
    const [opponentHandSelected, setOpponentHandSelected] = useState(false);
    const [openingHandsBothSelected, setOpeningHandsBothSelected] = useState(false);

    // Refs used to avoid stale closures and to expose to parent when needed
    const playerHandSelectedRef = useRef(false);
    const opponentHandSelectedRef = useRef(false);
    const guestHandInitializedRef = useRef(false);
    const openingHandsFinalizedRef = useRef(false);

    // Apply opening hand for a specific side (used by host to apply guest's selection)
    const applyOpeningHandForSide = useCallback((side) => {
        const lib = side === 'player' ? library : oppLibrary;
        const setLib = side === 'player' ? setLibrary : setOppLibrary;

        // Get the top 5 cards (opening hand) and next 5 (life)
        const handIds = _.takeRight(lib, 5);
        const lifeIds = lib.slice(-10, -5);

        const handAssets = handIds.map(id => getAssetForId(id)).filter(Boolean);
        const lifeAssets = lifeIds.map(id => getAssetForId(id)).filter(Boolean).reverse();

        setAreas((prev) => {
            const next = _.cloneDeep(prev);

            if (side === 'player') {
                next.player.bottom.hand = handAssets;
                next.player.life = lifeAssets;
                const remain = Math.max(0, (next.player.middle.deck || []).length - 10);
                next.player.middle.deck = createCardBacks(remain);
            } else {
                next.opponent.top.hand = handAssets;
                next.opponent.life = lifeAssets;
                const remain = Math.max(0, (next.opponent.middle.deck || []).length - 10);
                next.opponent.middle.deck = createCardBacks(remain);
            }

            return next;
        });

        // Remove 10 cards from library (5 hand + 5 life)
        setLib(prev => prev.slice(0, -10));
    }, [library, oppLibrary, getAssetForId, createCardBacks, setAreas, setLibrary, setOppLibrary]);

    // Finalize opening hands and start the game (idempotent)
    const finalizeOpeningHands = useCallback((firstPlayer) => {
        if (openingHandsFinalizedRef.current) { return; }
        openingHandsFinalizedRef.current = true;

        // Close the opening hand overlay for both sides
        setOpeningHandShown && setOpeningHandShown(false);

        setSetupPhase('complete');

        const starter = firstPlayer || 'player';
        // Comprehensive Rules 6-3-1: the player going first does not draw on their first turn.
        // Start directly in DON!! phase so the UI never shows a no-op draw prompt.
        const initialPhase = 'Don';
        
        // In multiplayer, sync the game start state to server
        if (gameMode === 'multiplayer') {
            // Initialize turn state locally
            setTurnSide(starter);
            setTurnNumber(1);
            setPhase(initialPhase);
            executeRefreshPhaseRef && executeRefreshPhaseRef.current && executeRefreshPhaseRef.current(starter);
            appendLog && appendLog(`Game started! ${getPlayerDisplayName ? getPlayerDisplayName(starter) : starter} goes first.`);
            appendLog && appendLog('First turn: skipping Draw Phase.');
            
            // Sync to server
            setTimeout(() => {
                multiplayer.syncGameState({
                    setupPhase: 'complete',
                    turnSide: starter,
                    turnNumber: 1,
                    phase: initialPhase,
                    playerHandSelected: true,
                    opponentHandSelected: true
                });
            }, 100);
            return;
        }

        // Single-player: initialize turn locally
        setTurnSide(starter);
        setTurnNumber(1);
        executeRefreshPhaseRef && executeRefreshPhaseRef.current && executeRefreshPhaseRef.current(starter);
        setPhase(initialPhase);
        appendLog && appendLog(`Game started! ${getPlayerDisplayName ? getPlayerDisplayName(starter) : starter} goes first.`);
        appendLog && appendLog('First turn: skipping Draw Phase.');
    }, [appendLog, executeRefreshPhaseRef, gameMode, getPlayerDisplayName, multiplayer, setOpeningHandShown, setPhase, setSetupPhase, setTurnNumber, setTurnSide, firstPlayer]);

    // Handle when a player finishes selecting their hand
    const handleHandSelected = useCallback((side) => {
        //. Multiplayer simultaneous selection
        if (gameMode === 'multiplayer') {
            //. Determine which side this player controls
            const mySide = multiplayer.isHost ? 'player' : 'opponent';
            
            //. Mark this side as having selected (update both state and ref)
            if (side === 'player') {
                setPlayerHandSelected(true);
                playerHandSelectedRef.current = true;
            } else {
                setOpponentHandSelected(true);
                opponentHandSelectedRef.current = true;
            }

            //. Check if both sides have selected using refs (avoids stale closure issues)
            const playerDone = playerHandSelectedRef.current;
            const opponentDone = opponentHandSelectedRef.current;
            setOpeningHandsBothSelected(playerDone && opponentDone);

            //. Sync hand selection to server
            setTimeout(() => {
                multiplayer.syncGameState({
                    playerHandSelected: playerDone,
                    opponentHandSelected: opponentDone,
                    setupPhase: 'hands'
                });
            }, 50);

            //. Finalize immediately once both are done
            if (playerDone && opponentDone) {
                finalizeOpeningHands(firstPlayer);
            }
            return;
        }

        // For non-multiplayer flows finalization is handled externally
    }, [gameMode, multiplayer, finalizeOpeningHands, firstPlayer, setPlayerHandSelected, setOpponentHandSelected, setOpeningHandsBothSelected, playerHandSelectedRef, opponentHandSelectedRef]);

    // Expose a small API and refs so parent can integrate with existing effects
    return {
        playerHandSelected,
        setPlayerHandSelected,
        opponentHandSelected,
        setOpponentHandSelected,
        openingHandsBothSelected,
        setOpeningHandsBothSelected,
        playerHandSelectedRef,
        opponentHandSelectedRef,
        guestHandInitializedRef,
        openingHandsFinalizedRef,
        applyOpeningHandForSide,
        finalizeOpeningHands,
        handleHandSelected
    };
}
