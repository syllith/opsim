import { useEffect, useRef } from 'react';
import _ from 'lodash';

export default function useGuestActions({
    multiplayer,
    api
}) {
    const applyingHostSyncRef = useRef(false);
    const guestSyncTimeoutRef = useRef(null);
    const lastGuestSyncRef = useRef(null);
    const setupPhaseRef = useRef(null);

    const {
        applyOpeningHandForSide,
        handleHandSelected,
        broadcastStateToOpponent,
        broadcastStateToOpponentRef,
        setOppLibrary,
        canPerformGameAction,
        turnSide,
        battle,
        phaseLower,
        turnNumber,
        hasEnoughDonFor,
        getCardCost,
        cloneAreas,
        setAreas,
        appendLog,
        drawCard,
        donPhaseGain,
        cancelDonGiving,
        setTurnNumber,
        setTurnSide,
        executeRefreshPhase,
        setPhase,
        giveDonToCard,
        startDonGiving,
        applyBlocker,
        skipBlock,
        addCounterFromHand,
        playCounterEventFromHand,
        endCounterStep,
        setModifierState,
        setLibrary,
        setOppLibraryState,
        setBattle,
        setCurrentAttack,
        setBattleArrow,
        setOncePerTurnUsage,
        setAttackLocked,
        setSetupPhase,
        setOpeningHandShown,
        playerHandSelected,
        opponentHandSelected,
        areasState,
        libraryState,
        oppLibraryState,
        firstPlayer,
        currentHandSide,
        setupPhase,
        phase,
        openingHandShown,
        // live state values needed for guest->host snapshot
        currentAttack,
        battleArrow,
        oncePerTurnUsage,
        attackLocked,
        // Attack functions for guest-initiated attacks
        beginAttackForLeader,
        beginAttackForCard
    } = api || {};

    const getModifierState = api?.getModifierState;

    // Keep setupPhaseRef in sync with setupPhase state to avoid stale closures
    useEffect(() => {
        setupPhaseRef.current = setupPhase;
    }, [setupPhase]);

    // Extended optional helpers (may be undefined)
    const {
        initializeDonDecks,
        resetGameInit,
        createInitialAreas,
        resetLog,
        openingHandRef,
        setPlayerHandSelected,
        setOpponentHandSelected,
        setOpeningHandsBothSelected,
        playerHandSelectedRef,
        opponentHandSelectedRef,
        guestHandInitializedRef,
        openingHandsFinalizedRef,
        setFirstPlayer,
        setCurrentHandSide
    } = api || {};

    // Register guest action handler (host only)
    useEffect(() => {
        if (!multiplayer || !multiplayer.setOnGuestAction) return;

        const handler = (action) => {
            console.log('[Multiplayer Host] Received guest action:', action);

            switch (action.type) {
                case 'handSelected':
                    applyOpeningHandForSide && applyOpeningHandForSide('opponent');
                    handleHandSelected && handleHandSelected('opponent');
                    // If both hands are now selected, immediately update ref to prevent stale sync issues
                    // (handleHandSelected will have called setSetupPhase('complete') if both done)
                    if (playerHandSelectedRef?.current && opponentHandSelectedRef) {
                        opponentHandSelectedRef.current = true; // ensure it's marked
                        if (playerHandSelectedRef.current) {
                            setupPhaseRef.current = 'complete';
                        }
                    }
                    // Use the ref to get the latest broadcastStateToOpponent with fresh state
                    // This avoids stale closure issues since React will have re-rendered by then
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 150);
                    break;
                case 'mulligan':
                    console.log('[Multiplayer Host] Applying guest mulligan to oppLibrary');
                    if (setOppLibrary) {
                        setOppLibrary((prev) => {
                            const cur5 = _.takeRight(prev, 5);
                            const rest = _.dropRight(prev, 5);
                            const newLib = [...cur5, ...rest];
                            
                            // Broadcast with the NEW library value directly
                            // (broadcastStateToOpponent uses stale closure state)
                            setTimeout(() => {
                                if (multiplayer && multiplayer.broadcastGameState) {
                                    console.log('[Multiplayer Host] Broadcasting updated oppLibrary after mulligan');
                                    multiplayer.broadcastGameState({ 
                                        oppLibrary: newLib,
                                        setupPhase: 'hands'
                                    });
                                }
                            }, 50);
                            
                            return newLib;
                        });
                    }
                    break;
                case 'playCard':
                    try {
                        const { cardId, actionCardIndex = 0, actionSource = null, cost: clientCost, turnNumber: clientTurn } = action.payload || {};
                        const side = 'opponent';

                        if (!canPerformGameAction || !canPerformGameAction()) {
                            console.warn('[Multiplayer Host] playCard rejected: game action not allowed');
                            return;
                        }
                        if (turnSide !== side) {
                            console.warn('[Multiplayer Host] playCard rejected: not opponent turn');
                            return;
                        }
                        if (battle) {
                            console.warn('[Multiplayer Host] playCard rejected: battle in progress');
                            return;
                        }
                        if (phaseLower !== 'main') {
                            console.warn('[Multiplayer Host] playCard rejected: not main phase');
                            return;
                        }

                        if (clientTurn && clientTurn !== turnNumber) {
                            console.warn('[Multiplayer Host] playCard turn mismatch: guest', clientTurn, 'host', turnNumber);
                        }

                        const section = actionSource?.section || 'top';
                        const keyName = actionSource?.keyName || 'hand';
                        const idx = Number.isInteger(actionCardIndex) ? actionCardIndex : 0;
                        const computedCost = getCardCost ? getCardCost(cardId, side, section, keyName, idx) : undefined;
                        const cost = computedCost ?? clientCost ?? 0;

                        if (hasEnoughDonFor && !hasEnoughDonFor(side, cost)) {
                            appendLog && appendLog(`Cannot play ${cardId}: need ${cost} DON (opponent).`);
                            return;
                        }

                        let placedFieldIndex = -1;

                        if (setAreas && cloneAreas) {
                            setAreas((prev) => {
                                const next = cloneAreas(prev);
                                const hand = _.get(next, 'opponent.top.hand', []);
                                const cardIndex = idx >= 0 && idx < hand.length
                                    ? idx
                                    : _.findIndex(hand, ['id', cardId]);
                                const chars = _.get(next, 'opponent.char', []);

                                if (cardIndex === -1 || chars.length >= 5) {
                                    console.warn('[Multiplayer Host] playCard rejected: card not found or no field space');
                                    return next;
                                }

                                if (cost > 0) {
                                    const pool = next.opponent.top.cost || [];
                                    let remainingCost = cost;
                                    for (let i = 0; i < pool.length && remainingCost > 0; i++) {
                                        const don = pool[i];
                                        if (don.id === 'DON' && !don.rested) {
                                            don.rested = true;
                                            remainingCost--;
                                        }
                                    }
                                }

                                const [cardToPlay] = hand.splice(cardIndex, 1);
                                next.opponent.top.hand = hand;

                                placedFieldIndex = chars.length;
                                const placedCard = { ...cardToPlay, rested: false, enteredTurn: turnNumber, justPlayed: true };
                                next.opponent.char = [...chars, placedCard];

                                return next;
                            });

                            const logMessage = `[opponent] Played ${cardId}${cost ? ` by resting ${cost} DON` : ''}.`;
                            appendLog && appendLog(logMessage);

                            setTimeout(() => {
                                broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                            }, 50);
                        }
                    } catch (err) {
                        console.error('[Multiplayer Host] playCard handling error:', err);
                    }
                    break;
                case 'endTurn': {
                    appendLog && appendLog('[End Phase] Opponent ended their turn.');
                    const nextSide = 'player';
                    cancelDonGiving && cancelDonGiving();
                    setTurnNumber && setTurnNumber((n) => n + 1);
                    setTurnSide && setTurnSide(nextSide);
                    executeRefreshPhase && executeRefreshPhase(nextSide);
                    setPhase && setPhase('Draw');
                    // Broadcast turn change to guest
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'drawCard': {
                    drawCard && drawCard('opponent');
                    // Broadcast to update guest's view of the areas
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'donPhaseGain': {
                    const amt = action.amount || 2;
                    donPhaseGain && donPhaseGain('opponent', amt);
                    setPhase && setPhase('Main');
                    // Broadcast phase change and don state
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'setPhase': {
                    setPhase && setPhase(action.phase);
                    // Broadcast phase change
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'giveDonToCard': {
                    const { side, section, keyName, index } = action.payload || {};
                    if (side && section && keyName !== undefined && index !== undefined) {
                        giveDonToCard && giveDonToCard(side, section, keyName, index);
                    }
                    // Broadcast DON placement
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'startDonGiving': {
                    const { side, donIndex } = action.payload || {};
                    if (side && donIndex !== undefined) {
                        startDonGiving && startDonGiving(side, donIndex);
                    }
                    break;
                }
                case 'cancelDonGiving': {
                    cancelDonGiving && cancelDonGiving();
                    break;
                }
                case 'useBlocker': {
                    const { blockerIndex } = action.payload || {};
                    if (blockerIndex !== undefined) {
                        applyBlocker && applyBlocker(blockerIndex);
                    }
                    // Broadcast blocker state
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'skipBlock': {
                    skipBlock && skipBlock();
                    // Broadcast battle state after skipping block
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'addCounter': {
                    const { cardIndex } = action.payload || {};
                    if (cardIndex !== undefined) {
                        addCounterFromHand && addCounterFromHand(cardIndex);
                    }
                    // Broadcast counter state
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'playCounterEvent': {
                    const { cardIndex } = action.payload || {};
                    if (cardIndex !== undefined) {
                        playCounterEventFromHand && playCounterEventFromHand(cardIndex);
                    }
                    // Broadcast counter event state
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'endCounter': {
                    endCounterStep && endCounterStep();
                    // Broadcast end of counter step
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                case 'beginAttack': {
                    //. Guest initiated an attack - host executes it
                    const { isLeader, cardId, attackIdx, attackingSide } = action.payload || {};
                    console.log('[Multiplayer Host] Processing guest attack:', { isLeader, cardId, attackIdx, attackingSide });
                    
                    //. Validate the attack is from the guest's side (opponent)
                    if (attackingSide !== 'opponent') {
                        console.warn('[Multiplayer Host] beginAttack rejected: invalid attacking side');
                        break;
                    }
                    
                    //. Find the attacking card from areas
                    const attackCard = isLeader
                        ? _.get(areasState, ['opponent', 'middle', 'leader', 0])
                        : _.get(areasState, ['opponent', 'char', attackIdx]);
                    
                    if (!attackCard) {
                        console.warn('[Multiplayer Host] beginAttack rejected: attack card not found');
                        break;
                    }
                    
                    //. Execute the attack on the host
                    if (isLeader && beginAttackForLeader) {
                        beginAttackForLeader(attackCard, attackingSide);
                    } else if (!isLeader && beginAttackForCard) {
                        beginAttackForCard(attackCard, attackIdx, attackingSide);
                    }
                    
                    //. Broadcast the new battle state after a short delay
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 150);
                    break;
                }
                case 'syncState': {
                    const state = action.payload || {};
                    console.log('[Multiplayer Host] Received syncState from guest:', { 
                        hasBattle: state.battle !== undefined, 
                        hasAreas: state.areas !== undefined,
                        battleStep: state.battle?.step 
                    });
                    // Accept battle-related state from guest during their attacks
                    if (state.battle !== undefined) setBattle && setBattle(state.battle);
                    if (state.currentAttack !== undefined) setCurrentAttack && setCurrentAttack(state.currentAttack);
                    if (state.battleArrow !== undefined) setBattleArrow && setBattleArrow(state.battleArrow);
                    if (state.oncePerTurnUsage !== undefined) setOncePerTurnUsage && setOncePerTurnUsage(state.oncePerTurnUsage);
                    if (state.attackLocked !== undefined) setAttackLocked && setAttackLocked(state.attackLocked);
                    // Accept areas state from guest during their attacks (includes rested leaders, etc)
                    if (state.areas !== undefined) setAreas && setAreas(state.areas);
                    
                    // After accepting guest's state, broadcast it back so guest doesn't get overwritten
                    setTimeout(() => {
                        broadcastStateToOpponentRef?.current && broadcastStateToOpponentRef.current();
                    }, 100);
                    break;
                }
                default:
                    console.log('[Multiplayer Host] Unknown guest action:', action.type);
            }
        };

        multiplayer.setOnGuestAction(handler);

        return () => {
            // Clear the handler when unmounting
            multiplayer.setOnGuestAction(null);
        };
    }, [
        multiplayer,
        applyOpeningHandForSide,
        handleHandSelected,
        broadcastStateToOpponent,
        setOppLibrary,
        canPerformGameAction,
        turnSide,
        battle,
        phaseLower,
        turnNumber,
        hasEnoughDonFor,
        getCardCost,
        cloneAreas,
        setAreas,
        appendLog,
        drawCard,
        donPhaseGain,
        cancelDonGiving,
        setTurnNumber,
        setTurnSide,
        executeRefreshPhase,
        setPhase,
        giveDonToCard,
        startDonGiving,
        applyBlocker,
        skipBlock,
        addCounterFromHand,
        playCounterEventFromHand,
        endCounterStep,
        setModifierState,
        setLibrary,
        setOppLibraryState,
        setBattle,
        setCurrentAttack,
        setBattleArrow,
        setOncePerTurnUsage,
        setAttackLocked,
        setSetupPhase,
        setOpeningHandShown,
        areasState,
        beginAttackForLeader,
        beginAttackForCard
    ]);

    // Handle game start event from server
    useEffect(() => {
        if (!multiplayer || !multiplayer.setOnGameStart) return;

        const handler = (data) => {
            console.log('[Multiplayer] Game starting (useGuestActions):', data);

            // Only guests should reset state here - host initializes via useDeckInitializer
            // and we don't want to clear the host's library before the dice roll
            const amHost = data.isHost;
            if (amHost) {
                console.log('[Multiplayer Host] Skipping state reset in onGameStart - deck init handles it');
                return;
            }

            // Guest: reset local state, will receive state from host
            if (createInitialAreas && setAreas) {
                try {
                    setAreas(createInitialAreas());
                } catch (e) {
                    // fallback: clear areas if factory not available
                    setAreas && setAreas({});
                }
            } else if (setAreas) {
                setAreas({});
            }

            if (initializeDonDecks) initializeDonDecks();
            if (setLibrary) setLibrary([]);
            if (setOppLibraryState) setOppLibraryState([]);
            if (setOpeningHandShown) setOpeningHandShown(false);
            if (setTurnSide) setTurnSide('player');
            if (setTurnNumber) setTurnNumber(1);
            if (setPhase) setPhase('Draw');
            if (resetLog) resetLog();
            if (setBattle) setBattle(null);
            if (setCurrentAttack) setCurrentAttack(null);
            if (setBattleArrow) setBattleArrow && setBattleArrow(null);
            if (setFirstPlayer) setFirstPlayer && setFirstPlayer(null);
            if (setCurrentHandSide) setCurrentHandSide && setCurrentHandSide(null);

            // Reset opening-hand selection flags if provided
            if (setPlayerHandSelected) setPlayerHandSelected(false);
            if (setOpponentHandSelected) setOpponentHandSelected(false);
            if (setOpeningHandsBothSelected) setOpeningHandsBothSelected && setOpeningHandsBothSelected(false);

            if (playerHandSelectedRef) playerHandSelectedRef.current = false;
            if (opponentHandSelectedRef) opponentHandSelectedRef.current = false;
            if (guestHandInitializedRef) guestHandInitializedRef.current = false;
            if (openingHandsFinalizedRef) openingHandsFinalizedRef.current = false;

            if (openingHandRef && openingHandRef.current && typeof openingHandRef.current.reset === 'function') {
                try { openingHandRef.current.reset(); } catch (e) { /* noop */ }
            }

            if (resetGameInit) resetGameInit();

            // Note: Home component is responsible for setting UI mode (gameMode, showLobby)
        };

        multiplayer.setOnGameStart(handler);

        return () => {
            multiplayer.setOnGameStart && multiplayer.setOnGameStart(null);
        };
    }, [multiplayer, createInitialAreas, setAreas, initializeDonDecks, setLibrary, setOppLibraryState, setOpeningHandShown, setTurnSide, setTurnNumber, setPhase, resetLog, setBattle, setCurrentAttack, setBattleArrow, setFirstPlayer, setCurrentHandSide, setPlayerHandSelected, setOpponentHandSelected, setOpeningHandsBothSelected, playerHandSelectedRef, opponentHandSelectedRef, guestHandInitializedRef, openingHandsFinalizedRef, openingHandRef, resetGameInit]);

    // Handle full game state sync from host (GUEST receives state)
    useEffect(() => {
        if (!multiplayer || !multiplayer.setOnGameStateSync) return;

        const handler = (gameState) => {
            applyingHostSyncRef.current = true;
            
            // Protect against out-of-order syncs: never go backwards from 'complete'
            const currentSetupPhase = setupPhaseRef?.current;
            const isStaleSync = currentSetupPhase === 'complete' && gameState.setupPhase !== 'complete';
            
            if (isStaleSync) {
                console.log('[Multiplayer Guest] Ignoring stale sync (setupPhase already complete)');
                setTimeout(() => { applyingHostSyncRef.current = false; }, 0);
                return;
            }

            if (gameState.areas && setAreas) setAreas(gameState.areas);
            if (gameState.library !== undefined && setLibrary) setLibrary(gameState.library);
            if (gameState.oppLibrary !== undefined && setOppLibraryState) setOppLibraryState(gameState.oppLibrary);
            if (gameState.turnSide && setTurnSide) setTurnSide(gameState.turnSide);
            if (gameState.turnNumber !== undefined && setTurnNumber) setTurnNumber(gameState.turnNumber);
            if (gameState.phase && setPhase) setPhase(gameState.phase);
            if (gameState.firstPlayer !== undefined && setFirstPlayer) setFirstPlayer(gameState.firstPlayer);
            if (gameState.currentHandSide !== undefined && setCurrentHandSide) setCurrentHandSide(gameState.currentHandSide);

            if (gameState.modifiers && setModifierState) setModifierState(gameState.modifiers);

            if (gameState.battle !== undefined && setBattle) setBattle(gameState.battle);
            if (gameState.currentAttack !== undefined && setCurrentAttack) setCurrentAttack(gameState.currentAttack);
            if (gameState.battleArrow !== undefined && setBattleArrow) setBattleArrow && setBattleArrow(gameState.battleArrow);

            if (gameState.oncePerTurnUsage !== undefined && setOncePerTurnUsage) setOncePerTurnUsage(gameState.oncePerTurnUsage);
            if (gameState.attackLocked !== undefined && setAttackLocked) setAttackLocked(gameState.attackLocked);

            // Sync hand selection state (if setters available)
            if (typeof setPlayerHandSelected === 'function' && typeof setOpponentHandSelected === 'function') {
                if (gameState.playerHandSelected !== undefined) {
                    const nextVal = (playerHandSelectedRef && playerHandSelectedRef.current) || gameState.playerHandSelected;
                    setPlayerHandSelected(nextVal);
                    if (playerHandSelectedRef) playerHandSelectedRef.current = nextVal;
                }
                if (gameState.opponentHandSelected !== undefined) {
                    const nextVal = (opponentHandSelectedRef && opponentHandSelectedRef.current) || gameState.opponentHandSelected;
                    setOpponentHandSelected(nextVal);
                    if (opponentHandSelectedRef) opponentHandSelectedRef.current = nextVal;
                }

                const bothPlayersSelected = (playerHandSelectedRef?.current || gameState.playerHandSelected) && (opponentHandSelectedRef?.current || gameState.opponentHandSelected);
                if (setOpeningHandsBothSelected) setOpeningHandsBothSelected(bothPlayersSelected);
            }

            // Handle opening-hand visibility
            if ((playerHandSelectedRef?.current && opponentHandSelectedRef?.current) || gameState.setupPhase === 'complete') {
                setOpeningHandShown && setOpeningHandShown(false);
                if (guestHandInitializedRef) guestHandInitializedRef.current = false;
            } else if (gameState.openingHandShown !== undefined && setOpeningHandShown) {
                const guestAlreadySelectedHand = gameState.opponentHandSelected || (opponentHandSelectedRef && opponentHandSelectedRef.current);
                if (gameState.openingHandShown && !guestAlreadySelectedHand && gameState.setupPhase === 'hands') {
                    setOpeningHandShown(true);
                } else if (!gameState.openingHandShown) {
                    setOpeningHandShown(false);
                }
            }

            if (gameState.setupPhase && setSetupPhase) {
                setSetupPhase((prev) => {
                    if (prev === 'complete' && gameState.setupPhase !== 'complete') { return prev; }
                    if ((playerHandSelectedRef?.current || gameState.playerHandSelected) && (opponentHandSelectedRef?.current || gameState.opponentHandSelected) && gameState.setupPhase === 'hands') {
                        // Update ref immediately when transitioning to complete
                        if (setupPhaseRef) setupPhaseRef.current = 'complete';
                        return 'complete';
                    }
                    // Update ref when accepting the incoming setupPhase
                    if (setupPhaseRef) setupPhaseRef.current = gameState.setupPhase;
                    return gameState.setupPhase;
                });
            }

            // If dice result included, store it if setter provided
            if (gameState.diceResult && typeof api.setSyncedDiceResult === 'function') {
                api.setSyncedDiceResult(gameState.diceResult);
            }

            // Initialize guest opening hand once if conditions met
            const guestAlreadySelected = gameState.opponentHandSelected || (opponentHandSelectedRef && opponentHandSelectedRef.current);
            if (gameState.setupPhase === 'hands' && !guestAlreadySelected && !(playerHandSelectedRef?.current && opponentHandSelectedRef?.current) && guestHandInitializedRef && !guestHandInitializedRef.current) {
                guestHandInitializedRef.current = true;
                const lib = gameState.oppLibrary || oppLibraryState;
                console.log('[Multiplayer Guest] Initializing opening hand (useGuestActions)');
                if (openingHandRef?.current?.initialize) {
                    try { openingHandRef.current.initialize(lib, 'opponent'); } catch (e) { /* noop */ }
                }
            }
            
            // Update guest's opening hand display after mulligan (if already initialized and hand not selected)
            if (gameState.setupPhase === 'hands' && guestHandInitializedRef?.current && !guestAlreadySelected && gameState.oppLibrary) {
                console.log('[Multiplayer Guest] Updating opening hand display after sync');
                if (openingHandRef?.current?.updateHandDisplay) {
                    try { openingHandRef.current.updateHandDisplay(gameState.oppLibrary); } catch (e) { /* noop */ }
                }
            }

            setTimeout(() => { applyingHostSyncRef.current = false; }, 0);
        };

        multiplayer.setOnGameStateSync(handler);

        return () => {
            multiplayer.setOnGameStateSync && multiplayer.setOnGameStateSync(null);
        };
    }, [multiplayer, setAreas, setLibrary, setOppLibraryState, setTurnSide, setTurnNumber, setPhase, setFirstPlayer, setCurrentHandSide, setModifierState, setBattle, setCurrentAttack, setBattleArrow, setOncePerTurnUsage, setAttackLocked, setPlayerHandSelected, setOpponentHandSelected, playerHandSelectedRef, opponentHandSelectedRef, setOpeningHandsBothSelected, setOpeningHandShown, setSetupPhase, guestHandInitializedRef, openingHandRef, oppLibraryState, api, setOpeningHandsBothSelected]);

    // Opponent-left handler + auto-broadcast effect
    useEffect(() => {
        if (!multiplayer) return;

        if (multiplayer.setOnOpponentLeft) {
            multiplayer.setOnOpponentLeft((data) => {
                appendLog && appendLog(`[System] Opponent ${data.username} has ${data.disconnected ? 'disconnected' : 'left the game'}.`);
                appendLog && appendLog('[System] Game ended. You can leave the game.');
                setSetupPhase && setSetupPhase('complete');
                setOpeningHandShown && setOpeningHandShown(false);
            });
        }

        return () => {
            if (multiplayer.setOnOpponentLeft) multiplayer.setOnOpponentLeft(null);
        };
    }, [multiplayer, appendLog, setSetupPhase, setOpeningHandShown]);

    useEffect(() => {
        // Guest -> Host state sync: when guest resolves actions locally, mirror state back to host
        // NOTE: This sync is VERY limited - host is authoritative for most state.
        // Guest only syncs things that the guest can change (battle decisions, counter steps, etc.)
        if (!multiplayer || multiplayer.isHost || !multiplayer.gameStarted) return;
        if (applyingHostSyncRef.current) return;
        
        // During setup phase, don't sync anything - host controls setup entirely
        if (setupPhase !== 'complete') return;

        // NOTE: Do NOT sync library/oppLibrary/areas/turnSide/turnNumber/phase from guest to host!
        // The host is the authoritative source for game state. Guest only syncs battle-related state.
        const snapshot = {
            // Only sync battle-related state that guest can modify
            setupPhase, // so host knows guest finished setup
            battle,
            currentAttack,
            battleArrow,
            oncePerTurnUsage: api?.oncePerTurnUsage,
            attackLocked: api?.attackLocked
        };

        const payloadKey = JSON.stringify(snapshot);
        if (payloadKey === lastGuestSyncRef.current) {
            return;
        }

        if (guestSyncTimeoutRef.current) clearTimeout(guestSyncTimeoutRef.current);

        guestSyncTimeoutRef.current = setTimeout(() => {
            lastGuestSyncRef.current = payloadKey;
            multiplayer.sendGuestAction && multiplayer.sendGuestAction({ type: 'syncState', payload: snapshot });
        }, 60);

        return () => {
            if (guestSyncTimeoutRef.current) clearTimeout(guestSyncTimeoutRef.current);
        };
    }, [multiplayer, setupPhase, battle, currentAttack, battleArrow, api?.oncePerTurnUsage, api?.attackLocked]);
}
