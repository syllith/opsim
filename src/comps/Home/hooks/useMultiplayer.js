/**
 * useMultiplayer.js
 * 
 * Custom hook for managing multiplayer game state and Socket.io communication.
 * 
 * SERVER-AUTHORITATIVE ARCHITECTURE:
 * - Server is authoritative for ALL game state
 * - Both players send actions to the server
 * - Server validates / applies actions and broadcasts updated state
 * - Host/guest distinction is now UI-only (which side you see as "you")
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Socket.io server URL - uses same origin in production
const SOCKET_URL = import.meta.env.PROD 
    ? window.location.origin 
    : 'http://localhost:5583';

export function useMultiplayer({ username, enabled = false }) {
    // Socket connection
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(null);

    // Lobby state
    const [lobbies, setLobbies] = useState([]);
    const [currentLobby, setCurrentLobby] = useState(null);
    const [playerRole, setPlayerRole] = useState(null); // 'host' or 'guest'
    const [isHost, setIsHost] = useState(false);

    // Game state
    const [gameStarted, setGameStarted] = useState(false);
    const [opponentInfo, setOpponentInfo] = useState(null);
    const [opponentLeft, setOpponentLeft] = useState(false);

    // Event handlers stored in refs to avoid stale closures
    const onGameStartRef = useRef(null);
    const onGameStateSyncRef = useRef(null);
    const onOpponentLeftRef = useRef(null);

    // Dice roll sync (server-authoritative)
    const onDiceRollRef = useRef(null);

    // Track if we're host (stored in ref for socket handlers)
    const isHostRef = useRef(false);

    // Initialize socket connection
    useEffect(() => {
        if (!enabled || !username) {
            return;
        }

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Multiplayer] Connected to server');
            setConnected(true);
            setConnectionError(null);
            socket.emit('setUsername', username);
            socket.emit('requestLobbyList');
        });

        socket.on('disconnect', () => {
            console.log('[Multiplayer] Disconnected from server');
            setConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.error('[Multiplayer] Connection error:', error);
            setConnectionError('Failed to connect to game server');
        });

        socket.on('error', (data) => {
            console.error('[Multiplayer] Server error:', data.message);
            setConnectionError(data.message);
        });

        // Lobby events
        socket.on('lobbyList', (list) => {
            setLobbies(list);
        });

        socket.on('lobbyJoined', ({ lobby, role }) => {
            console.log('[Multiplayer] Joined lobby as', role);
            setCurrentLobby(lobby);
            // First player to join is host, second is guest
            const amHost = lobby.hostId === socket.id;
            setPlayerRole(amHost ? 'host' : 'guest');
            setIsHost(amHost);
            isHostRef.current = amHost;
            setOpponentLeft(false);
            
            // Find opponent info if they exist
            const mySocketId = socket.id;
            const opponent = lobby.players.find(p => p.socketId !== mySocketId);
            setOpponentInfo(opponent || null);
        });

        socket.on('lobbyUpdated', (lobby) => {
            setCurrentLobby(lobby);
            const amHost = lobby.hostId === socket.id;
            setIsHost(amHost);
            isHostRef.current = amHost;
            setPlayerRole(amHost ? 'host' : 'guest');
            
            // Update opponent info
            const mySocketId = socket.id;
            const opponent = lobby.players.find(p => p.socketId !== mySocketId);
            setOpponentInfo(opponent || null);
        });

        socket.on('gameStart', (data) => {
            console.log('[Multiplayer] Game starting:', data);
            setGameStarted(true);
            if (onGameStartRef.current) {
                onGameStartRef.current({ ...data, isHost: isHostRef.current });
            }
        });

        // Full game state sync from server
        socket.on('gameStateSync', (gameState) => {
            console.log('[Multiplayer] Received game state sync (server-authoritative). isHost:', isHostRef.current);
            if (onGameStateSyncRef.current) {
                onGameStateSyncRef.current(gameState);
            }
        });

        socket.on('opponentLeft', (data) => {
            console.log('[Multiplayer] Opponent left:', data);
            setOpponentLeft(true);
            setOpponentInfo(null);
            if (onOpponentLeftRef.current) {
                onOpponentLeftRef.current(data);
            }
        });

        socket.on('gameEnded', (data) => {
            console.log('[Multiplayer] Game ended:', data);
            setGameStarted(false);
        });

        // Server-authoritative dice roll start (both clients receive same predetermined result)
        socket.on('diceRollStart', (payload) => {
            console.log('[Multiplayer] Received dice roll start:', payload);
            if (onDiceRollRef.current) {
                onDiceRollRef.current(payload);
            }
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [enabled, username]);

    // Create a new lobby
    const createLobby = useCallback((lobbyName, deckConfig = null) => {
        if (!socketRef.current?.connected) {
            console.warn('[Multiplayer] Cannot create lobby - not connected');
            return;
        }
        socketRef.current.emit('createLobby', { lobbyName, deckConfig });
    }, []);

    // Join an existing lobby
    const joinLobby = useCallback((lobbyId, deckConfig = null) => {
        if (!socketRef.current?.connected) {
            console.warn('[Multiplayer] Cannot join lobby - not connected');
            return;
        }
        socketRef.current.emit('joinLobby', { lobbyId, deckConfig });
    }, []);

    // Leave current lobby
    const leaveLobby = useCallback(() => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('leaveLobby');
        setCurrentLobby(null);
        setPlayerRole(null);
        setIsHost(false);
        isHostRef.current = false;
        setGameStarted(false);
        setOpponentInfo(null);
        setOpponentLeft(false);
    }, []);

    // Update deck configuration
    const updateDeck = useCallback((deckConfig) => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('updateDeck', deckConfig);
    }, []);

    // Set ready status
    const setReady = useCallback((isReady) => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('setReady', isReady);
    }, []);

    // ---------------------------------------------------------------------
    // Server-authoritative API
    // ---------------------------------------------------------------------

    // Sync full (or partial) game state to the server.
    // Server will merge and rebroadcast to all players in the lobby.
    const syncGameState = useCallback((gameState) => {
        if (!socketRef.current?.connected || !gameStarted) {
            console.log('[Multiplayer] Cannot sync state - not connected or game not started');
            return;
        }
        console.log('[Multiplayer] Syncing game state to server');
        socketRef.current.emit('syncGameState', gameState);
    }, [gameStarted]);

    // Send a logical game action to the server.
    // Server applies it via applyGameAction() and broadcasts updated state.
    const sendGameAction = useCallback((action) => {
        if (!socketRef.current?.connected || !gameStarted) {
            console.log('[Multiplayer] Cannot send game action - not connected or game not started');
            return;
        }
        console.log('[Multiplayer] Sending game action:', action?.type || action);
        socketRef.current.emit('gameAction', action);
    }, [gameStarted]);

    // Notify game over
    const sendGameOver = useCallback((data) => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('gameOver', data);
    }, []);

    // Refresh lobby list
    const refreshLobbies = useCallback(() => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('requestLobbyList');
    }, []);

    // Request a server-authoritative dice roll for the current lobby.
    // Server will broadcast a `diceRollStart` event to both players.
    const requestDiceRoll = useCallback(() => {
        if (!socketRef.current?.connected) return;
        socketRef.current.emit('requestDiceRoll');
    }, []);

    // Set event handlers
    const setOnGameStart = useCallback((handler) => {
        onGameStartRef.current = handler;
    }, []);

    const setOnGameStateSync = useCallback((handler) => {
        onGameStateSyncRef.current = handler;
    }, []);

    const setOnOpponentLeft = useCallback((handler) => {
        onOpponentLeftRef.current = handler;
    }, []);

    const setOnDiceRoll = useCallback((handler) => {
        onDiceRollRef.current = handler;
    }, []);

    return {
        // Connection state
        connected,
        connectionError,

        // Lobby state
        lobbies,
        currentLobby,
        playerRole,
        isHost,

        // Game state
        gameStarted,
        opponentInfo,
        opponentLeft,

        // Lobby actions
        createLobby,
        joinLobby,
        leaveLobby,
        updateDeck,
        setReady,
        refreshLobbies,
        requestDiceRoll,

        // Game actions / state sync
        syncGameState,
        sendGameAction,
        sendGameOver,

        // Event handlers
        setOnGameStart,
        setOnGameStateSync,
        setOnOpponentLeft,
        setOnDiceRoll,
    };
}

export default useMultiplayer;
