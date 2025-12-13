// Home.jsx - Main game component for One Piece TCG Sim
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

// Import hooks from the hooks folder
import {
    useCards,
    useTargeting,
    useModifiers,
    useDeckInitializer,
    createInitialAreas,
    useOpeningHands,
    useBoard,
    useTurn,
    useGameActions,
    useCardStats,
    useMultiplayer,
    useTriggers,
    useEffectResolution,
    useAttackHelpers
} from './hooks';

import { getSideRoot as getSideLocationFromNext, getHandCostRoot as getHandCostLocationFromNext, refreshSideToActive } from './hooks/areasUtils';

const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png'; //. Performance: constants defined outside component
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

//. Helper to map visual section to data section for hand cards
const getSectionForHand = (actionSource, side) => {
    if (actionSource?.keyName === 'hand') {
        if (side === 'opponent' && actionSource.section === 'bottom') return 'top';
        if (side === 'player' && actionSource.section === 'top') return 'bottom';
    }
    return actionSource?.section || 'bottom';
};

//. Unique key for card location (pure function, no deps)
const modKey = (side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`;

//. Get counter value from card meta (pure function)
const getCounterValue = (meta) => {
    if (!meta) return 0;
    return _.isNumber(meta?.counter)
        ? meta.counter
        : (meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0);
};


export default function Home() {
    //. Auth context values and actions
    const { isLoggedIn, user, logout, loading } = useContext(AuthContext);

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

    //. Board / Play Area State
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

    //. Game Mode State
    const [gameMode, setGameMode] = useState(null); //. null = not selected, 'self-vs-self', 'vs-ai', 'multiplayer'
    const [showLobby, setShowLobby] = useState(false); //. Show lobby browser for multiplayer

    //. Multiplayer State
    const [userDecks, setUserDecks] = useState([]); //. User's saved decks for multiplayer
    const [selectedDeckName, setSelectedDeckName] = useState(null);

    //. Multiplayer hook
    const multiplayer = useMultiplayer({
        username: user,
        enabled: isLoggedIn && (showLobby || gameMode === 'multiplayer')
    });

    //. Load user decks for multiplayer
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

    //. Game Setup State
    const [setupPhase, setSetupPhase] = useState('dice'); //. 'dice' | 'hands' | 'complete'
    const [firstPlayer, setFirstPlayer] = useState(null); //. 'player' | 'opponent' - who won dice roll
    const [currentHandSide, setCurrentHandSide] = useState(null); //. Which side is currently selecting hand (for sequential) or 'both' for simultaneous
    const [syncedDiceResult, setSyncedDiceResult] = useState(null); //. Dice result from host for guest to display

    //. Game State
    const gameStarted = gameMode !== null; //. Manual board edits disabled during game
    const gameSetupComplete = setupPhase === 'complete'; //. True when both hands selected
    const [library, setLibrary] = useState([]); //. Player deck card IDs (top at end)
    const [oppLibrary, setOppLibrary] = useState([]); //. Opponent deck card IDs
    const deckSearchRef = useRef(null); //. Deck search component ref
    const openingHandRef = useRef(null); //. Opening hand component ref

    const { //. Deck initialization and card asset helpers
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
        initializeDonDecks: () => { }, //. will be overridden after DON hook init
        openingHandRef,
        demoConfig: { HARDCODED, DEMO_LEADER, DEMO_DECK_ITEMS },
        cardBackUrl: CARD_BACK_URL,
        gameMode,
        isMultiplayerHost: gameMode !== 'multiplayer' || multiplayer.isHost // Only host initializes in multiplayer
    });

    const [openingHandShown, setOpeningHandShown] = useState(false);

    //. Turn and Phase State (moved to hook)
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

    // Refs used by opening-hands hook for functions defined later
    const broadcastStateToOpponentRef = useRef(null);
    const executeRefreshPhaseRef = useRef(null);

    // Opening-hand management (selection, finalize, apply) - extracted to hook
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
        getPlayerDisplayName,
        firstPlayer
    });

    const addCardToArea = useCallback((side, section, key) => {
        if (gameStarted) return;
        const card = getRandomCard();
        if (!card) {
            console.warn('[addCardToArea] No cards available', { allCardsLength: allCards.length, side, section, key });
            return;
        }
        addCardToAreaUnsafe(side, section, key, card);
    }, [gameStarted, getRandomCard, allCards.length, addCardToAreaUnsafe]);

    const removeCardFromArea = useCallback((side, section, key) => {
        if (!gameStarted) removeCardFromAreaUnsafe(side, section, key);
    }, [gameStarted, removeCardFromAreaUnsafe]);

    const [actionOpen, setActionOpen] = useState(false);
    const [actionCard, setActionCard] = useState(null);
    const [actionCardIndex, setActionCardIndex] = useState(-1);
    const [actionSource, setActionSource] = useState(null);

    //. Closes action panel and clears selection
    const closeActionPanel = useCallback(() => {
        setActionOpen(false);
        setActionCardIndex(-1);
        setActionSource(null);
        setSelectedCard(null);
    }, []);

    //. (getSideLocation, getHandCostLocation, getCharArray, getLeaderArray)
    //. are provided by `useBoard` above.

    //. Targeting and Battle State
    const [currentAttack, setCurrentAttack] = useState(null);
    const [battleArrow, setBattleArrow] = useState(null);
    const [battle, setBattle] = useState(null); //. Battle lifecycle: attack > block > counter > damage > end (CR 7-1)

    const {
        targeting,
        setTargeting,
        startTargeting,
        suspendTargeting,
        cancelTargeting,
        confirmTargeting,
        resumeTargeting
    } = useTargeting({
        areas,
        battle,
        setBattleArrow,
        setCurrentAttack
    });
    const [resolvingEffect, setResolvingEffect] = useState(false);

    // Trigger mechanics (CR 4-6-3, 10-1-5)
    const {
        triggerPending,
        dealOneDamageToLeader,
        onTriggerActivate,
        onTriggerDecline,
        hasKeyword
    } = useTriggers({
        metaById,
        appendLog,
        mutateAreas
    });

    //. Can play cards? (Main phase, your turn, no battle - CR 10-2-2/10-2-3)
    const canPlayNow = useCallback((side) => {
        return phaseLower === 'main' && side === turnSide && !battle;
    }, [phaseLower, turnSide, battle]);

    const getCardMeta = useCallback((id) => metaById.get(id) || null, [metaById]);

    //. Game actions allowed after opening hand finalized AND game setup complete
    const canPerformGameAction = useCallback(() => {
        return !openingHandShown && gameSetupComplete;
    }, [openingHandShown, gameSetupComplete]);

    const { //. DON management (gain, give, return)
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
        canPerformGameAction
    });

    //. Initialize DON decks once when component mounts
    useEffect(() => {
        initializeDonDecks();
    }, [initializeDonDecks]);

    //. Leave game and reset all game state
    const leaveGame = useCallback(() => {
        if (gameMode === 'multiplayer' && multiplayer.currentLobby) multiplayer.leaveLobby();
        
        // Reset all state in batch
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
        
        // Reset refs
        [playerHandSelectedRef, opponentHandSelectedRef, guestHandInitializedRef, openingHandsFinalizedRef]
            .forEach(ref => { ref.current = false; });
        
        resetGameInit();
    }, [gameMode, initializeDonDecks, multiplayer, resetGameInit]);

    const { //. Power/cost modifiers and temporary keywords
        getPowerMod,
        hasTempKeyword,
        hasDisabledKeyword,
        applyPowerMod,
        addTempKeyword,
        addDisabledKeyword,
        registerUntilNextTurnEffect,
        cleanupOnRefreshPhase,
        getModifierState,
        setModifierState
    } = useModifiers({ modKey, appendLog });

    // Effect resolution (replacement effects, effect KO, pay life)
    const {
        removeCardByEffect,
        payLife
    } = useEffectResolution({
        mutateAreas,
        appendLog,
        metaById,
        getSideLocation,
        turnNumber,
        turnSide,
        applyPowerMod,
        registerUntilNextTurnEffect
    });

    // Attack helpers (once-per-turn tracking, attack locking, cancel attack)
    const {
        oncePerTurnUsage,
        setOncePerTurnUsage,
        attackLocked,
        setAttackLocked,
        lockCurrentAttack,
        cancelAttack,
        markOncePerTurnUsed,
        sameOrigin,
        getOpposingSide
    } = useAttackHelpers({
        modKey,
        battle,
        currentAttack,
        setAreas,
        appendLog,
        cancelTargeting,
        setBattle,
        setCurrentAttack,
        turnSide,
        turnNumber
    });

    // Card stats and cost helpers (must be defined before any usage in multiplayer sync API)
    const {
        getBasePower,
        getAuraPowerMod,
        getTotalPower,
        getAuraCostMod,
        getCardCost,
        getKeywordsFor
    } = useCardStats({ metaById, getSideLocation, getPowerMod, getDonPowerBonus });

    // Extracted game action helpers
    const {
        drawCard,
        startDeckSearch,
        returnCardToDeck,
        restCard,
        setActive
    } = useGameActions({
        canPerformGameAction,
        library,
        oppLibrary,
        getAssetForId,
        createCardBacks,
        mutateAreas,
        setLibrary,
        setOppLibrary,
        deckSearchRef,
        appendLog
    });
    // ---------------------------------------------------------------------
    // Multiplayer snapshot sync (current migration path)
    // ---------------------------------------------------------------------

    // Guard used to prevent feedback loops when applying server snapshots.
    const applyingServerSyncRef = useRef(false);

    const broadcastStateToOpponent = useCallback(() => {
        if (gameMode !== 'multiplayer' || !multiplayer.gameStarted) {
            return;
        }
        if (applyingServerSyncRef.current) {
            return;
        }

        const gameState = {
            areas,
            library,
            oppLibrary,
            turnSide,
            turnNumber,
            phase,
            firstPlayer,
            currentHandSide,
            setupPhase,
            playerHandSelected,
            opponentHandSelected,
            modifiers: getModifierState && getModifierState(),
            battle,
            currentAttack,
            battleArrow,
            oncePerTurnUsage,
            attackLocked
        };

        multiplayer.syncGameState(gameState);
    }, [
        gameMode,
        multiplayer,
        areas,
        library,
        oppLibrary,
        turnSide,
        turnNumber,
        phase,
        firstPlayer,
        currentHandSide,
        setupPhase,
        playerHandSelected,
        opponentHandSelected,
        getModifierState,
        battle,
        currentAttack,
        battleArrow,
        oncePerTurnUsage,
        attackLocked
    ]);

    const broadcastStateToOpponentBasic = useCallback(() => {
        if (gameMode !== 'multiplayer' || !multiplayer.gameStarted) {
            return;
        }
        if (applyingServerSyncRef.current) {
            return;
        }
        const gameState = {
            areas,
            library,
            oppLibrary,
            turnSide,
            turnNumber,
            phase,
            firstPlayer,
            currentHandSide,
            setupPhase,
            playerHandSelected,
            opponentHandSelected
        };
        multiplayer.syncGameState(gameState);
    }, [
        gameMode,
        multiplayer,
        areas,
        library,
        oppLibrary,
        turnSide,
        turnNumber,
        phase,
        firstPlayer,
        currentHandSide,
        setupPhase,
        playerHandSelected,
        opponentHandSelected
    ]);

    // Wire broadcast function into the ref so hooks created earlier can use it
    useEffect(() => {
        broadcastStateToOpponentRef.current = broadcastStateToOpponent;
    }, [broadcastStateToOpponent]);

    //. Auto-broadcast battle-related state changes to keep host and guest in sync.
    //. IMPORTANT: the red attack arrow (`battleArrow`) can change without the `battle` object changing.
    //. If we only sync on `battle` changes, one client will see the arrow while the other won't.
    const prevBattleSyncRef = useRef({ battle: null, currentAttack: null, battleArrow: null });
    useEffect(() => {
        if (gameMode !== 'multiplayer' || !multiplayer.gameStarted) {
            prevBattleSyncRef.current = { battle, currentAttack, battleArrow };
            return;
        }

        const prev = prevBattleSyncRef.current || { battle: null, currentAttack: null, battleArrow: null };
        const battleChanged = !_.isEqual(prev.battle, battle);
        const attackChanged = !_.isEqual(prev.currentAttack, currentAttack);
        const arrowChanged = !_.isEqual(prev.battleArrow, battleArrow);

        if (!battleChanged && !attackChanged && !arrowChanged) {
            return;
        }

        prevBattleSyncRef.current = { battle, currentAttack, battleArrow };

        //. Unified multiplayer: both clients sync their local battle changes via state snapshots.
        console.log(
            `[Multiplayer ${multiplayer.isHost ? 'Host' : 'Guest'}] Battle sync (${battleChanged ? 'battle ' : ''}${attackChanged ? 'attack ' : ''}${arrowChanged ? 'arrow' : ''}), step:`,
            battle?.step || 'null'
        );
        const timeoutId = setTimeout(() => {
            broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
        }, 50);
        return () => clearTimeout(timeoutId);
    }, [battle, currentAttack, battleArrow, gameMode, multiplayer.gameStarted, multiplayer.isHost]);

    const handleDiceRollComplete = useCallback(({ firstPlayer: winner, playerRoll, opponentRoll }) => {
        const setupOrder = { dice: 0, hands: 1, 'hand-first': 1, complete: 2 };

        setFirstPlayer(winner);

        //. In multiplayer, broadcast dice result and use simultaneous hand selection
        if (gameMode === 'multiplayer') {
            // Monotonic: never regress setupPhase if this fires twice.
            setSetupPhase((prev) => {
                const prevRank = Object.prototype.hasOwnProperty.call(setupOrder, prev) ? setupOrder[prev] : 0;
                const nextRank = setupOrder.hands;
                return nextRank >= prevRank ? 'hands' : prev;
            });
            setCurrentHandSide('both'); //. Both players select simultaneously
            setPlayerHandSelected(false);
            setOpponentHandSelected(false);
            playerHandSelectedRef.current = false;
            opponentHandSelectedRef.current = false;

            //. Sync dice result + setup state to server (server broadcasts to both players)
            setTimeout(() => {
                multiplayer.syncGameState({
                    diceResult: { firstPlayer: winner, playerRoll, opponentRoll },
                    setupPhase: 'hands',
                    firstPlayer: winner,
                    currentHandSide: 'both',
                    library,
                    oppLibrary,
                    areas
                });
            }, 100);

            //. Initialize opening hand for this player's side
            const mySide = multiplayer.isHost ? 'player' : 'opponent';
            const myLib = multiplayer.isHost ? library : oppLibrary;
            if (Array.isArray(myLib) && myLib.length >= 10) {
                openingHandRef?.current?.initialize(myLib, mySide);
                guestHandInitializedRef.current = true;
            } else {
                // Common for guests: their deck IDs may arrive slightly later.
                guestHandInitializedRef.current = false;
                console.warn('[OpeningHand] Delaying initialize; library not ready yet:', {
                    side: mySide,
                    len: Array.isArray(myLib) ? myLib.length : null
                });
            }
        } else {
            //. Sequential mode for vs-self
            setSetupPhase((prev) => {
                const prevRank = Object.prototype.hasOwnProperty.call(setupOrder, prev) ? setupOrder[prev] : 0;
                const nextRank = setupOrder['hand-first'];
                return nextRank >= prevRank ? 'hand-first' : prev;
            });
            setCurrentHandSide(winner);
            const lib = winner === 'player' ? library : oppLibrary;
            openingHandRef?.current?.initialize(lib, winner);
        }

        setOpeningHandShown(true);
    }, [library, oppLibrary, gameMode, multiplayer, areas]);

    // Multiplayer safety: if the opening-hand overlay is shown before this client has a populated
    // library (common for guests), initialize as soon as it becomes available.
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (setupPhase !== 'hands') return;
        if (!openingHandShown) return;

        if (guestHandInitializedRef.current) return;

        const hasSelected = openingHandRef?.current?.getHasSelected?.();
        if (hasSelected) {
            guestHandInitializedRef.current = true;
            return;
        }

        const mySide = multiplayer.isHost ? 'player' : 'opponent';
        const myLib = multiplayer.isHost ? library : oppLibrary;
        if (!Array.isArray(myLib) || myLib.length < 10) return;

        openingHandRef?.current?.initialize(myLib, mySide);
        guestHandInitializedRef.current = true;
    }, [gameMode, setupPhase, openingHandShown, multiplayer.isHost, library, oppLibrary, guestHandInitializedRef]);

    // Multiplayer setup sync: after a player clicks Keep/Mulligan, we update areas/libraries locally.
    // Broadcast the committed result (post-state-update) so the opponent reliably sees the correct
    // hand-back count instead of an occasionally stale 0/1 length snapshot.
    const prevSetupHandSigRef = useRef(null);
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (!multiplayer.gameStarted) return;
        if (setupPhase !== 'hands') return;

        const myHandArr = multiplayer.isHost
            ? (areas?.player?.bottom?.hand || [])
            : (areas?.opponent?.top?.hand || []);
        const myLifeArr = multiplayer.isHost
            ? (areas?.player?.life || [])
            : (areas?.opponent?.life || []);

        const sig = `${myHandArr.length}:${myLifeArr.length}`;
        if (prevSetupHandSigRef.current === sig) return;
        prevSetupHandSigRef.current = sig;

        // Only broadcast once the selection has actually populated zones.
        if (myHandArr.length > 0 || myLifeArr.length > 0) {
            // Avoid missing the broadcast if a server sync is being applied at this instant.
            // Retry shortly until the apply guard is cleared.
            let attempts = 0;
            const tryBroadcast = () => {
                attempts++;
                if (!broadcastStateToOpponentRef.current) return;
                if (applyingServerSyncRef.current && attempts < 6) {
                    setTimeout(tryBroadcast, 25);
                    return;
                }
                broadcastStateToOpponentRef.current();
            };
            setTimeout(tryBroadcast, 0);
        }
    }, [gameMode, multiplayer.gameStarted, multiplayer.isHost, setupPhase, areas]);

    // Multiplayer UX: each client should see their own opening-hand modal during the hands phase
    // unless they've already confirmed/kept a hand.
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (setupPhase !== 'hands') return;

        const hasSelected = openingHandRef?.current?.getHasSelected?.();
        if (hasSelected) {
            if (openingHandShown) setOpeningHandShown(false);
            return;
        }

        if (!openingHandShown) {
            setOpeningHandShown(true);
        }
    }, [gameMode, setupPhase, openingHandShown, setOpeningHandShown]);

    //. Which side does this player control in multiplayer?
    const myMultiplayerSide = useMemo(() => {
        if (gameMode !== 'multiplayer') return 'player';
        return multiplayer.isHost ? 'player' : 'opponent';
    }, [gameMode, multiplayer.isHost]);

    const openCardAction = useCallback(async (card, index, source = null) => {
        //. Block opening non-origin cards during targeting
        if (targeting.active && !sameOrigin(source, targeting.origin)) return;
        //. Multiplayer: only allow the controlling player to open actions for their own cards
        if (gameMode === 'multiplayer' && source?.side && source.side !== myMultiplayerSide) return;

        setActionCard(card);
        setActionCardIndex(index);
        setActionSource(source);
        setActionOpen(true);
        setSelectedCard(card);
    }, [targeting.active, targeting.origin, sameOrigin, gameMode, myMultiplayerSide]);

    //. Auto-open Actions for cards just played on the side this client controls
    const justPlayedSeenRef = useRef(new Set());
    useEffect(() => {
        const controlledSide = gameMode === 'multiplayer' ? myMultiplayerSide : 'player';
        const sidePath = controlledSide === 'player' ? 'player.char' : 'opponent.char';
        const chars = _.get(areas, sidePath, []);

        let consumed = false;

        chars.forEach((card, idx) => {
            if (!card?.justPlayed) { return; }
            const key = `${controlledSide}:${card.id || 'unknown'}:${card.enteredTurn ?? 'na'}:${idx}`;
            if (justPlayedSeenRef.current.has(key)) { return; }

            justPlayedSeenRef.current.add(key);
            consumed = true;

            openCardAction(card, idx, {
                side: controlledSide,
                section: 'char',
                keyName: 'char',
                index: idx,
                justPlayed: true
            });
        });

        //. Clear justPlayed flags after consuming so we don't re-trigger
        if (consumed) {
            setAreas((prev) => {
                const next = cloneAreas(prev);
                const target = _.get(next, sidePath, []);
                target.forEach((c) => { if (c?.justPlayed) { delete c.justPlayed; } });
                return next;
            });
        }
    }, [areas, gameMode, myMultiplayerSide, openCardAction, setAreas]);

    const playSelectedCard = useCallback(() => {
        //. Cannot play cards until opening hand is finalized
        if (!canPerformGameAction()) return;
        if (!actionCard) return;

        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';

        //. Enforce timing: only during your Main and no battle
        if (!canPlayNow(side)) return;

        //. RULE ENFORCEMENT: Only the turn player can play cards (6-5-3)
        if (side !== turnSide) {
            appendLog(`Cannot play ${actionCard.id}: not ${side}'s turn.`);
            return;
        }

        const section = actionSource?.section || 'bottom';
        const keyName = actionSource?.keyName || 'hand';
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = getCardCost(actionCard.id, side, section, keyName, index);

        if (!hasEnoughDonFor(side, cost)) {
            appendLog(`Cannot play ${actionCard.id}: need ${cost} DON (${side}).`);
            return;
        }

        // IMPORTANT (multiplayer): build the next areas snapshot synchronously and
        // sync THAT snapshot. React state updates are async; calling broadcast using
        // the closed-over `areas` can send a stale pre-move snapshot and cause the
        // server to immediately overwrite the optimistic local move.
        const nextAreas = cloneAreas(areas);
        const isPlayer = side === 'player';

        const hand = _.get(nextAreas, isPlayer ? 'player.bottom.hand' : 'opponent.top.hand', []);
        const cardIndex = actionCardIndex >= 0
            ? actionCardIndex
            : _.findIndex(hand, ['id', actionCard.id]);
        const chars = _.get(nextAreas, isPlayer ? 'player.char' : 'opponent.char', []);

        //. Can only play if we found the card and have room
        if (cardIndex === -1 || chars.length >= 5) {
            return;
        }

        //. Pay DON cost
        if (cost > 0) {
            const pool = isPlayer ? (nextAreas.player.bottom.cost || []) : (nextAreas.opponent.top.cost || []);
            let remainingCost = cost;

            for (let i = 0; i < pool.length && remainingCost > 0; i++) {
                const don = pool[i];
                if (don?.id === 'DON' && !don.rested) {
                    don.rested = true;
                    remainingCost--;
                }
            }
        }

        //. Remove from hand and place on field
        const [cardToPlay] = hand.splice(cardIndex, 1);
        if (isPlayer) {
            nextAreas.player.bottom.hand = hand;
        } else {
            nextAreas.opponent.top.hand = hand;
        }

        const placedCard = { ...cardToPlay, rested: false, enteredTurn: turnNumber, justPlayed: true };

        if (isPlayer) {
            nextAreas.player.char = [...chars, placedCard];
        } else {
            nextAreas.opponent.char = [...chars, placedCard];
        }

        setAreas(nextAreas);

        const logMessage = `[${side}] Played ${actionCard.id}${cost ? ` by resting ${cost} DON` : ''}.`;
        appendLog(logMessage);

        //. Sync to multiplayer opponent (send the post-move snapshot)
        if (gameMode === 'multiplayer' && multiplayer.gameStarted) {
            multiplayer.syncGameState({
                areas: nextAreas,
                library,
                oppLibrary,
                turnSide,
                turnNumber,
                phase,
                firstPlayer,
                currentHandSide,
                setupPhase,
                playerHandSelected,
                opponentHandSelected,
                modifiers: getModifierState && getModifierState(),
                battle,
                currentAttack,
                battleArrow,
                oncePerTurnUsage,
                attackLocked
            });
        }
    }, [
        actionCard,
        actionCardIndex,
        actionSource,
        canPerformGameAction,
        canPlayNow,
        turnSide,
        appendLog,
        getCardCost,
        hasEnoughDonFor,
        setAreas,
        areas,
        cloneAreas,
        turnNumber,
        gameMode,
        multiplayer,
        library,
        oppLibrary,
        phase,
        firstPlayer,
        currentHandSide,
        setupPhase,
        playerHandSelected,
        opponentHandSelected,
        getModifierState,
        battle,
        currentAttack,
        battleArrow,
        oncePerTurnUsage,
        attackLocked
    ]);

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
        getBattleStatus,
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
        startTargeting,
        cancelTargeting,
        closeActionPanel,
        canPerformGameAction,
        getTotalPower,
        getOpposingSide,
        getCharArray,
        getLeaderArray,
        getHandCostLocation,
        hasKeyword,
        getKeywordsFor,
        hasTempKeyword,
        hasDisabledKeyword,
        cancelDonGiving,
        dealOneDamageToLeader,
        returnDonFromCard,
        modKey,
        turnSide,
        phaseLower,
        turnNumber,
        getCardMeta,
        lockCurrentAttack,
        //. In multiplayer, only host should run automatic battle transitions
        isAuthoritative: gameMode !== 'multiplayer' || multiplayer.isHost
    });

    // Extracted game action helpers
    //. Execute Refresh Phase (CR 6-2)
    const executeRefreshPhase = useCallback((side) => {
        appendLog(`[Refresh Phase] Start ${side}'s turn.`);
        cleanupOnRefreshPhase(side); //. Cleanup modifiers and until-next-turn effects
        //. TODO: 6-2-2 - Activate "at the start of your/opponent's turn" effects
        returnAllGivenDon(side); //. 6-2-3: Return DON from leaders/characters

        //. 6-2-4: Set all rested cards to active
        mutateAreas((next) => {
            refreshSideToActive(next, side);
        }, { onErrorLabel: '[Refresh Phase] Failed to set cards active' });

        appendLog('[Refresh Phase] Complete.');
    }, [appendLog, cleanupOnRefreshPhase, returnAllGivenDon, mutateAreas]);
    //. Wire executeRefreshPhase into ref so opening-hand hook can call it safely
    useEffect(() => {
        executeRefreshPhaseRef.current = executeRefreshPhase;
    }, [executeRefreshPhase]);

    //. Return a friendly player label for logs/UI
    function getPlayerDisplayName(side) {
        if (!side) return 'Unknown Player';
        if (gameMode !== 'multiplayer') return side === 'player' ? 'Player' : 'Opponent';
        const selfName = user || 'You';
        const opponentName = multiplayer.opponentInfo?.username || 'Opponent';
        return multiplayer.isHost
            ? (side === 'player' ? selfName : opponentName)
            : (side === 'player' ? opponentName : selfName);
    }

    //. Finalize multiplayer opening hands when BOTH players have selected.
    // IMPORTANT: do not rely on a separately synced openingHandsBothSelected flag (it can get clobbered).
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (setupPhase !== 'hands') return;
        if (openingHandsFinalizedRef.current) return;

        if (!playerHandSelected || !opponentHandSelected) return;

        console.log(`[Multiplayer ${multiplayer.isHost ? 'Host' : 'Guest'}] Both opening hands selected. Finalizing locally.`);
        finalizeOpeningHands(firstPlayer);
    }, [
        gameMode,
        multiplayer.isHost,
        setupPhase,
        playerHandSelected,
        opponentHandSelected,
        firstPlayer,
        finalizeOpeningHands,
        openingHandsFinalizedRef
    ]);

    //. Label for Next Action button based on phase
    const nextActionLabel = useMemo(() => {
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;

        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') {
            const requestedAmount = isFirst ? 1 : 2;
            const donDeck = getDonDeckArray(turnSide);
            const availableDon = _.size(donDeck);
            const actualAmount = Math.min(requestedAmount, availableDon);
            return `Gain ${actualAmount} DON!!`;
        }
        return endTurnConfirming ? 'Are you sure?' : 'End Turn';
    }, [phaseLower, turnNumber, turnSide, firstPlayer, endTurnConfirming, getDonDeckArray]);

    //. Auto-skip DON phase if deck empty
    useEffect(() => {
        if (!canPerformGameAction() || phaseLower !== 'don') return;

        const isFirst = turnNumber === 1 && turnSide === firstPlayer;
        const requestedAmount = isFirst ? 1 : 2;
        const donDeck = getDonDeckArray(turnSide);
        const availableDon = donDeck.length;
        const actualAmount = Math.min(requestedAmount, availableDon);

        if (actualAmount === 0) {
            appendLog('DON!! deck empty: skipping DON phase.');
            setPhase('Main');
        }
    }, [phaseLower, turnNumber, turnSide, firstPlayer, canPerformGameAction, getDonDeckArray, appendLog, setPhase]);

    //. Auto-skip Draw Phase on the first player's first turn (CR 6-3-1)
    useEffect(() => {
        if (!canPerformGameAction() || phaseLower !== 'draw') return;
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;
        if (!isFirst) return;

        appendLog('First turn: skipping Draw Phase.');
        setPhase('Don');

        if (gameMode === 'multiplayer') {
            setTimeout(() => {
                broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
            }, 100);
        }
    }, [appendLog, canPerformGameAction, firstPlayer, gameMode, phaseLower, setPhase, turnNumber, turnSide]);

    // ============================================================================
    // MULTIPLAYER GAME SYNCHRONIZATION
    // ============================================================================

    //. Determine if this player can take actions in multiplayer
    //. SIMPLIFIED: Both players see host's view
    //. Host controls 'player' side (bottom), Guest controls 'opponent' side (top)
    const isMyTurnInMultiplayer = useMemo(() => {
        if (gameMode !== 'multiplayer') return true;
        if (!multiplayer.gameStarted) return false;
        // Host acts when turnSide === 'player', Guest acts when turnSide === 'opponent'
        return multiplayer.isHost ? turnSide === 'player' : turnSide === 'opponent';
    }, [gameMode, multiplayer.gameStarted, multiplayer.isHost, turnSide]);

    //. Track if we're waiting for opponent
    const waitingForOpponent = useMemo(() => {
        if (gameMode !== 'multiplayer') return false;
        return multiplayer.gameStarted && !isMyTurnInMultiplayer;
    }, [gameMode, multiplayer.gameStarted, isMyTurnInMultiplayer]);

    //. Allow guests to locally mark their hand selection to avoid duplicate popups
    const markHandSelectedLocally = useCallback((side) => {
        if (gameMode !== 'multiplayer') return;
        const setters = {
            player: [setPlayerHandSelected, playerHandSelectedRef],
            opponent: [setOpponentHandSelected, opponentHandSelectedRef]
        };
        const [setState, ref] = setters[side] || [];
        if (setState) { setState(true); ref.current = true; }
    }, [gameMode]);

    // Apply server snapshots into local React state.
    // This replaces the legacy useGuestActions/useMultiplayerSync hook chain.
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (!multiplayer || typeof multiplayer.setOnGameStateSync !== 'function') return;

        const handler = (gameState) => {
            if (!gameState || typeof gameState !== 'object') return;

            applyingServerSyncRef.current = true;
            try {
                // -----------------------------------------------------------------
                // Forward-compat: accept server-authoritative "view state" payloads
                // (setupPhase/diceResult/turn/zones) in addition to legacy snapshots.
                // -----------------------------------------------------------------
                if (gameState?.zones && gameState?.turn) {
                    if (typeof gameState.setupPhase === 'string') {
                        const incoming = gameState.setupPhase;
                        setSetupPhase((prev) => {
                            const order = { dice: 0, hands: 1, 'hand-first': 1, complete: 2 };
                            const prevRank = Object.prototype.hasOwnProperty.call(order, prev) ? order[prev] : 0;
                            const nextRank = Object.prototype.hasOwnProperty.call(order, incoming) ? order[incoming] : 0;
                            return nextRank >= prevRank ? incoming : prev;
                        });
                    }
                    if (gameState.diceResult) setSyncedDiceResult(gameState.diceResult);

                    if (typeof gameState.turn.turnNumber === 'number') setTurnNumber(gameState.turn.turnNumber);
                    if (typeof gameState.turn.turnSide === 'string') setTurnSide(gameState.turn.turnSide);
                    if (typeof gameState.turn.phase === 'string') setPhase(gameState.turn.phase);

                    // Minimal board projection: show your hand face-up, opponent hand as backs.
                    // NOTE: This is intentionally shallow; full server-authoritative areas wiring
                    // will happen in the next refactor phase.
                    setAreas((prev) => {
                        const next = cloneAreas(prev);
                        const myHandIds = gameState.zones?.player?.handIds || [];
                        const oppHandCount = Number(gameState.zones?.opponent?.handCount) || 0;
                        const myLifeCount = Number(gameState.zones?.player?.lifeCount) || 0;
                        const oppLifeCount = Number(gameState.zones?.opponent?.lifeCount) || 0;

                        next.player.bottom.hand = myHandIds
                            .map((id) => getAssetForId(id))
                            .filter(Boolean);

                        next.opponent.top.hand = createCardBacks(oppHandCount);

                        // Life is hidden for both players in OPTCG; keep as backs.
                        next.player.life = createCardBacks(myLifeCount);
                        next.opponent.life = createCardBacks(oppLifeCount);

                        return next;
                    });

                    return;
                }

                const {
                    areas: nextAreas,
                    library: nextLibrary,
                    oppLibrary: nextOppLibrary,
                    turnSide: nextTurnSide,
                    turnNumber: nextTurnNumber,
                    phase: nextPhase,
                    firstPlayer: nextFirstPlayer,
                    currentHandSide: nextCurrentHandSide,
                    setupPhase: nextSetupPhase,
                    playerHandSelected: nextPlayerHandSelected,
                    opponentHandSelected: nextOpponentHandSelected,
                    openingHandsBothSelected: nextOpeningHandsBothSelected,
                    modifiers: nextModifiers,
                    battle: nextBattle,
                    currentAttack: nextCurrentAttack,
                    battleArrow: nextBattleArrow,
                    oncePerTurnUsage: nextOncePerTurnUsage,
                    attackLocked: nextAttackLocked,
                    diceResult: nextDiceResult
                } = gameState;

                // During setup, server snapshots can lag behind local selection.
                // Protect the local player's private zones (hand/life) from being clobbered by
                // stale or concealed snapshots. This is especially important for the host, since
                // the server may echo an older snapshot that does not include the full hand.
                if (nextAreas && typeof nextAreas === 'object') {
                    const myDataSide = multiplayer.isHost ? 'player' : 'opponent';
                    const hasSelected = openingHandRef?.current?.getHasSelected?.();
                    const isSetupHands = nextSetupPhase === 'hands' || setupPhase === 'hands';
                    const preserveAggressively = gameMode === 'multiplayer' && isSetupHands && hasSelected;

                    const isBackCard = (c) => {
                        const id = c?.id;
                        return id === 'BACK' || id === 'CardBack' || id === 'CardBackRegular';
                    };

                    setAreas((prev) => {
                        const prevHand = myDataSide === 'player'
                            ? (prev?.player?.bottom?.hand || [])
                            : (prev?.opponent?.top?.hand || []);
                        const prevLife = myDataSide === 'player'
                            ? (prev?.player?.life || [])
                            : (prev?.opponent?.life || []);

                        const nextHand = myDataSide === 'player'
                            ? (nextAreas?.player?.bottom?.hand || [])
                            : (nextAreas?.opponent?.top?.hand || []);
                        const nextLife = myDataSide === 'player'
                            ? (nextAreas?.player?.life || [])
                            : (nextAreas?.opponent?.life || []);

                        const incomingHandLooksHidden = Array.isArray(nextHand) && nextHand.length > 0 && nextHand.every(isBackCard);
                        const incomingLifeLooksHidden = Array.isArray(nextLife) && nextLife.length > 0 && nextLife.every(isBackCard);

                        // Preserve if incoming snapshot would wipe, hide, or shrink our private zones.
                        // Shrink check fixes the reported "hand suddenly drops to a few cards" issue.
                        const shouldPreserveHand = prevHand.length > 0 && (
                            preserveAggressively
                            || nextHand.length === 0
                            || incomingHandLooksHidden
                            || nextHand.length < prevHand.length
                        );
                        const shouldPreserveLife = prevLife.length > 0 && (
                            preserveAggressively
                            || nextLife.length === 0
                            || incomingLifeLooksHidden
                            || nextLife.length < prevLife.length
                        );

                        if (!shouldPreserveHand && !shouldPreserveLife) {
                            return nextAreas;
                        }

                        const merged = cloneAreas(nextAreas);
                        if (myDataSide === 'player') {
                            if (shouldPreserveHand) merged.player.bottom.hand = prevHand;
                            if (shouldPreserveLife) merged.player.life = prevLife;
                        } else {
                            if (shouldPreserveHand) merged.opponent.top.hand = prevHand;
                            if (shouldPreserveLife) merged.opponent.life = prevLife;
                        }
                        return merged;
                    });
                }
                if (Array.isArray(nextLibrary)) setLibrary(nextLibrary);
                if (Array.isArray(nextOppLibrary)) setOppLibrary(nextOppLibrary);

                if (typeof nextTurnSide === 'string') setTurnSide(nextTurnSide);
                if (typeof nextTurnNumber === 'number') setTurnNumber(nextTurnNumber);
                if (typeof nextPhase === 'string') setPhase(nextPhase);

                if (typeof nextFirstPlayer !== 'undefined') setFirstPlayer(nextFirstPlayer);
                if (typeof nextCurrentHandSide !== 'undefined') setCurrentHandSide(nextCurrentHandSide);
                if (typeof nextSetupPhase === 'string') {
                    const incoming = nextSetupPhase;
                    setSetupPhase((prev) => {
                        const order = { dice: 0, hands: 1, 'hand-first': 1, complete: 2 };
                        const prevRank = Object.prototype.hasOwnProperty.call(order, prev) ? order[prev] : 0;
                        const nextRank = Object.prototype.hasOwnProperty.call(order, incoming) ? order[incoming] : 0;
                        return nextRank >= prevRank ? incoming : prev;
                    });
                }

                if (typeof nextPlayerHandSelected === 'boolean') {
                    setPlayerHandSelected(nextPlayerHandSelected);
                    playerHandSelectedRef.current = nextPlayerHandSelected;
                }
                if (typeof nextOpponentHandSelected === 'boolean') {
                    setOpponentHandSelected(nextOpponentHandSelected);
                    opponentHandSelectedRef.current = nextOpponentHandSelected;
                }
                if (typeof nextOpeningHandsBothSelected === 'boolean') {
                    setOpeningHandsBothSelected(nextOpeningHandsBothSelected);
                }

                if (nextModifiers && typeof nextModifiers === 'object') {
                    setModifierState(nextModifiers);
                }
                if (typeof nextOncePerTurnUsage !== 'undefined') {
                    setOncePerTurnUsage(nextOncePerTurnUsage);
                }
                if (typeof nextAttackLocked !== 'undefined') {
                    setAttackLocked(nextAttackLocked);
                }

                if (typeof nextBattle !== 'undefined') setBattle(nextBattle);
                if (typeof nextCurrentAttack !== 'undefined') setCurrentAttack(nextCurrentAttack);
                if (typeof nextBattleArrow !== 'undefined') setBattleArrow(nextBattleArrow);

                if (nextDiceResult) setSyncedDiceResult(nextDiceResult);
            } finally {
                applyingServerSyncRef.current = false;
            }
        };

        multiplayer.setOnGameStateSync(handler);
        return () => {
            multiplayer.setOnGameStateSync(null);
        };
    }, [
        gameMode,
        multiplayer,
        setAreas,
        setLibrary,
        setOppLibrary,
        setTurnSide,
        setTurnNumber,
        setPhase,
        setFirstPlayer,
        setCurrentHandSide,
        setSetupPhase,
        setOpeningHandShown,
        setPlayerHandSelected,
        setOpponentHandSelected,
        setOpeningHandsBothSelected,
        setModifierState,
        setOncePerTurnUsage,
        setAttackLocked,
        setBattle,
        setCurrentAttack,
        setBattleArrow,
        setSyncedDiceResult
    ]);

    // -----------------------------------------------------------------
    // Multiplayer dice roll: server-authoritative + synchronized animation
    // -----------------------------------------------------------------

    // Listen for the dedicated dice-roll scheduling event.
    useEffect(() => {
        if (gameMode !== 'multiplayer') return;
        if (!multiplayer || typeof multiplayer.setOnDiceRoll !== 'function') return;

        const handler = (payload) => {
            if (!payload || typeof payload !== 'object') return;
            setSyncedDiceResult(payload);
        };

        multiplayer.setOnDiceRoll(handler);
        return () => multiplayer.setOnDiceRoll(null);
    }, [gameMode, multiplayer, setSyncedDiceResult]);

    // Host requests the server dice roll once when entering the dice phase.
    const diceRequestSentRef = useRef(false);
    useEffect(() => {
        if (gameMode !== 'multiplayer') {
            diceRequestSentRef.current = false;
            return;
        }
        if (!multiplayer.gameStarted) return;
        if (setupPhase !== 'dice') {
            diceRequestSentRef.current = false;
            return;
        }
        if (syncedDiceResult) return;
        if (!multiplayer.isHost) return;
        if (diceRequestSentRef.current) return;

        diceRequestSentRef.current = true;
        if (typeof multiplayer.requestDiceRoll === 'function') {
            multiplayer.requestDiceRoll();
        }
    }, [gameMode, multiplayer.gameStarted, multiplayer.isHost, multiplayer.requestDiceRoll, setupPhase, syncedDiceResult]);

    //. Handle game mode selection
    const handleSelectGameMode = useCallback((mode) => {
        mode === 'multiplayer' ? setShowLobby(true) : setGameMode(mode);
    }, []);

    //. Handle Draw/DON/End Turn button
    const onNextAction = useCallback(() => {
        //. In multiplayer, only allow actions on your turn
        if (gameMode === 'multiplayer' && !isMyTurnInMultiplayer) {
            appendLog('Wait for your turn!');
            return;
        }

        if (
            battle ||
            resolvingEffect ||
            targeting.active ||
            (deckSearchRef.current?.active) ||
            triggerPending
        ) {
            appendLog('Cannot end turn while resolving effects or selections.');
            return;
        }
        if (!canPerformGameAction()) return;

        //. First turn: the player who won the dice roll's first turn (skip draw, get 1 DON)
        //. In multiplayer, firstPlayer is 'player' (host) or 'opponent' (guest)
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;

        if (phaseLower === 'draw') {
            if (!isFirst) {
                drawCard(turnSide);
            }
            appendLog(isFirst ? 'First turn: skip draw.' : 'Draw 1.');

            setPhase('Don');

            if (gameMode === 'multiplayer') {
                setTimeout(() => {
                    broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
                }, 100);
            }
            return;
        }

        if (phaseLower === 'don') {
            const amt = isFirst ? 1 : 2;
            const actualGained = donPhaseGain(turnSide, amt);
            if (actualGained === 0) {
                appendLog('DON!! deck empty: gained 0 DON!!');
            } else if (actualGained < amt) {
                appendLog(`DON!! deck low: gained ${actualGained} DON!! (requested ${amt})`);
            } else {
                appendLog(`DON!! +${actualGained}.`);
            }
            setPhase('Main');

            if (gameMode === 'multiplayer') {
                setTimeout(() => {
                    broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
                }, 100);
            }
            return;
        }

        // Handle end-turn confirmation (first click arms, second click proceeds)
        if (!endTurnWithConfirm(3000)) return;

        appendLog('[End Phase] End turn.');
        const nextSide = getOpposingSide(turnSide);
        console.log('[Multiplayer] Ending turn, switching from', turnSide, 'to', nextSide);
        cancelDonGiving();
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);
        // In multiplayer, do NOT execute the opponent's Refresh Phase locally.
        // The server only accepts area updates for the side the sender controls,
        // so running refresh here would be rejected/clobbered. Instead, the
        // new turn player runs Refresh Phase when they receive the turn swap.
        if (gameMode !== 'multiplayer') {
            //. Execute Refresh Phase for the new turn player (rule 6-2)
            executeRefreshPhase(nextSide);
        }

        setPhase('Draw');

        if (gameMode === 'multiplayer') {
            setTimeout(() => {
                broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
            }, 100);
        }
    }, [
        battle,
        resolvingEffect,
        targeting.active,
        triggerPending,
        canPerformGameAction,
        turnNumber,
        turnSide,
        firstPlayer,
        phaseLower,
        drawCard,
        appendLog,
        donPhaseGain,
        getOpposingSide,
        cancelDonGiving,
        executeRefreshPhase,
        endTurnConfirming,
        gameMode,
        multiplayer,
        isMyTurnInMultiplayer
    ]);

    // -----------------------------------------------------------------
    // Multiplayer: run Refresh Phase at start of YOUR turn
    // -----------------------------------------------------------------
    const lastRefreshedTurnKeyRef = useRef(null);
    useEffect(() => {
        if (gameMode !== 'multiplayer') {
            lastRefreshedTurnKeyRef.current = null;
            return;
        }
        if (!multiplayer?.gameStarted) return;
        if (setupPhase !== 'complete') return;
        if (!isMyTurnInMultiplayer) return;
        if (phaseLower !== 'draw') return;

        const key = `${turnNumber}:${turnSide}`;
        if (lastRefreshedTurnKeyRef.current === key) return;
        lastRefreshedTurnKeyRef.current = key;

        // CR 6-2: Return given DON!!, then set rested cards active.
        executeRefreshPhase(turnSide);

        // Push the refreshed state to the server so both clients update.
        const t = setTimeout(() => {
            broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
        }, 50);
        return () => clearTimeout(t);
    }, [
        executeRefreshPhase,
        gameMode,
        isMyTurnInMultiplayer,
        multiplayer?.gameStarted,
        phaseLower,
        setupPhase,
        turnNumber,
        turnSide
    ]);

    const [deckOpen, setDeckOpen] = useState(false);

    // ============================================================================
    // JSX HELPER FUNCTIONS - extracted for cleaner render
    // ============================================================================

    //. Get the hand status message for the Actions panel
    const getHandStatusMessage = useCallback(() => {
        if (battle?.step === 'counter' && actionSource?.side === battle?.target?.side) {
            return 'Counter Step: use counters or counter events.';
        }
        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        const section = getSectionForHand(actionSource, side);
        const keyName = actionSource?.keyName || 'hand';
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = actionCard ? getCardCost(actionCard.id, side, section, keyName, index) : 0;
        
        if (battle) return 'Cannot play during battle.';
        if (!canPlayNow(side)) return 'Cannot play now (must be your Main Phase).';
        
        const ok = hasEnoughDonFor(side, cost);
        return ok
            ? `Playable now (${side}). Cost: ${cost} DON.`
            : `Need ${cost} active DON (${side}).`;
    }, [battle, actionSource, actionCardIndex, actionCard, getCardCost, canPlayNow, hasEnoughDonFor]);

    //. Compute whether next action button should be disabled
    const nextActionDisabled = useMemo(() => (
        !canPerformGameAction() ||
        !!battle ||
        resolvingEffect ||
        targeting.active ||
        deckSearchRef.current?.active ||
        !!triggerPending ||
        (gameMode === 'multiplayer' && !isMyTurnInMultiplayer)
    ), [canPerformGameAction, battle, resolvingEffect, targeting.active, triggerPending, gameMode, isMyTurnInMultiplayer]);

    //. Derive target label for attack targeting UI
    const targetLabel = useMemo(() => {
        if (!Array.isArray(targeting.selected) || !targeting.selected.length) return '';
        const t = targeting.selected[targeting.selected.length - 1];
        if (t.section === 'middle' && t.keyName === 'leader') return 'Opponent Leader';
        if (t.section === 'char' && t.keyName === 'char') {
            const tc = areas?.opponent?.char?.[t.index];
            return tc?.id || 'Opponent Character';
        }
        return '';
    }, [targeting.selected, areas?.opponent?.char]);

    //. Attack controls state - computed once per render instead of in IIFE
    const attackControlsState = useMemo(() => {
        if (!actionSource) return { show: false };
        
        const isOnFieldChar = actionSource.side === turnSide && actionSource.section === 'char' && actionSource.keyName === 'char';
        const isLeader = actionSource.side === turnSide && actionSource.section === 'middle' && actionSource.keyName === 'leader';
        
        if (!isOnFieldChar && !isLeader) return { show: false };
        
        const attackingSide = actionSource.side || 'player';
        const idx = actionCardIndex;
        const isAttacking = battle && (
            (battle.attacker.section === 'char' && battle.attacker.index === idx && battle.attacker.side === attackingSide) ||
            (battle.attacker.section === 'middle' && isLeader && battle.attacker.side === attackingSide)
        );
        
        if (isAttacking && battle?.step !== 'declaring') return { show: false };
        
        const canAtk = isLeader
            ? canLeaderAttack(actionCard, attackingSide)
            : canCharacterAttack(actionCard, attackingSide, idx);
        const isDeclaring = isAttacking && battle?.step === 'declaring';
        
        if (!canAtk && !isDeclaring) return { show: false };
        
        const selecting = targeting.active && currentAttack && (
            (currentAttack.isLeader && isLeader) || (currentAttack.index === idx && !currentAttack.isLeader)
        );
        
        return { show: true, isLeader, selecting, attackingSide, idx };
    }, [actionSource, actionCard, actionCardIndex, turnSide, battle, targeting.active, currentAttack, canLeaderAttack, canCharacterAttack]);

    //. Counter controls for hand cards
    const counterControlsState = useMemo(() => {
        if (!actionSource || actionSource.keyName !== 'hand') return null;
        if (!battle?.target || !(battle.step === 'counter' || battle.step === 'block')) return null;
        if (actionSource.side !== battle.target.side) return null;
        
        const meta = metaById.get(actionCard?.id);
        if (!meta) return null;
        
        const counterVal = getCounterValue(meta);
        const cardType = meta.cardType || meta.category;
        const isEvent = cardType === 'event' || cardType === 'Event';
        const hasCounterKw = hasKeyword(meta.keywords, 'counter');
        const eventCost = isEvent && hasCounterKw ? (_.get(meta, 'cost', _.get(meta, 'stats.cost', 0)) || 0) : null;
        const canPayEvent = eventCost !== null ? hasEnoughDonFor(battle.target.side, eventCost) : false;
        
        return { counterVal, isEvent, hasCounterKw, eventCost, canPayEvent };
    }, [actionSource, actionCard, battle, metaById, hasEnoughDonFor, hasKeyword]);

    //. Computed playability for hand cards
    const handPlayability = useMemo(() => {
        if (!actionSource || actionSource.keyName !== 'hand') return { ok: false, cost: 0 };
        const side = actionSource.side === 'opponent' ? 'opponent' : 'player';
        const section = getSectionForHand(actionSource, side);
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = actionCard ? getCardCost(actionCard.id, side, section, actionSource.keyName || 'hand', index) : 0;
        const ok = canPlayNow(side) && hasEnoughDonFor(side, cost);
        return { ok, cost };
    }, [actionSource, actionCard, actionCardIndex, getCardCost, canPlayNow, hasEnoughDonFor]);

    //. Multiplayer-aware handler for adding counter from hand
    const handleAddCounterFromHand = useCallback((cardIndex) => {
        addCounterFromHand(cardIndex);
        if (gameMode === 'multiplayer') {
            setTimeout(() => {
                broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
            }, 100);
        }
        closeActionPanel();
    }, [gameMode, addCounterFromHand, closeActionPanel]);

    //. Multiplayer-aware handler for playing counter event from hand
    const handlePlayCounterEventFromHand = useCallback((cardIndex) => {
        playCounterEventFromHand(cardIndex);
        if (gameMode === 'multiplayer') {
            setTimeout(() => {
                broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
            }, 100);
        }
        closeActionPanel();
    }, [gameMode, playCounterEventFromHand, closeActionPanel]);

    //. Multiplayer-aware handler for applying blocker
    const handleApplyBlocker = useCallback((blockerIndex) => {
        applyBlocker(blockerIndex);
        if (gameMode === 'multiplayer') {
            setTimeout(() => {
                broadcastStateToOpponentRef.current && broadcastStateToOpponentRef.current();
            }, 100);
        }
    }, [gameMode, applyBlocker]);

    //. Multiplayer-aware handler for initiating attacks
    //. For attacks, both host and guest execute locally because targeting needs to happen client-side
    //. The state will sync via the auto-broadcast after battle state changes
    const handleBeginAttack = useCallback((isLeader, attackCard, attackIdx, attackingSide) => {
        //. Execute attack locally for both host and guest
        //. The battle state changes will be broadcast automatically
        if (isLeader) {
            beginAttackForLeader(attackCard, attackingSide);
        } else {
            beginAttackForCard(attackCard, attackIdx, attackingSide);
        }
    }, [beginAttackForLeader, beginAttackForCard]);

    return (
        <Container
            maxWidth={false}
            disableGutters
            sx={{ py: 0, px: compact ? 1 : 2, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
            <Box sx={{ p: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', m: 0, py: 0, minHeight: 48 }}>
                    <Typography variant='h6' fontWeight={700} sx={{ mb: 0, lineHeight: 1 }}>
                        One Piece TCG Sim
                    </Typography>
                    {isLoggedIn && (
                        <Stack direction='row' spacing={1} alignItems='center'>
                            {gameMode === 'multiplayer' && multiplayer.opponentInfo && (
                                <Chip color='secondary' variant='outlined' label={`VS ${multiplayer.opponentInfo.username}`} />
                            )}
                            {gameSetupComplete ? (
                                <>
                                    <Chip color='primary' label={`Turn ${turnNumber}`} />
                                    <Chip
                                        color={turnSide === 'player' ? 'success' : 'warning'}
                                        label={gameMode === 'multiplayer'
                                            ? (isMyTurnInMultiplayer ? 'Your Turn' : "Opponent's Turn")
                                            : `${turnSide === 'player' ? 'Bottom' : 'Top'} Player's Turn`
                                        }
                                    />
                                    <Chip variant='outlined' label={`Phase: ${phase}`} />
                                </>
                            ) : gameMode !== null && (
                                <Chip
                                    color='info'
                                    label={setupPhase === 'dice'
                                        ? 'Rolling for first turn...'
                                        : `${currentHandSide === 'player' ? 'Bottom' : 'Top'} Player: Choose opening hand`
                                    }
                                />
                            )}
                            {donGivingMode.active && (
                                <Chip
                                    color='warning'
                                    label='Select Leader/Character'
                                    onDelete={cancelDonGiving}
                                    sx={{
                                        animation: 'pulse 1.5s ease-in-out infinite',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 1 },
                                            '50%': { opacity: 0.7 }
                                        }
                                    }}
                                />
                            )}
                            {gameSetupComplete && (
                                <Button
                                    size='small'
                                    variant='contained'
                                    color={phaseLower === 'main' && endTurnConfirming ? 'error' : 'primary'}
                                    onClick={onNextAction}
                                    disabled={nextActionDisabled}
                                >
                                    {gameMode === 'multiplayer' && !isMyTurnInMultiplayer
                                        ? 'Opponents Turn'
                                        : nextActionLabel}
                                </Button>
                            )}
                        </Stack>
                    )}
                    {isLoggedIn && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {gameMode && (
                                <Button size='small' variant='outlined' color='warning' onClick={leaveGame}>
                                    Leave Game
                                </Button>
                            )}
                            <Button size='small' variant='contained' onClick={() => setDeckOpen(true)}>
                                Deck Builder
                            </Button>
                            <Typography variant='body2' sx={{ opacity: 0.9, lineHeight: 1.2 }}>
                                Signed in as: <strong>{user}</strong>
                            </Typography>
                            <Button size='small' variant='outlined' onClick={logout}>
                                Sign out
                            </Button>
                        </Box>
                    )}
                </Box>
                {loading ? (
                    <Typography>Checking session…</Typography>
                ) : !isLoggedIn ? (
                    <LoginRegister compact={compact} />
                ) : showLobby ? (
                    <Lobby
                        multiplayer={multiplayer}
                        onBack={() => setShowLobby(false)}
                        onGameStart={() => {
                            setShowLobby(false);
                            setGameMode('multiplayer');
                        }}
                        userDecks={userDecks}
                        selectedDeck={selectedDeckName}
                        onSelectDeck={setSelectedDeckName}
                    />
                ) : !gameMode ? (
                    <GameModeSelect onSelectMode={handleSelectGameMode} />
                ) : (
                    <Box sx={{ mt: 0 }}>
                        {gameMode === 'multiplayer' && multiplayer.opponentLeft && (
                            <Alert severity="warning" sx={{ mb: 1 }}>
                                Your opponent has left the game. You can continue playing or leave.
                            </Alert>
                        )}
                        <Divider sx={{ mt: -0.5, mb: 0 }} />
                        <Box
                            display='flex'
                            flexDirection={{ xs: 'column', md: 'row' }}
                            gap={compact ? 2 : 3}
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden'
                            }}
                        >
                            {/* Play Area Board (CardViewer overlay inside) */}
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
                                targeting={targeting}
                                setTargeting={setTargeting}
                                currentAttack={currentAttack}
                                setBattleArrow={setBattleArrow}
                                getTotalPower={getTotalPower}
                                battle={battle}
                                getBattleStatus={getBattleStatus}
                                getKeywordsFor={getKeywordsFor}
                                hasDisabledKeyword={hasDisabledKeyword}
                                applyBlocker={applyBlocker}
                                getPowerMod={getPowerMod}
                                getAuraPowerMod={getAuraPowerMod}
                                getCardCost={getCardCost}
                                getAuraCostMod={getAuraCostMod}
                                turnSide={turnSide}
                                CARD_BACK_URL={CARD_BACK_URL}
                                compact={compact}
                                giveDonToCard={giveDonToCard}
                                moveDonFromCostToCard={moveDonFromCostToCard}
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
                                // Multiplayer props
                                isMultiplayer={gameMode === 'multiplayer'}
                                isMyTurn={isMyTurnInMultiplayer}
                                multiplayerRole={myMultiplayerSide}
                                isHost={multiplayer.isHost}
                                onGuestAction={null}
                                onBroadcastStateRef={broadcastStateToOpponentRef}
                            />
                            {/* Activity Log Panel */}
                            <Box sx={{
                                width: { xs: '100%', md: compact ? 380 : 440 },
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                minHeight: 0
                            }}>
                                <Typography
                                    variant={compact ? 'h6' : 'h5'}
                                    gutterBottom
                                    sx={{ mb: compact ? 1 : 2, flexShrink: 0 }}
                                >
                                    Activity Log
                                </Typography>
                                <Box sx={{
                                    border: '1px dashed',
                                    borderColor: 'divider',
                                    p: 1,
                                    borderRadius: 1,
                                    flex: 1,
                                    minHeight: 0,
                                    height: 200,
                                    overflow: 'auto',
                                    bgcolor: 'background.default'
                                }}>
                                    {log.map((entry, i) => (
                                        <Typography key={i} variant='caption' display='block'>{entry}</Typography>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>

            {isLoggedIn && (
                <DeckBuilder
                    open={deckOpen}
                    onClose={() => setDeckOpen(false)}
                />
            )}

            {actionOpen && ( /* Actions Panel */
                <ClickAwayListener
                    onClickAway={() => {
                        if (targeting?.active && sameOrigin(targeting.origin, actionSource)) { //. Suspend targeting if active
                            suspendTargeting();
                        }
                        setResolvingEffect(false);
                        closeActionPanel();
                    }}
                >
                    <div>
                        <Actions
                            onClose={() => {
                                if (targeting?.active && sameOrigin(targeting.origin, actionSource)) {
                                    suspendTargeting();
                                }
                                setResolvingEffect(false);
                                closeActionPanel();
                            }}
                            card={actionCard}
                            cardMeta={metaById.get(actionCard?.id)}
                            cardIndex={actionCardIndex}
                            actionSource={actionSource}
                            phase={phase}
                            turnSide={turnSide}
                            turnNumber={turnNumber}
                            isYourTurn={turnSide === (actionSource?.side || 'player')}
                            canActivateMain={canPlayNow(actionSource?.side || 'player')}
                            areas={areas}
                            startTargeting={startTargeting}
                            cancelTargeting={cancelTargeting}
                            suspendTargeting={suspendTargeting}
                            resumeTargeting={resumeTargeting}
                            confirmTargeting={confirmTargeting}
                            targeting={targeting}
                            getCardMeta={(id) => metaById.get(id) || null}
                            applyPowerMod={applyPowerMod}
                            registerUntilNextTurnEffect={registerUntilNextTurnEffect}
                            grantTempKeyword={addTempKeyword}
                            disableKeyword={addDisabledKeyword}
                            giveDonToCard={giveDonToCard}
                            moveDonFromCostToCard={moveDonFromCostToCard}
                            returnDonFromCardToDeck={returnDonToDonDeckFromCard}
                            detachDonFromCard={detachDonFromCard}
                            startDeckSearch={startDeckSearch}
                            returnCardToDeck={returnCardToDeck}
                            restCard={restCard}
                            setActive={setActive}
                            payLife={payLife}
                            battle={battle}
                            battleApplyBlocker={handleApplyBlocker}
                            battleSkipBlock={skipBlock}
                            battleAddCounterFromHand={handleAddCounterFromHand}
                            battlePlayCounterEvent={handlePlayCounterEventFromHand}
                            battleEndCounterStep={endCounterStep}
                            battleGetDefPower={() => getDefenderPower(battle)}
                            removeCardByEffect={removeCardByEffect}
                            setResolvingEffect={setResolvingEffect}
                            getTotalPower={getTotalPower}
                            markAbilityUsed={markOncePerTurnUsed}
                            drawCards={drawCard}
                            lockCurrentAttack={lockCurrentAttack}
                            abilityUsage={
                                actionSource
                                    ? oncePerTurnUsage[
                                    modKey(
                                        actionSource.side || 'player',
                                        actionSource.section || 'char',
                                        actionSource.keyName || 'char',
                                        _.isNumber(actionSource.index) ? actionSource.index : 0
                                    )
                                    ]
                                    : undefined
                            }
                        >
                            {actionSource?.keyName === 'hand' ? ( /* Hand Card Actions */
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography variant='caption' display='block' sx={{ mb: 1 }}>
                                        {getHandStatusMessage()}
                                    </Typography>
                                    {counterControlsState ? (
                                        counterControlsState.counterVal || (counterControlsState.isEvent && counterControlsState.hasCounterKw) ? (
                                            <Stack direction='row' spacing={1}>
                                                {counterControlsState.counterVal > 0 && (
                                                    <Button
                                                        size='small'
                                                        variant='contained'
                                                        color='error'
                                                        onClick={() => handleAddCounterFromHand(actionCardIndex)}
                                                    >
                                                        Discard for Counter +{counterControlsState.counterVal}
                                                    </Button>
                                                )}
                                                {counterControlsState.isEvent && counterControlsState.hasCounterKw && (
                                                    <Button
                                                        size='small'
                                                        variant='outlined'
                                                        disabled={!counterControlsState.canPayEvent}
                                                        onClick={() => handlePlayCounterEventFromHand(actionCardIndex)}
                                                    >
                                                        Play Counter Event (Cost {counterControlsState.eventCost})
                                                    </Button>
                                                )}
                                            </Stack>
                                        ) : (
                                            <Typography variant='caption'>No counter on this card.</Typography>
                                        )
                                    ) : (
                                        <Button
                                            variant='contained'
                                            disabled={!handPlayability.ok}
                                            onClick={playSelectedCard}
                                        >
                                            Play to Character Area
                                        </Button>
                                    )}
                                </>
                            ) : (
                                <Typography variant='caption' display='block' sx={{ mb: 1 }}>
                                    {phaseLower === 'main' && actionSource?.side === turnSide
                                        ? 'Select an action for this card.'
                                        : 'Actions are limited outside the Main Phase or when it\'s not your turn.'}
                                </Typography>
                            )}
                            {attackControlsState.show && (
                                attackControlsState.selecting ? (
                                    <Stack direction='row' spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                                        <Chip
                                            size='small'
                                            color='warning'
                                            label={targetLabel ? `Target: ${targetLabel}` : 'Select a target'}
                                        />
                                        <Button
                                            size='small'
                                            variant='contained'
                                            disabled={(targeting.selected?.length || 0) < 1}
                                            onClick={confirmTargeting}
                                        >
                                            Confirm Attack
                                        </Button>
                                        <Button
                                            size='small'
                                            variant='outlined'
                                            onClick={cancelAttack}
                                            disabled={attackLocked}
                                        >
                                            Cancel Attack
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Stack direction='row' spacing={1} sx={{ mt: 1 }}>
                                        <Button
                                            size='small'
                                            variant='contained'
                                            onClick={() => handleBeginAttack(
                                                attackControlsState.isLeader,
                                                actionCard,
                                                attackControlsState.idx,
                                                attackControlsState.attackingSide
                                            )}
                                        >
                                            Attack
                                        </Button>
                                    </Stack>
                                )
                            )}
                        </Actions>
                    </div>
                </ClickAwayListener>
            )}

            <Activity
                battle={battle}
                battleArrow={battleArrow}
                getBattleStatus={getBattleStatus}
                skipBlock={skipBlock}
                endCounterStep={endCounterStep}
                isMultiplayer={gameMode === 'multiplayer'}
                myMultiplayerSide={myMultiplayerSide}
                isHost={multiplayer.isHost}
                sendGuestAction={null}
                broadcastState={broadcastStateToOpponent}
            />

            {triggerPending && ( /* Trigger Activation Modal (CR 4-6-3, 10-1-5) */
                <Paper
                    elevation={8}
                    sx={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1500,
                        p: 3,
                        minWidth: 400,
                        bgcolor: 'background.paper',
                        border: '3px solid',
                        borderColor: 'warning.main'
                    }}
                >
                    <Stack spacing={2}>
                        <Typography variant='h6' fontWeight={700} color='warning.main'>
                            [Trigger] Card Revealed!
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <img
                                src={triggerPending.card.full || triggerPending.card.thumb}
                                alt={triggerPending.card.id}
                                style={{ width: 200, height: 'auto', borderRadius: 8 }}
                            />
                        </Box>
                        <Typography variant='body1'>
                            <strong>{triggerPending.side === 'player' ? 'You' : 'Opponent'}</strong>{' '}
                            revealed <strong>{triggerPending.card.id}</strong> from Life.
                        </Typography>
                        <Typography variant='body2' color='text.secondary'>
                            Choose to activate its [Trigger] effect, or add it to hand.
                        </Typography>
                        <Stack direction='row' spacing={2}>
                            <Button fullWidth variant='contained' color='warning' onClick={onTriggerActivate}>
                                Activate [Trigger]
                            </Button>
                            <Button fullWidth variant='outlined' onClick={onTriggerDecline}>
                                Add to Hand
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}

            {/* Dice Roll for game start */}
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
                onDiceRolled={null}
            />
        </Container>
    );
}
