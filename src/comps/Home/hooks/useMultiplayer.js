/**
 * useMultiplayer.js
 * 
 * Custom hook for managing multiplayer game state and Socket.io communication.
 * 
 * SIMPLIFIED ARCHITECTURE:
 * - HOST is authoritative for ALL game state
 * - Both players see the game from HOST's perspective
 * - Host controls 'player' side (bottom), Guest controls 'opponent' side (top)
 * - Guest sends actions to host, host applies them and broadcasts
 * - No state transformation needed - simpler and less error-prone
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import _ from 'lodash';

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
    const onGuestActionRef = useRef(null); // Host receives guest actions
    
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

        // Full game state sync from host
        socket.on('gameStateSync', (gameState) => {
            console.log('[Multiplayer] Received game state sync, isHost:', isHostRef.current);
            if (onGameStateSyncRef.current) {
                // Guest receives state directly (no transformation - both see host's view)
                // Host ignores their own broadcasts
                if (!isHostRef.current) {
                    console.log('[Multiplayer] Guest applying synced state');
                    onGameStateSyncRef.current(gameState);
                }
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

        // Host receives guest actions
        socket.on('guestAction', (action) => {
            console.log('[Multiplayer] Received guest action:', action);
            if (isHostRef.current && onGuestActionRef.current) {
                onGuestActionRef.current(action);
            }
        });

        socket.on('gameEnded', (data) => {
            console.log('[Multiplayer] Game ended:', data);
            setGameStarted(false);
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

    // Broadcast full game state (HOST ONLY)
    // This is the main sync mechanism - host sends state after every change
    const broadcastGameState = useCallback((gameState) => {
        if (!socketRef.current?.connected || !gameStarted) {
            console.log('[Multiplayer] Cannot broadcast - not connected or game not started');
            return;
        }
        if (!isHostRef.current) {
            console.log('[Multiplayer] Not host, skipping broadcast');
            return;
        }
        console.log('[Multiplayer] Broadcasting game state');
        socketRef.current.emit('syncGameState', gameState);
    }, [gameStarted]);

    // Send action to host (GUEST ONLY)
    // Guest sends their actions to host, who then applies them and broadcasts
    const sendGuestAction = useCallback((action) => {
        if (!socketRef.current?.connected || !gameStarted) {
            console.log('[Multiplayer] Cannot send guest action - not connected or game not started');
            return;
        }
        if (isHostRef.current) {
            console.log('[Multiplayer] Host should not use sendGuestAction');
            return;
        }
        console.log('[Multiplayer] Sending guest action:', action);
        socketRef.current.emit('guestAction', action);
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

    // Set handler for receiving guest actions (HOST ONLY)
    const setOnGuestAction = useCallback((handler) => {
        onGuestActionRef.current = handler;
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

        // Game actions (HOST broadcasts state, GUEST receives)
        broadcastGameState,
        sendGuestAction,
        sendGameOver,

        // Event handlers
        setOnGameStart,
        setOnGameStateSync,
        setOnOpponentLeft,
        setOnGuestAction,
    };
}

export default useMultiplayer;
