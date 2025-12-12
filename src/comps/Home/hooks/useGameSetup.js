import { useState, useCallback, useMemo, useEffect } from 'react';
import { createInitialAreas } from './useDeckInitializer';

/**
 * Hook for game setup state and logic
 * Handles game mode, setup phases, dice rolls, and multiplayer coordination
 */
export default function useGameSetup({
    user,
    gameMode,
    setGameMode,
    multiplayer,
    library,
    oppLibrary,
    areas,
    setAreas,
    initializeDonDecks,
    setLibrary,
    setOppLibrary,
    setOpeningHandShown,
    setTurnSide,
    setTurnNumber,
    setPhase,
    resetLog,
    setBattle,
    setCurrentAttack,
    setBattleArrow,
    resetGameInit,
    openingHandRef,
    playerHandSelectedRef,
    opponentHandSelectedRef,
    guestHandInitializedRef,
    openingHandsFinalizedRef,
    setPlayerHandSelected,
    setOpponentHandSelected,
    setOpeningHandsBothSelected
}) {
    // Game Setup State
    const [showLobby, setShowLobby] = useState(false);
    const [setupPhase, setSetupPhase] = useState('dice'); // 'dice' | 'hands' | 'complete'
    const [firstPlayer, setFirstPlayer] = useState(null); // 'player' | 'opponent' - who won dice roll
    const [currentHandSide, setCurrentHandSide] = useState(null); // Which side is currently selecting hand
    const [syncedDiceResult, setSyncedDiceResult] = useState(null); // Dice result from host for guest
    const [userDecks, setUserDecks] = useState([]); // User's saved decks for multiplayer
    const [selectedDeckName, setSelectedDeckName] = useState(null);

    // Game State Flags
    const gameStarted = gameMode !== null;
    const gameSetupComplete = setupPhase === 'complete';

    // Which side does this player control in multiplayer?
    const myMultiplayerSide = useMemo(() => {
        if (gameMode !== 'multiplayer') return 'player';
        return multiplayer.isHost ? 'player' : 'opponent';
    }, [gameMode, multiplayer.isHost]);

    // Determine if this player can take actions in multiplayer
    const isMyTurnInMultiplayer = useCallback((turnSide) => {
        if (gameMode !== 'multiplayer') return true;
        if (!multiplayer.gameStarted) return false;
        
        return multiplayer.isHost 
            ? turnSide === 'player'
            : turnSide === 'opponent';
    }, [gameMode, multiplayer.gameStarted, multiplayer.isHost]);

    // Track if we're waiting for opponent
    const isWaitingForOpponent = useCallback((turnSide) => {
        if (gameMode !== 'multiplayer') return false;
        return multiplayer.gameStarted && !isMyTurnInMultiplayer(turnSide);
    }, [gameMode, multiplayer.gameStarted, isMyTurnInMultiplayer]);

    // Return a friendly player label for logs/UI
    const getPlayerDisplayName = useCallback((side) => {
        if (!side) return 'Unknown Player';
        if (gameMode !== 'multiplayer') {
            return side === 'player' ? 'Player' : 'Opponent';
        }

        const selfName = user || 'You';
        const opponentName = multiplayer.opponentInfo?.username || 'Opponent';

        if (multiplayer.isHost) {
            return side === 'player' ? selfName : opponentName;
        }
        return side === 'player' ? opponentName : selfName;
    }, [gameMode, user, multiplayer.isHost, multiplayer.opponentInfo?.username]);

    // Handle dice roll completion
    const handleDiceRollComplete = useCallback(({ firstPlayer: winner, playerRoll, opponentRoll }) => {
        setFirstPlayer(winner);
        
        // In multiplayer, broadcast dice result and use simultaneous hand selection
        if (gameMode === 'multiplayer') {
            setSetupPhase('hands');
            setCurrentHandSide('both'); // Both players select simultaneously
            setPlayerHandSelected(false);
            setOpponentHandSelected(false);
            playerHandSelectedRef.current = false;
            opponentHandSelectedRef.current = false;
            
            // Sync dice result + setup state to server (server broadcasts to both players)
            setTimeout(() => {
                multiplayer.syncGameState?.({
                    diceResult: { firstPlayer: winner, playerRoll, opponentRoll },
                    setupPhase: 'hands',
                    firstPlayer: winner,
                    currentHandSide: 'both',
                    library,
                    oppLibrary,
                    areas,
                });
            }, 100);
            
            // Initialize opening hand for this player's side
            const mySide = multiplayer.isHost ? 'player' : 'opponent';
            const myLib = multiplayer.isHost ? library : oppLibrary;
            openingHandRef?.current?.initialize(myLib, mySide);
        } else {
            // Sequential mode for vs-self
            setSetupPhase('hand-first');
            setCurrentHandSide(winner);
            const lib = winner === 'player' ? library : oppLibrary;
            openingHandRef?.current?.initialize(lib, winner);
        }
        
        setOpeningHandShown(true);
    }, [
        library,
        oppLibrary,
        gameMode,
        multiplayer,
        areas,
        openingHandRef,
        setOpeningHandShown,
        setPlayerHandSelected,
        setOpponentHandSelected,
        playerHandSelectedRef,
        opponentHandSelectedRef
    ]);

    // Handle game mode selection
    const handleSelectGameMode = useCallback((mode) => {
        if (mode === 'multiplayer') {
            setShowLobby(true);
        } else {
            setGameMode(mode);
        }
    }, [setGameMode]);

    // Leave game and reset all game state
    const leaveGame = useCallback(() => {
        // If in multiplayer, leave the lobby
        if (gameMode === 'multiplayer' && multiplayer.currentLobby) {
            multiplayer.leaveLobby();
        }
        setGameMode(null);
        setShowLobby(false);
        setAreas(createInitialAreas());
        initializeDonDecks();
        setLibrary([]);
        setOppLibrary([]);
        setOpeningHandShown(false);
        setTurnSide('player');
        setTurnNumber(1);
        setPhase('Draw');
        resetLog();
        setBattle(null);
        setCurrentAttack(null);
        setBattleArrow(null);
        setSetupPhase('dice');
        setFirstPlayer(null);
        setCurrentHandSide(null);
        setSyncedDiceResult(null);
        setPlayerHandSelected(false);
        setOpponentHandSelected(false);
        setOpeningHandsBothSelected(false);
        playerHandSelectedRef.current = false;
        opponentHandSelectedRef.current = false;
        guestHandInitializedRef.current = false;
        openingHandsFinalizedRef.current = false;
        resetGameInit();
    }, [
        gameMode,
        initializeDonDecks,
        multiplayer,
        resetGameInit,
        setGameMode,
        setAreas,
        setLibrary,
        setOppLibrary,
        setOpeningHandShown,
        setTurnSide,
        setTurnNumber,
        setPhase,
        resetLog,
        setBattle,
        setCurrentAttack,
        setBattleArrow,
        setPlayerHandSelected,
        setOpponentHandSelected,
        setOpeningHandsBothSelected,
        playerHandSelectedRef,
        opponentHandSelectedRef,
        guestHandInitializedRef,
        openingHandsFinalizedRef
    ]);

    // Allow guests to locally mark their hand selection
    const markHandSelectedLocally = useCallback((side) => {
        if (gameMode !== 'multiplayer') return;
        if (side === 'player') {
            setPlayerHandSelected(true);
            playerHandSelectedRef.current = true;
        } else if (side === 'opponent') {
            setOpponentHandSelected(true);
            opponentHandSelectedRef.current = true;
        }
    }, [gameMode, setPlayerHandSelected, setOpponentHandSelected, playerHandSelectedRef, opponentHandSelectedRef]);

    return {
        // State
        showLobby,
        setShowLobby,
        setupPhase,
        setSetupPhase,
        firstPlayer,
        setFirstPlayer,
        currentHandSide,
        setCurrentHandSide,
        syncedDiceResult,
        setSyncedDiceResult,
        userDecks,
        setUserDecks,
        selectedDeckName,
        setSelectedDeckName,
        
        // Computed
        gameStarted,
        gameSetupComplete,
        myMultiplayerSide,
        
        // Functions
        isMyTurnInMultiplayer,
        isWaitingForOpponent,
        getPlayerDisplayName,
        handleDiceRollComplete,
        handleSelectGameMode,
        leaveGame,
        markHandSelectedLocally
    };
}
