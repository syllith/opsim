/**
 * Home.jsx - Main game component for One Piece TCG Sim
 * 
 * This is a simplified version with mechanics removed for engine rewrite.
 * UI structure is preserved - game logic will be wired to src/engine once ready.
 */
import React, {
    useState,
    useContext,
    useEffect,
    useMemo,
    useCallback,
    useRef
} from 'react';
import _ from 'lodash';
import { AuthContext } from '../../AuthContext';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Stack,
    Chip,
    Divider,
    Alert,
} from '@mui/material';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import LoginRegister from '../LoginRegister/LoginRegister';
import Actions from './Actions';
import DeckBuilder from '../DeckBuilder/DeckBuilder';
import Board from './Board';
import Activity from './Activity';
import { useBattleSystem } from './Battle';
import { useDonManagement } from './Don';
import GameModeSelect from './GameModeSelect';
import DiceRoll from './DiceRoll';
import Lobby from './Lobby';
import PromptProvider from '../Prompt/PromptProvider';

// Import hooks from the hooks folder
import {
    useCards,
    useDeckInitializer,
    createInitialAreas,
    useOpeningHands,
    useBoard,
    useTurn,
    useCardStats,
    useMultiplayer,
    usePlayCard,
} from './hooks';

import { getSideRoot as getSideLocationFromNext, getHandCostRoot as getHandCostLocationFromNext, refreshSideToActive } from './hooks/areasUtils';

// Constants
const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';
const HARDCODED = true;
const DEMO_LEADER = 'OP09-001';
const DEMO_DECK_ITEMS = [
    { id: 'OP01-006', count: 4 },
    { id: 'OP09-002', count: 4 },
    { id: 'OP09-008', count: 4 },
    { id: 'OP09-011', count: 4 },
    { id: 'OP09-014', count: 4 },
    { id: 'OP12-008', count: 4 },
    { id: 'OP09-013', count: 4 },
    { id: 'PRB02-002', count: 4 },
    { id: 'ST23-001', count: 2 },
    { id: 'OP09-009', count: 4 },
    { id: 'ST15-002', count: 3 },
    { id: 'OP08-118', count: 4 },
    { id: 'OP06-007', count: 3 },
    { id: 'OP09-004', count: 2 }
];

