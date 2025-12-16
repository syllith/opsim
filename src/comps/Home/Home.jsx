// src/comps/Home/Home.jsx
/**
 * Home.jsx - Main game component for One Piece TCG Sim
 *
 * Modified to wire UI 'areas' -> engine gameState and to make engine authoritative
 * for core game actions while preserving UI appearance.
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

// Engine adapter + engine facade
import engine from '../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas } from './hooks/engineAdapter.js';

// Constants (kept from original)
const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';
const HARDCODED = true;
const DEMO_LEADER = 'OP09-001';
const DEMO_DECK_ITEMS = [
  { id: 'OP01-006', count: 4 }, { id: 'OP09-002', count: 4 }, { id: 'OP09-008', count: 4 },
  { id: 'OP09-011', count: 4 }, { id: 'OP09-014', count: 4 }, { id: 'OP12-008', count: 4 },
  { id: 'OP09-013', count: 4 }, { id: 'PRB02-002', count: 4 }, { id: 'ST23-001', count: 2 },
  { id: 'OP09-009', count: 4 }, { id: 'ST15-002', count: 3 }, { id: 'OP08-118', count: 4 },
  { id: 'OP06-007', count: 3 }, { id: 'OP09-004', count: 2 }
];

// Unique key for card location (unchanged)
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

  // Multiplayer layer
  const multiplayer = useMultiplayer({
    username: user,
    enabled: isLoggedIn && (showLobby || gameMode === 'multiplayer')
  });

  // Load user decks (unchanged)
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

  // Game setup
  const [setupPhase, setSetupPhase] = useState('dice'); // 'dice', 'opening', 'complete'
  const [firstPlayer, setFirstPlayer] = useState(null);
  const [currentHandSide, setCurrentHandSide] = useState(null);
  const [syncedDiceResult, setSyncedDiceResult] = useState(null);

  // Core game state helpers
  const gameStarted = gameMode !== null;
  const gameSetupComplete = setupPhase === 'complete';
  const [library, setLibrary] = useState([]);
  const [oppLibrary, setOppLibrary] = useState([]);
  const deckSearchRef = useRef(null);
  const openingHandRef = useRef(null);
  const [openingHandShown, setOpeningHandShown] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

  // Deck initialization (we pass the same setAreas, but we will ensure dispatch for play flows)
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
    setAreas,           // leave as is for deck UI initialization
    setLibrary,
    setOppLibrary,
    initializeDonDecks: () => {},
    openingHandRef,
    demoConfig: { HARDCODED, DEMO_LEADER, DEMO_DECK_ITEMS },
    cardBackUrl: CARD_BACK_URL,
    gameMode,
    isMultiplayerHost: gameMode !== 'multiplayer' || multiplayer.isHost
  });

  // Turn state and logging
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

  // Refs for opening hands broadcast / refresh
  const broadcastStateToOpponentRef = useRef(null);
  const executeRefreshPhaseRef = useRef(null);

  // Opening hands
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

  // Card area manipulation (dev/debug) - keep as-is for UI testing
  const addCardToArea = useCallback((side, section, key) => {
    if (gameStarted) return;
    const card = getRandomCard();
    if (!card) return;
    addCardToAreaUnsafe(side, section, key, card);
  }, [gameStarted, getRandomCard, addCardToAreaUnsafe]);

  const removeCardFromArea = useCallback((side, section, key) => {
    if (!gameStarted) removeCardFromAreaUnsafe(side, section, key);
  }, [gameStarted, removeCardFromAreaUnsafe]);

  // Action panel
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

  // Battle state
  const [currentAttack, setCurrentAttack] = useState(null);
  const [battleArrow, setBattleArrow] = useState(null);
  const [battle, setBattle] = useState(null);

  // DON management (keeps using engine conversion where used)
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

  useEffect(() => {
    initializeDonDecks();
  }, [initializeDonDecks]);

  // Card stats
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

  // Play card flows
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

  // Battle system
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

  // ---- ENGINE DISPATCH LAYER ----
  // This wrapper centralizes: convert areas -> gameState, execute engine action, convert back to areas.
  const dispatchAction = useCallback(async (action, ctx = {}) => {
    // If multiplayer guest -> forward to server (server authoritative)
    if (gameMode === 'multiplayer' && multiplayer && !multiplayer.isHost) {
      // forward the logical action to the server
      multiplayer.sendGameAction(action);
      return { forwarded: true };
    }

    // Otherwise host or single-player: execute using engine/interpreter
    try {
      // Build gameState from UI areas
      const gameState = convertAreasToGameState(areas, {
        turnSide: turnSide || 'player',
        turnNumber: turnNumber || 1,
        phase: (phase || 'main')
      });

      // choose executor: prefer engine.executeAction if available (other modules call engine.executeAction)
      const executor = (engine && typeof engine.executeAction === 'function')
        ? engine.executeAction
        : (interpreter && typeof interpreter.executeAction === 'function')
          ? interpreter.executeAction
          : null;

      if (!executor) {
        const err = 'No engine executeAction available';
        appendLog?.(`[Engine] ${err}`);
        return { success: false, error: err };
      }

      // Allow executor to be sync or async
      const result = await Promise.resolve(executor(gameState, action, ctx || { activePlayer: turnSide }));

      // If execution mutated gameState and succeeded, convert back to areas
      if (result && result.success) {
        const newAreas = convertGameStateToAreas(gameState);
        // Atomic update of UI state + turn/phase if available
        setAreas(newAreas);

        // If the engine returned updated turn info, sync UI turn info (safely)
        if (gameState.turnPlayer) setTurnSide(gameState.turnPlayer);
        if (typeof gameState.turnNumber === 'number') setTurnNumber(gameState.turnNumber);
        if (gameState.phase) setPhase(gameState.phase);

        // If multiplayer host, broadcast new authoritative state to server
        if (gameMode === 'multiplayer' && multiplayer && multiplayer.isHost) {
          try {
            // send engine-compatible gamestate to server for authoritative sync
            multiplayer.syncGameState(gameState);
          } catch (e) {
            console.warn('[Multiplayer] syncGameState failed:', e);
          }
        }

        return result;
      } else {
        // Execution failed - log and return
        appendLog?.(`[Engine] Action failed: ${result?.error || 'unknown error'}`);
        return result || { success: false, error: 'unknown engine error' };
      }
    } catch (e) {
      appendLog?.(`[Engine] Error dispatching action: ${e.message}`);
      return { success: false, error: e.message };
    }
  }, [gameMode, multiplayer, areas, turnSide, turnNumber, phase, setAreas, appendLog]);

  // ---- MULTIPLAYER SUBSCRIPTIONS ----
  useEffect(() => {
    if (!multiplayer) return;

    // When server sends an authoritative gameState, apply it
    multiplayer.setOnGameStateSync((gameStateFromServer) => {
      try {
        if (!gameStateFromServer) return;
        const converted = convertGameStateToAreas(gameStateFromServer);
        setAreas(converted);
        // sync turn/phase UI state
        if (gameStateFromServer.turnPlayer) setTurnSide(gameStateFromServer.turnPlayer);
        if (typeof gameStateFromServer.turnNumber === 'number') setTurnNumber(gameStateFromServer.turnNumber);
        if (gameStateFromServer.phase) setPhase(gameStateFromServer.phase);
      } catch (e) {
        console.warn('[Multiplayer] Failed to apply server gameState:', e);
      }
    });

    // Dice roll scheduling from server
    multiplayer.setOnDiceRoll((payload) => {
      // payload expected format: { playerRoll, opponentRoll, firstPlayer, startAt, revealAt, ... }
      setSyncedDiceResult(payload);
    });

    // cleanup - if the hook had remove handlers, we'd remove; useMultiplayer uses refs under the hood
    return () => {
      // nothing to cleanup; useMultiplayer uses refs to handlers
    };
  }, [multiplayer, setAreas, setTurnSide, setTurnNumber, setPhase]);

  // If host we should request server-authoritative dice roll when multiplayer and in 'dice' phase
  useEffect(() => {
    if (gameMode === 'multiplayer' && multiplayer && multiplayer.isHost && setupPhase === 'dice') {
      // Request server to schedule a dice roll; it will broadcast diceRollStart -> setSyncedDiceResult
      multiplayer.requestDiceRoll();
    }
    // Note: guests will wait for server diceRollStart event and setSyncedDiceResult
  }, [gameMode, multiplayer, multiplayer?.isHost, setupPhase]);

  // ---- DICE ROLL HANDLERS ----
  const handleDiceComplete = useCallback((result) => {
    // result is { firstPlayer: 'player' | 'opponent', playerRoll, opponentRoll }
    setFirstPlayer(result.firstPlayer);
    // decide next phase
    setSetupPhase('opening');
    // In multiplayer host/guest, we assume server-dice ensured consistency.
  }, []);

  // Callback used by DiceRoll when host determines/published a roll (for local/single player or host manual)
  const onDiceRolledByHost = useCallback((payload) => {
    // payload contains { firstPlayer, playerRoll, opponentRoll }
    // If multiplayer host, server will handle broadcasting; if local singleplayer or host
    // running locally, we just call handleDiceComplete immediately.
    handleDiceComplete(payload);
  }, [handleDiceComplete]);

  // ---- LEAVE GAME ----
  const leaveGame = useCallback(() => {
    if (gameMode === 'multiplayer' && multiplayer.currentLobby) {
      multiplayer.leaveLobby();
    }
    // Reset UI local states
    setSetupPhase('dice');
    setGameMode(null);
    setFirstPlayer(null);
    setAreas(createInitialAreas()); // reset areas to createInitialAreas (imported via hooks)
    resetLog();
  }, [gameMode, multiplayer, setAreas, resetLog]);

  // ---- Rendering / UI ----
  // Keep the same appearance / composition: header, conditionals for game mode / lobby, the Board + side panels.
  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <PromptProvider />
      {!isLoggedIn ? (
        <Box sx={{ mt: 6 }}>
          <LoginRegister />
        </Box>
      ) : (
        <Box>
          {/* Top header */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
              One Piece TCG — Opsim
            </Typography>
            <Chip label={user || 'Guest'} color="primary" />
            <Button variant="outlined" onClick={() => { logout(); }}>
              Logout
            </Button>
          </Stack>

          {/* Mode selection / Lobby */}
          {!gameStarted && !showLobby && (
            <Box sx={{ mb: 3 }}>
              <GameModeSelect onSelectMode={(mode) => setGameMode(mode)} />
            </Box>
          )}

          {showLobby && (
            <Lobby
              multiplayer={multiplayer}
              onBack={() => setShowLobby(false)}
              onGameStart={() => {
                setGameMode('multiplayer');
                setShowLobby(false);
              }}
              userDecks={userDecks}
              selectedDeck={selectedDeckName}
              onSelectDeck={(name) => setSelectedDeckName(name)}
            />
          )}

          {/* If in game mode but not started, show top controls */}
          {gameStarted && (
            <Box>
              {/* Dice roll modal during setup */}
              <DiceRoll
                visible={setupPhase === 'dice'}
                isMultiplayer={gameMode === 'multiplayer'}
                isHost={multiplayer.isHost}
                syncedResult={syncedDiceResult}
                onComplete={(res) => {
                  handleDiceComplete(res);
                }}
                onDiceRolled={onDiceRolledByHost}
              />

              {/* Main game area */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                {/* Left: Board */}
                <Box sx={{ flex: 1 }}>
                  <Board
                    areas={areas}
                    setAreas={setAreas}
                    hovered={hovered}
                    setHovered={setHovered}
                    gameStarted={gameStarted}
                    addCardToArea={addCardToArea}
                    removeCardFromArea={removeCardFromArea}
                    openCardAction={(card, idx, src) => {
                      setActionCard(card);
                      setActionCardIndex(idx);
                      setActionSource(src);
                      setActionOpen(true);
                    }}
                    actionOpen={actionOpen}
                    actionCardIndex={actionCardIndex}
                    targeting={false}
                    setTargeting={() => {}}
                    currentAttack={currentAttack}
                    setBattleArrow={setBattleArrow}
                    getTotalPower={(instanceId) => getTotalPower(areas, instanceId)}
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
                    executeRefreshPhase={() => {}}
                    setPhase={setPhase}
                    isMultiplayer={gameMode === 'multiplayer'}
                    isMyTurn={isMyTurnInMultiplayer}
                    multiplayerRole={myMultiplayerSide}
                    isHost={multiplayer.isHost}
                    onGuestAction={(action) => {
                      // Guest actions forwarded via dispatchAction for host/local
                      dispatchAction(action);
                    }}
                    markHandSelectedLocally={(side) => {}}
                    onBroadcastStateRef={broadcastStateToOpponentRef}
                  />
                </Box>

                {/* Right: activity and small panels */}
                <Box sx={{ width: 360 }}>
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Stack spacing={1}>
                      <Typography variant="h6">Game Info</Typography>
                      <Typography variant="body2">Turn: {turnNumber} — Phase: {phase}</Typography>
                      <Typography variant="body2">Side: {turnSide}</Typography>
                      <Divider />
                      <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={() => setDeckOpen(!deckOpen)}>Deck</Button>
                        <Button variant="contained" onClick={() => setActionOpen(!actionOpen)}>Actions</Button>
                        <Button variant="outlined" onClick={leaveGame}>Leave</Button>
                      </Stack>
                    </Stack>
                  </Paper>

                  <Activity log={log} />

                  <Paper sx={{ p: 2, mt: 2 }}>
                    <Typography variant="subtitle1">Decks</Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {userDecks.map((d) => <Chip key={d.name} label={d.name} />)}
                      <Button size="small" onClick={() => setShowLobby(true)}>Open Lobby</Button>
                    </Stack>
                  </Paper>
                </Box>
              </Box>

              {/* Floating Panels */}
              <Actions
                title="Card Actions"
                onClose={closeActionPanel}
                width={420}
                maxHeight="calc(100vh - 32px)"
                card={actionCard}
                cardMeta={actionCard ? metaById.get(actionCard.id) : null}
                cardLocation={actionSource}
                areas={areas}
                setAreas={setAreas}
                phase={phase}
                turnSide={turnSide}
                turnNumber={turnNumber}
                isYourTurn={isMyTurnInMultiplayer}
                battle={battle}
                appendLog={appendLog}
                onAbilityActivated={(instanceId, abilityIndex) => {
                  appendLog?.(`[Actions] Ability activated: ${instanceId}:${abilityIndex}`);
                }}
              />

              {/* Deck builder overlay */}
              {deckOpen && (
                <DeckBuilder
                  open={deckOpen}
                  onClose={() => setDeckOpen(false)}
                />
              )}
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
}
