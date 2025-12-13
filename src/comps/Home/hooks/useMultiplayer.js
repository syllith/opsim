// src/comps/Home/hooks/useMultiplayer.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_URL = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:5583';

function makeCommandId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random()*1e9).toString(36)}`;
}

export default function useMultiplayer({ username, enabled = false, url = DEFAULT_URL } = {}) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [currentLobby, setCurrentLobby] = useState(null);
  const [playerRole, setPlayerRole] = useState(null); // 'player' or 'opponent'
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [opponentInfo, setOpponentInfo] = useState(null);
  const [opponentLeft, setOpponentLeft] = useState(false);

  // event refs for handlers
  const onGameStartRef = useRef(null);
  const onStatePatchRef = useRef(null);
  const onCommandAckRef = useRef(null);
  const onOpponentLeftRef = useRef(null);
  const onLobbyUpdatedRef = useRef(null);
  const onDiceRollRef = useRef(null);

  useEffect(() => {
    if (!enabled || !username) return;

    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(null);
      socket.emit('setUsername', username);
      socket.emit('requestLobbyList');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      setConnectionError('Failed to connect to game server');
      console.error('[Multiplayer] connect_error', err);
    });

    socket.on('lobbyList', (list) => setLobbies(list));

    socket.on('lobbyJoined', ({ lobby, role }) => {
      setCurrentLobby(lobby);
      const isHostNow = lobby?.hostId === socket.id;
      setPlayerRole(role);
      setIsHost(isHostNow);
      setOpponentLeft(false);
      const mySocketId = socket.id;
      const opponent = (lobby.players || []).find(p => p.socketId !== mySocketId) || null;
      setOpponentInfo(opponent);
      onLobbyUpdatedRef.current && onLobbyUpdatedRef.current(lobby);
    });

    socket.on('lobbyUpdated', (lobby) => {
      setCurrentLobby(lobby);
      const isHostNow = lobby?.hostId === socket.id;
      setPlayerRole(lobby.players?.find(p => p.socketId === socket.id)?.role || null);
      setIsHost(isHostNow);
      const mySocketId = socket.id;
      const opponent = (lobby.players || []).find(p => p.socketId !== mySocketId) || null;
      setOpponentInfo(opponent);
      onLobbyUpdatedRef.current && onLobbyUpdatedRef.current(lobby);
    });

    socket.on('gameStart', (data) => {
      setGameStarted(true);
      onGameStartRef.current && onGameStartRef.current(data);
    });

    // Authoritative per-player patches from server.commandProcessor
    socket.on('statePatch', (patch) => {
      // patch: { fromVersion, toVersion, state }
      onStatePatchRef.current && onStatePatchRef.current(patch.state, { fromVersion: patch.fromVersion, toVersion: patch.toVersion });
    });

    // commandAck replies
    socket.on('commandAck', (ack) => {
      onCommandAckRef.current && onCommandAckRef.current(ack);
    });

    socket.on('opponentLeft', (data) => {
      setOpponentLeft(true);
      setOpponentInfo(null);
      onOpponentLeftRef.current && onOpponentLeftRef.current(data);
    });

    socket.on('diceRollStart', (payload) => {
      onDiceRollRef.current && onDiceRollRef.current(payload);
    });

    socket.on('error', (err) => {
      console.error('[Multiplayer] server error', err);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, username, url]);

  // Lobby APIs
  const createLobby = useCallback((lobbyName, deckConfig = null) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('createLobby', { lobbyName, deckConfig });
  }, []);

  const joinLobby = useCallback((lobbyId, deckConfig = null) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('joinLobby', { lobbyId, deckConfig });
  }, []);

  const leaveLobby = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('leaveLobby');
    setCurrentLobby(null);
    setPlayerRole(null);
    setIsHost(false);
    setGameStarted(false);
    setOpponentInfo(null);
    setOpponentLeft(false);
  }, []);

  const updateDeck = useCallback((deckConfig) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('updateDeck', deckConfig);
  }, []);

  const setReady = useCallback((isReady) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('setReady', isReady);
  }, []);

  const requestDiceRoll = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('requestDiceRoll');
  }, []);

  // -------------------------
  // sendCommand (authoritative)
  // -------------------------
  const sendCommand = useCallback((type, payload = {}, opts = {}) => {
    const s = socketRef.current;
    if (!s || !s.connected) {
      console.warn('[Multiplayer] sendCommand failed - socket not connected');
      return null;
    }
    const commandId = opts.commandId || makeCommandId();
    const lastKnownStateVersion = opts.lastKnownStateVersion ?? null;
    const command = { commandId, type, payload, lastKnownStateVersion };
    s.emit('command', command);
    return command;
  }, []);

  const ACTION_TO_COMMAND = {
    HAND_CONFIRM: 'OPENING_HAND_CONFIRM',
    SETUP_READY: 'SETUP_READY',
    DRAW_CARD: 'DRAW_CARD',
    DRAW_DON: 'DRAW_DON',
    END_TURN: 'END_TURN',
    PLAY_CARD: 'PLAY_CARD',
    BEGIN_ATTACK: 'BEGIN_ATTACK',
    APPLY_BLOCKER: 'APPLY_BLOCKER',
    ADD_COUNTER_FROM_HAND: 'ADD_COUNTER_FROM_HAND',
    RESOLVE_DAMAGE: 'RESOLVE_DAMAGE'
  };

  const sendAction = useCallback((actionType, payload = {}, opts = {}) => {
    const cmdType = ACTION_TO_COMMAND[actionType] || actionType;
    return sendCommand(cmdType, payload, opts);
  }, [sendCommand]);

  // Request current authoritative state (rehydrate on reconnect)
  const requestState = useCallback((lobbyId = null) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit('requestState', { lobbyId });
  }, []);

  // --- handler registration functions ---
  const setOnGameStart = useCallback((fn) => { onGameStartRef.current = fn; }, []);
  const setOnStatePatch = useCallback((fn) => { onStatePatchRef.current = fn; }, []);
  const setOnCommandAck = useCallback((fn) => { onCommandAckRef.current = fn; }, []);
  const setOnOpponentLeft = useCallback((fn) => { onOpponentLeftRef.current = fn; }, []);
  const setOnLobbyUpdated = useCallback((fn) => { onLobbyUpdatedRef.current = fn; }, []);
  const setOnDiceRoll = useCallback((fn) => { onDiceRollRef.current = fn; }, []);

  // Expose API
  return {
    connected,
    connectionError,
    lobbies,
    currentLobby,
    playerRole,
    isHost,
    gameStarted,
    opponentInfo,
    opponentLeft,

    // Lobby functions
    createLobby,
    joinLobby,
    leaveLobby,
    updateDeck,
    setReady,
    requestDiceRoll,

    // Command pipeline
    sendCommand,
    sendAction,
    requestState,

    // Handlers
    setOnGameStart,
    setOnStatePatch,
    setOnCommandAck,
    setOnOpponentLeft,
    setOnLobbyUpdated,
    setOnDiceRoll
  };
}