// Unique key for card location
const modKey = (side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`;


export default function Home() {
    // Auth context
    const { isLoggedIn, user, logout, loading } = useContext(AuthContext);

    // Card data
    const {
        hovered,
        setHovered,
        selectedCard,
        setSelectedCard,
        loadingCards,
        cardError,
        allCards,
        allById,
        metaById,
        getRandomCard
    } = useCards({ isLoggedIn });

    // Board state
    const compact = false;
    const {
        areas,
        setAreas,
        cloneAreas,
        mutateAreas,
        addCardToArea: addCardToAreaUnsafe,
        removeCardFromArea: removeCardFromAreaUnsafe,
        getSideLocation,
        getHandCostLocation,
        getCharArray,
        getLeaderArray
    } = useBoard();

    // Game mode state
    const [gameMode, setGameMode] = useState(null);
    const [showLobby, setShowLobby] = useState(false);
    const [userDecks, setUserDecks] = useState([]);
    const [selectedDeckName, setSelectedDeckName] = useState(null);

    // Multiplayer
    const multiplayer = useMultiplayer({
        username: user,
        enabled: isLoggedIn && (showLobby || gameMode === 'multiplayer')
    });

    // Load user decks
    useEffect(() => {
        if (!isLoggedIn) return;
        (async () => {
            try {
                const res = await fetch('/api/decks');
                if (res.ok) {
                    const data = await res.json();
                    setUserDecks(data.decks || []);
                }
            } catch (e) {
                console.warn('Failed to load decks:', e);
            }
        })();
    }, [isLoggedIn]);

    // Game setup state
    const [setupPhase, setSetupPhase] = useState('dice');
    const [firstPlayer, setFirstPlayer] = useState(null);
    const [currentHandSide, setCurrentHandSide] = useState(null);
    const [syncedDiceResult, setSyncedDiceResult] = useState(null);

    // Core game state
    const gameStarted = gameMode !== null;
    const gameSetupComplete = setupPhase === 'complete';
    const [library, setLibrary] = useState([]);
    const [oppLibrary, setOppLibrary] = useState([]);
    const deckSearchRef = useRef(null);
    const openingHandRef = useRef(null);
    const [openingHandShown, setOpeningHandShown] = useState(false);
    const [deckOpen, setDeckOpen] = useState(false);

    // Deck initialization
    const {
        createCardBacks,
        getAssetForId,
        resetGameInit
    } = useDeckInitializer({
        isLoggedIn,
        allCards,
        allById,
        library,
        oppLibrary,
        setAreas,
        setLibrary,
        setOppLibrary,
        initializeDonDecks: () => {},
        openingHandRef,
        demoConfig: { HARDCODED, DEMO_LEADER, DEMO_DECK_ITEMS },
        cardBackUrl: CARD_BACK_URL,
        gameMode,
        isMultiplayerHost: gameMode !== 'multiplayer' || multiplayer.isHost
    });

    // Turn state
    const {
        turnSide,
        setTurnSide,
        turnNumber,
        setTurnNumber,
        phase,
        setPhase,
        phaseLower,
        log,
        appendLog,
        resetLog,
        endTurnConfirming,
        endTurnWithConfirm
    } = useTurn();

    // Refs for opening hands
    const broadcastStateToOpponentRef = useRef(null);
    const executeRefreshPhaseRef = useRef(null);

    // Opening hand management
    const {
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
    } = useOpeningHands({
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
        getPlayerDisplayName: (side) => side === 'player' ? 'Player' : 'Opponent',
        firstPlayer
    });

    // Card area manipulation (disabled during game)
    const addCardToArea = useCallback((side, section, key) => {
        if (gameStarted) return;
        const card = getRandomCard();
        if (!card) return;
        addCardToAreaUnsafe(side, section, key, card);
    }, [gameStarted, getRandomCard, addCardToAreaUnsafe]);

    const removeCardFromArea = useCallback((side, section, key) => {
        if (!gameStarted) removeCardFromAreaUnsafe(side, section, key);
    }, [gameStarted, removeCardFromAreaUnsafe]);

    // Action panel state
    const [actionOpen, setActionOpen] = useState(false);
    const [actionCard, setActionCard] = useState(null);
    const [actionCardIndex, setActionCardIndex] = useState(-1);
    const [actionSource, setActionSource] = useState(null);

    const closeActionPanel = useCallback(() => {
        setActionOpen(false);
        setActionCardIndex(-1);
        setActionSource(null);
        setSelectedCard(null);
    }, [setSelectedCard]);

    // Battle state (stub)
    const [currentAttack, setCurrentAttack] = useState(null);
    const [battleArrow, setBattleArrow] = useState(null);
    const [battle, setBattle] = useState(null);

    // DON management
    const {
        donGivingMode,
        startDonGiving,
        cancelDonGiving,
        giveDonToCard,
        moveDonFromCostToCard,
        donPhaseGain,
        returnAllGivenDon,
        getDonPowerBonus,
        returnDonFromCard,
        returnDonToDonDeckFromCard,
        detachDonFromCard,
        initializeDonDecks,
        getDonDeckArray,
        hasEnoughDonFor
    } = useDonManagement({
        areas,
        setAreas,
        mutateAreas,
        turnSide,
        turnNumber,
        phase,
        battle,
        appendLog,
        canPerformGameAction: () => !openingHandShown && gameSetupComplete
    });

    // Initialize DON decks
    useEffect(() => {
        initializeDonDecks();
    }, [initializeDonDecks]);

    // Card stats (with engine integration)
    const {
        getBasePower,
        getAuraPowerMod,
        getTotalPower,
        getAuraCostMod,
        getCardCost,
        getKeywordsFor
    } = useCardStats({ 
        metaById, 
        areas,
        turnSide,
        turnNumber,
        getSideLocation, 
        getDonPowerBonus 
    });

    // Play card from hand (engine integration)
    const {
        canPlayCard,
        playCardFromHand,
        playEventFromHand
    } = usePlayCard({
        areas,
        setAreas,
        turnSide,
        turnNumber,
        phase,
        appendLog,
        hasEnoughDonFor
    });

    // Battle system (stub)
    const {
        canCharacterAttack,
        canLeaderAttack,
        beginAttackForLeader,
        beginAttackForCard,
        applyBlocker,
        skipBlock,
        addCounterFromHand,
        playCounterEventFromHand,
        endCounterStep,
        resolveDefense,
        getBattleStatus,
        getAttackerPower,
        getDefenderPower
    } = useBattleSystem({
        battle,
        setBattle,
        currentAttack,
        setCurrentAttack,
        setBattleArrow,
        areas,
        setAreas,
        mutateAreas,
        appendLog,
        startTargeting: () => {},
        cancelTargeting: () => {},
        closeActionPanel,
        canPerformGameAction: () => !openingHandShown && gameSetupComplete,
        getTotalPower,
        getOpposingSide: (side) => side === 'player' ? 'opponent' : 'player',
        getCharArray,
        getLeaderArray,
        getHandCostLocation,
        hasKeyword: () => false,
        getKeywordsFor,
        hasTempKeyword: () => false,
        hasDisabledKeyword: () => false,
        cancelDonGiving,
        dealOneDamageToLeader: () => {},
        returnDonFromCard,
        modKey,
        turnSide,
        phaseLower,
        turnNumber,
        getCardMeta: (id) => metaById.get(id) || null,
        isAuthoritative: true
    });

    // Multiplayer helpers
    const myMultiplayerSide = useMemo(() => {
        if (gameMode !== 'multiplayer') return 'player';
        return multiplayer.isHost ? 'player' : 'opponent';
    }, [gameMode, multiplayer.isHost]);

    const isMyTurnInMultiplayer = useMemo(() => {
        if (gameMode !== 'multiplayer') return true;
        if (!multiplayer.gameStarted) return false;
        return multiplayer.isHost ? turnSide === 'player' : turnSide === 'opponent';
    }, [gameMode, multiplayer.gameStarted, multiplayer.isHost, turnSide]);

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

    // Leave game
    const leaveGame = useCallback(() => {
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
        [playerHandSelectedRef, opponentHandSelectedRef, guestHandInitializedRef, openingHandsFinalizedRef]
            .forEach(ref => { ref.current = false; });
        resetGameInit();
    }, [gameMode, initializeDonDecks, multiplayer, resetGameInit, resetLog, setAreas,
        setLibrary, setOppLibrary, setOpeningHandsBothSelected, setOpponentHandSelected, 
        setOpeningHandShown, setPhase, setPlayerHandSelected, setTurnNumber, setTurnSide,
        guestHandInitializedRef, openingHandsFinalizedRef, opponentHandSelectedRef, playerHandSelectedRef]);

    // Refresh phase stub
    const executeRefreshPhase = useCallback((side) => {
        appendLog(`[Refresh Phase] Start ${side}'s turn.`);
        returnAllGivenDon(side);
        mutateAreas((next) => {
            refreshSideToActive(next, side);
        }, { onErrorLabel: '[Refresh Phase] Failed' });
        appendLog('[Refresh Phase] Complete.');
    }, [appendLog, mutateAreas, returnAllGivenDon]);

    executeRefreshPhaseRef.current = executeRefreshPhase;

    // Game mode selection
    const handleSelectGameMode = useCallback((mode) => {
        if (mode === 'multiplayer') {
            setShowLobby(true);
        } else {
            setGameMode(mode);
        }
    }, []);

    // Dice roll completion
    const handleDiceRollComplete = useCallback(({ firstPlayer: winner, playerRoll, opponentRoll }) => {
        setFirstPlayer(winner);
        
        if (gameMode === 'multiplayer') {
            setSetupPhase('hands');
            setCurrentHandSide('both');
            setPlayerHandSelected(false);
            setOpponentHandSelected(false);
            playerHandSelectedRef.current = false;
            opponentHandSelectedRef.current = false;
            
            const mySide = multiplayer.isHost ? 'player' : 'opponent';
            const myLib = multiplayer.isHost ? library : oppLibrary;
            openingHandRef?.current?.initialize(myLib, mySide);
        } else {
            setSetupPhase('hand-first');
            setCurrentHandSide(winner);
            const lib = winner === 'player' ? library : oppLibrary;
            openingHandRef?.current?.initialize(lib, winner);
        }
        
        setOpeningHandShown(true);
    }, [library, oppLibrary, gameMode, multiplayer, openingHandRef,
        setOpeningHandShown, setPlayerHandSelected, setOpponentHandSelected,
        playerHandSelectedRef, opponentHandSelectedRef]);

    // Mark hand selected locally (for multiplayer)
    const markHandSelectedLocally = useCallback((side) => {
        if (side === 'player') {
            setPlayerHandSelected(true);
            playerHandSelectedRef.current = true;
        } else {
            setOpponentHandSelected(true);
            opponentHandSelectedRef.current = true;
        }
    }, [setPlayerHandSelected, setOpponentHandSelected, playerHandSelectedRef, opponentHandSelectedRef]);

    // Simple phase actions for DON/Draw/End Turn
    const canPerformGameAction = useCallback(() => {
        return !openingHandShown && gameSetupComplete;
    }, [openingHandShown, gameSetupComplete]);

    const drawCard = useCallback((side) => {
        if (!canPerformGameAction()) return;
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;
        if (!lib.length) return;

        const cardId = lib[lib.length - 1];
        const asset = getAssetForId ? getAssetForId(cardId) : null;

        mutateAreas((next) => {
            const handLoc = side === 'player' ? next.player?.bottom : next.opponent?.top;
            const deckLoc = side === 'player' ? next.player?.middle : next.opponent?.middle;
            if (!handLoc || !deckLoc) return;

            handLoc.hand = [...(handLoc.hand || []), asset];
            const currentDeckLength = deckLoc.deck?.length || 0;
            if (currentDeckLength > 0) {
                deckLoc.deck = createCardBacks(currentDeckLength - 1);
            }
        }, { onErrorLabel: '[drawCard] Failed' });

        (isPlayer ? setLibrary : setOppLibrary)((prev) => prev.slice(0, -1));
    }, [canPerformGameAction, library, oppLibrary, getAssetForId, createCardBacks, mutateAreas, setLibrary, setOppLibrary]);

    // Next action button label
    const nextActionLabel = useMemo(() => {
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;
        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') {
            const requestedAmount = isFirst ? 1 : 2;
            const donDeck = getDonDeckArray(turnSide);
            const actualAmount = Math.min(requestedAmount, donDeck?.length || 0);
            return `Gain ${actualAmount} DON!!`;
        }
        return endTurnConfirming ? 'Are you sure?' : 'End Turn';
    }, [phaseLower, turnNumber, turnSide, firstPlayer, endTurnConfirming, getDonDeckArray]);

    // Handle next action
    const onNextAction = useCallback(() => {
        if (gameMode === 'multiplayer' && !isMyTurnInMultiplayer) {
            appendLog('Wait for your turn!');
            return;
        }
        if (battle) {
            appendLog('Cannot advance phase during battle.');
            return;
        }
        if (!canPerformGameAction()) return;

        const isFirst = turnNumber === 1 && turnSide === firstPlayer;

        if (phaseLower === 'draw') {
            if (!isFirst) {
                drawCard(turnSide);
            }
            appendLog(isFirst ? 'First turn: skip draw.' : 'Draw 1.');
            setPhase('Don');
            return;
        }

        if (phaseLower === 'don') {
            const amt = isFirst ? 1 : 2;
            const actualGained = donPhaseGain(turnSide, amt);
            appendLog(`DON!! +${actualGained}.`);
            setPhase('Main');
            return;
        }

        // End turn
        if (!endTurnWithConfirm(3000)) return;
        
        appendLog('[End Phase] End turn.');
        const nextSide = turnSide === 'player' ? 'opponent' : 'player';
        cancelDonGiving();
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);
        
        if (gameMode !== 'multiplayer') {
            executeRefreshPhase(nextSide);
        }
        
        setPhase('Draw');
    }, [battle, canPerformGameAction, turnNumber, turnSide, firstPlayer, phaseLower,
        drawCard, appendLog, donPhaseGain, endTurnWithConfirm, cancelDonGiving,
        executeRefreshPhase, gameMode, isMyTurnInMultiplayer, setPhase, setTurnNumber, setTurnSide]);

    // Card click handler
    const openCardAction = useCallback((card, index, source) => {
        if (!card?.id) return;
        setSelectedCard(card);
        setActionCard(card);
        setActionCardIndex(index);
        setActionSource(source);
        setActionOpen(true);
    }, [setSelectedCard]);

    // Auto-skip draw phase on first turn
    useEffect(() => {
        if (!canPerformGameAction() || phaseLower !== 'draw') return;
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;
        if (!isFirst) return;

        appendLog('First turn: skipping Draw Phase.');
        setPhase('Don');
    }, [appendLog, canPerformGameAction, firstPlayer, phaseLower, setPhase, turnNumber, turnSide]);

    // Broadcat state stub
    const broadcastStateToOpponent = useCallback(() => {
        // TODO: Implement with engine state
    }, []);
    broadcastStateToOpponentRef.current = broadcastStateToOpponent;

    // =========================================================================
    // RENDER
    // =========================================================================

    // Loading state
    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Typography>Loading...</Typography>
            </Container>
        );
    }

    // Not logged in
    if (!isLoggedIn) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Stack spacing={4}>
                    <Typography variant="h4">One Piece TCG Simulator</Typography>
                    <Alert severity="info">Please log in to play.</Alert>
                    <LoginRegister />
                </Stack>
            </Container>
        );
    }

    // Lobby view
    if (showLobby) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Lobby
                    multiplayer={multiplayer}
                    userDecks={userDecks}
                    selectedDeckName={selectedDeckName}
                    setSelectedDeckName={setSelectedDeckName}
                    onBack={() => setShowLobby(false)}
                    onGameStart={() => {
                        setShowLobby(false);
                        setGameMode('multiplayer');
                    }}
                />
            </Container>
        );
    }

    // Game mode select
    if (!gameMode) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <GameModeSelect
                    onSelectMode={handleSelectGameMode}
                    onOpenDeckBuilder={() => setDeckOpen(true)}
                />
                <DeckBuilder open={deckOpen} onClose={() => setDeckOpen(false)} />
            </Container>
        );
    }

    // Main game view
    return (
        <Container maxWidth={false} sx={{ py: compact ? 1 : 2, px: compact ? 1 : 2 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: compact ? 1 : 2 }}>
                <Typography variant={compact ? 'h6' : 'h5'}>
                    One Piece TCG Simulator
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip 
                        label={`Turn ${turnNumber}`} 
                        color="primary" 
                        size={compact ? 'small' : 'medium'} 
                    />
                    <Chip 
                        label={`${turnSide === 'player' ? 'Your' : "Opponent's"} Turn`} 
                        color={turnSide === 'player' ? 'success' : 'warning'}
                        size={compact ? 'small' : 'medium'}
                    />
                    <Chip 
                        label={phase} 
                        variant="outlined" 
                        size={compact ? 'small' : 'medium'}
                    />
                    <Button size="small" onClick={leaveGame}>
                        Leave Game
                    </Button>
                </Stack>
            </Box>

            {/* Engine Rewrite Notice */}
            <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Engine Rewrite in Progress:</strong> Game mechanics are currently disabled. 
                Board layout and UI are preserved for testing.
            </Alert>

            {/* Phase Action Button */}
            {gameSetupComplete && (
                <Box sx={{ mb: 2 }}>
                    <Button 
                        variant="contained" 
                        onClick={onNextAction}
                        disabled={gameMode === 'multiplayer' && !isMyTurnInMultiplayer}
                    >
                        {nextActionLabel}
                    </Button>
                </Box>
            )}

            {/* Main Content */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {/* Board */}
                <Box sx={{ flex: 1, minWidth: 800 }}>
                    <Board
                        areas={areas}
                        setAreas={setAreas}
                        hovered={hovered}
                        setHovered={setHovered}
                        gameStarted={gameStarted}
                        addCardToArea={addCardToArea}
                        removeCardFromArea={removeCardFromArea}
                        openCardAction={openCardAction}
                        actionOpen={actionOpen}
                        actionCardIndex={actionCardIndex}
                        targeting={{ active: false }}
                        setTargeting={() => {}}
                        currentAttack={currentAttack}
                        setBattleArrow={setBattleArrow}
                        getTotalPower={getTotalPower}
                        battle={battle}
                        getBattleStatus={getBattleStatus}
                        getKeywordsFor={getKeywordsFor}
                        hasDisabledKeyword={() => false}
                        applyBlocker={applyBlocker}
                        getPowerMod={() => 0}
                        getAuraPowerMod={getAuraPowerMod}
                        getCardCost={getCardCost}
                        getAuraCostMod={getAuraCostMod}
                        turnSide={turnSide}
                        CARD_BACK_URL={CARD_BACK_URL}
                        compact={compact}
                        giveDonToCard={giveDonToCard}
                        startDonGiving={startDonGiving}
                        cancelDonGiving={cancelDonGiving}
                        donGivingMode={donGivingMode}
                        phase={phase}
                        openingHandRef={openingHandRef}
                        openingHandShown={openingHandShown}
                        setOpeningHandShown={setOpeningHandShown}
                        currentHandSide={currentHandSide}
                        onHandSelected={handleHandSelected}
                        firstPlayer={firstPlayer}
                        playerHandSelected={playerHandSelected}
                        opponentHandSelected={opponentHandSelected}
                        setupPhase={setupPhase}
                        deckSearchRef={deckSearchRef}
                        library={library}
                        oppLibrary={oppLibrary}
                        setLibrary={setLibrary}
                        setOppLibrary={setOppLibrary}
                        getAssetForId={getAssetForId}
                        createCardBacks={createCardBacks}
                        appendLog={appendLog}
                        getCardMeta={(id) => metaById.get(id) || null}
                        selectedCard={selectedCard}
                        cardError={cardError}
                        loadingCards={loadingCards}
                        log={log}
                        setTurnSide={setTurnSide}
                        setTurnNumber={setTurnNumber}
                        executeRefreshPhase={executeRefreshPhase}
                        setPhase={setPhase}
                        markHandSelectedLocally={markHandSelectedLocally}
                        isMultiplayer={gameMode === 'multiplayer'}
                        isMyTurn={isMyTurnInMultiplayer}
                        multiplayerRole={myMultiplayerSide}
                        isHost={multiplayer.isHost}
                    />
                </Box>

                {/* Activity Log */}
                <Box sx={{ width: 400, flexShrink: 0 }}>
                    <Typography variant="h6" gutterBottom>
                        Activity Log
                    </Typography>
                    <Paper sx={{ p: 1, height: 300, overflow: 'auto' }}>
                        {log.map((entry, i) => (
                            <Typography key={i} variant="caption" display="block">
                                {entry}
                            </Typography>
                        ))}
                    </Paper>
                </Box>
            </Box>

            {/* Engine Prompt Dialog Provider */}
            <PromptProvider myPlayerSide={myMultiplayerSide} />

            {/* Deck Builder */}
            <DeckBuilder open={deckOpen} onClose={() => setDeckOpen(false)} />

            {/* Actions Panel */}
            {actionOpen && (
                <ClickAwayListener onClickAway={closeActionPanel}>
                    <div>
                        <Actions
                            onClose={closeActionPanel}
                            card={actionCard}
                            cardMeta={metaById.get(actionCard?.id || actionCard?.cardId)}
                            cardLocation={actionSource}
                            areas={areas}
                            setAreas={setAreas}
                            phase={phase}
                            turnSide={turnSide}
                            turnNumber={turnNumber}
                            isYourTurn={turnSide === (actionSource?.side || 'player')}
                            battle={battle}
                            appendLog={appendLog}
                            onAbilityActivated={(instanceId, abilityIdx) => {
                                appendLog(`[Game] Ability ${abilityIdx} activated on ${instanceId}`);
                            }}
                        />
                    </div>
                </ClickAwayListener>
            )}

            {/* Activity Overlay */}
            <Activity
                battle={battle}
                battleArrow={battleArrow}
                getBattleStatus={getBattleStatus}
                skipBlock={skipBlock}
                endCounterStep={endCounterStep}
                resolveDefense={resolveDefense}
                isMultiplayer={gameMode === 'multiplayer'}
                myMultiplayerSide={myMultiplayerSide}
                isHost={multiplayer.isHost}
            />

            {/* Dice Roll */}
            <DiceRoll
                visible={
                    (gameMode === 'self-vs-self' || gameMode === 'multiplayer') && 
                    setupPhase === 'dice' && 
                    (gameMode === 'multiplayer' ? multiplayer.gameStarted : library.length > 0)
                }
                onComplete={handleDiceRollComplete}
                isMultiplayer={gameMode === 'multiplayer'}
                isHost={multiplayer.isHost}
                syncedResult={syncedDiceResult}
            />
        </Container>
    );
}
