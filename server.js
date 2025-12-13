// In-memory lobby storage (could move to MongoDB for persistence)
const lobbies = new Map();
const playerToLobby = new Map(); // socketId -> lobbyId
const playerInfo = new Map(); // socketId -> { username, lobbyId, playerRole }

// ============================================================================
 // SERVER-AUTHORITATIVE MULTIPLAYER GAME STATE
// ============================================================================
 
// Canonical game state per lobbyId
// NOTE: Stored separately from `lobbies` to keep the lobby list lightweight.
const games = new Map();

const DEFAULT_DEMO_DECK_ITEMS = [
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

function expandDeckItems(items) {
    const ids = [];
    for (const it of (items || [])) {
        const id = String(it?.id || '');
        const count = Math.max(0, Math.min(50, Number(it?.count) || 0));
        if (!id || count <= 0) continue;
        for (let i = 0; i < count; i++) ids.push(id);
    }
    return ids;
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawFromDeck(player, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const cardId = player.deckIds.pop();
        if (!cardId) break;
        out.push(cardId);
    }
    return out;
}

async function loadDeckIdsForPlayer(username, deckConfig) {
    try {
        const deckName = deckConfig?.name;
        if (deckName && username) {
            const [deck] = await mongoRead('opsim', 'decks', { username, name: deckName });
            if (deck?.items) {
                const ids = expandDeckItems(deck.items);
                // Ensure we have a usable deck size; pad if needed.
                while (ids.length < 50 && ids.length > 0) ids.push(ids[0]);
                return shuffleInPlace(ids);
            }
        }
    } catch (e) {
        console.warn('[Multiplayer] Failed to load deck from DB, falling back to demo deck:', e?.message || e);
    }

    const demo = expandDeckItems(DEFAULT_DEMO_DECK_ITEMS);
    while (demo.length < 50 && demo.length > 0) demo.push(demo[0]);
    return shuffleInPlace(demo);
}

function buildViewStateForSocket(lobbyId, socketId) {
    const game = games.get(lobbyId);
    if (!game) return null;

    const meIndex = game.players.findIndex(p => p.socketId === socketId);
    if (meIndex === -1) return null;

    const oppIndex = meIndex === 0 ? 1 : 0;
    const me = game.players[meIndex];
    const opp = game.players[oppIndex];

    const isMyTurn = game.turn.currentPlayerIndex === meIndex;
    const turnSide = isMyTurn ? 'player' : 'opponent';

    // Perspective-swapped dice result: "player" always means "me" in the client view.
    let diceResult = null;
    if (game.setup?.dice) {
        const myRoll = game.setup.dice.rollsByIndex?.[meIndex];
        const oppRoll = game.setup.dice.rollsByIndex?.[oppIndex];
        const iGoFirst = game.setup.dice.firstPlayerIndex === meIndex;
        diceResult = {
            playerRoll: myRoll,
            opponentRoll: oppRoll,
            firstPlayer: iGoFirst ? 'player' : 'opponent',
            revealAt: game.setup.dice.revealAt
        };
    }

    // Zones: only the player hand is face-up; opponent hand is hidden with a count.
    const view = {
        setupPhase: game.setup.phase,
        diceResult,
        openingHand: {
            confirmed: !!game.setup.handConfirmedBySocketId?.[socketId]
        },
        turn: {
            turnNumber: game.turn.turnNumber,
            phase: game.turn.phase,
            isMyTurn,
            turnSide
        },
        zones: {
            player: {
                deckCount: me.deckIds.length,
                handIds: me.handIds.slice(),
                handCount: me.handIds.length,
                lifeCount: me.lifeIds.length,
                donCount: me.donCount || 0
            },
            opponent: {
                deckCount: opp.deckIds.length,
                handCount: opp.handIds.length,
                lifeCount: opp.lifeIds.length,
                donCount: opp.donCount || 0
            }
        }
    };

    return view;
}

function emitViewStateToLobby(lobbyId) {
    const lobby = lobbies.get(lobbyId);
    const game = games.get(lobbyId);
    if (!lobby || !game) return;

    for (const p of game.players) {
        const view = buildViewStateForSocket(lobbyId, p.socketId);
        if (view) {
            io.to(p.socketId).emit('gameStateSync', view);
        }
    }
}

// ... Existing functions unchanged: rollDiceNoTie, rollDiceNoTieCrypto, applyGameAction, mergeBattleState, mergeGameStateFromClient, buildConcealedStateForRole, emitGameStateToLobby, generateLobbyId, getLobbyList, broadcastLobbyList ...
// We'll keep original implementations for those functions intact (they are in the original server.js). For brevity below, the original functions remain as they were; we only add persistence wrappers and command processor wiring.

// ============================================================================
// PERSISTENCE HELPERS FOR COMMAND PROCESSOR
// ============================================================================

// These wrappers use your existing mongoRead/mongoWrite/mongoUpdate helpers and the in-memory `games` map.
async function getGameSnapshotFromStore(lobbyId) {
    // Prefer in-memory games map if present
    const mem = games.get(lobbyId);
    if (mem && mem.gameState) {
        return { state: mem.gameState, players: lobbies.get(lobbyId)?.players || [] };
    }
    // fallback to DB
    try {
        // games collection stores { lobbyId, state }
        const rows = await mongoRead('opsim', 'games', { lobbyId });
        if (Array.isArray(rows) && rows.length > 0) {
            const doc = rows[0];
            games.set(lobbyId, { gameState: doc.state || {}, version: doc.state?.version || 0 });
            return { state: doc.state || {}, players: lobbies.get(lobbyId)?.players || [] };
        }
    } catch (e) {
        console.error('[CommandProcessor] getGameSnapshotFromStore db error', e);
    }
    // If no snapshot, create an initial one from lobby players if present
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
        const initialState = {
            players: (lobby.players || []).map((p) => ({
                socketId: p.socketId,
                username: p.username,
                deckIds: [], // will be filled by loadDeckIdsForPlayer on game start
                handIds: [],
                lifeIds: [],
                donCount: 0
            })),
            setup: {},
            turn: {}
        };
        return { state: initialState, players: lobby.players || [] };
    }
    return null;
}

async function saveGameSnapshotToStore(lobbyId, newState) {
    try {
        await mongoUpdate('opsim', 'games', { lobbyId }, { $set: { state: newState } }, { upsert: true });
        games.set(lobbyId, { gameState: newState, version: newState.version || 0 });
    } catch (e) {
        console.error('[CommandProcessor] saveGameSnapshotToStore error', e);
        throw e;
    }
}

async function appendGameEventToStore(lobbyId, event) {
    try {
        const ev = { ...event, lobbyId };
        await mongoWrite('opsim', 'gameEvents', ev);
    } catch (e) {
        console.error('[CommandProcessor] appendGameEventToStore error', e);
        throw e;
    }
}

async function findEventByCommandIdFromStore(lobbyId, commandId) {
    try {
        const docs = await mongoRead('opsim', 'gameEvents', { lobbyId, commandId });
        return Array.isArray(docs) && docs.length > 0 ? docs[0] : null;
    } catch (e) {
        console.error('[CommandProcessor] findEventByCommandIdFromStore error', e);
        return null;
    }
}

// Instantiate command processor with dependencies
const commandProcessor = createCommandProcessor({
    io,
    getGameSnapshot: getGameSnapshotFromStore,
    saveGameSnapshot: saveGameSnapshotToStore,
    appendGameEvent: appendGameEventToStore,
    findEventByCommandId: findEventByCommandIdFromStore,
    engine,
    concealStateForRole,
    lobbies,
    games,
    logger: console,
    cardBackUrl: CARD_BACK_URL
});

// ============================================================================
// SOCKET.IO HANDLERS
// ============================================================================

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Set username for this socket
    socket.on('setUsername', (username) => {
        playerInfo.set(socket.id, { username, lobbyId: null, playerRole: null });
        console.log(`[Socket] ${socket.id} set username: ${username}`);
    });

    // Request current lobby list
    socket.on('requestLobbyList', () => {
        socket.emit('lobbyList', getLobbyList());
    });

    // Create a new lobby
    socket.on('createLobby', (data) => {
        const { lobbyName, deckConfig } = data;
        const info = playerInfo.get(socket.id);
        if (!info?.username) {
            socket.emit('error', { message: 'Must be logged in to create a lobby' });
            return;
        }

        // Leave current lobby if in one
        const currentLobbyId = playerToLobby.get(socket.id);
        if (currentLobbyId) {
            leaveLobby(socket, currentLobbyId);
        }

        const lobbyId = generateLobbyId();
        const lobby = {
            id: lobbyId,
            name: lobbyName || `${info.username}'s Lobby`,
            hostId: socket.id,
            hostName: info.username,
            players: [{
                socketId: socket.id,
                username: info.username,
                role: 'player', // 'player' = bottom of board
                ready: false,
                deckConfig: deckConfig || null
            }],
            status: 'waiting',
            gameState: null,
            createdAt: Date.now()
        };

        lobbies.set(lobbyId, lobby);
        playerToLobby.set(socket.id, lobbyId);
        info.lobbyId = lobbyId;
        info.playerRole = 'player';
        playerInfo.set(socket.id, info);

        socket.join(lobbyId);
        socket.emit('lobbyJoined', { lobby, role: 'player' });
        broadcastLobbyList();
        console.log(`[Lobby] Created: ${lobbyId} by ${info.username}`);
    });

    // Join an existing lobby
    socket.on('joinLobby', (data) => {
        const { lobbyId, deckConfig } = data;
        const info = playerInfo.get(socket.id);
        if (!info?.username) {
            socket.emit('error', { message: 'Must be logged in to join a lobby' });
            return;
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            socket.emit('error', { message: 'Lobby not found' });
            return;
        }

        if (lobby.players.length >= 2) {
            socket.emit('error', { message: 'Lobby is full' });
            return;
        }

        if (lobby.status !== 'waiting') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        // Leave current lobby if in one
        const currentLobbyId = playerToLobby.get(socket.id);
        if (currentLobbyId && currentLobbyId !== lobbyId) {
            leaveLobby(socket, currentLobbyId);
        }

        // Add player as opponent (top of board)
        lobby.players.push({
            socketId: socket.id,
            username: info.username,
            role: 'opponent', // 'opponent' = top of board
            ready: false,
            deckConfig: deckConfig || null
        });

        playerToLobby.set(socket.id, lobbyId);
        info.lobbyId = lobbyId;
        info.playerRole = 'opponent';
        playerInfo.set(socket.id, info);

        socket.join(lobbyId);
        
        // Update status if lobby is now full
        if (lobby.players.length === 2) {
            lobby.status = 'ready';
        }

        socket.emit('lobbyJoined', { lobby, role: 'opponent' });
        io.to(lobbyId).emit('lobbyUpdated', lobby);
        broadcastLobbyList();
        console.log(`[Lobby] ${info.username} joined ${lobbyId}`);
    });

    // Update deck configuration
    socket.on('updateDeck', (deckConfig) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        const player = lobby.players.find(p => p.socketId === socket.id);
        if (player) {
            player.deckConfig = deckConfig;
            io.to(lobbyId).emit('lobbyUpdated', lobby);
        }
    });

    // Set ready status
    socket.on('setReady', (isReady) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        const player = lobby.players.find(p => p.socketId === socket.id);
        if (player) {
            player.ready = isReady;
            io.to(lobbyId).emit('lobbyUpdated', lobby);

            // Check if both players are ready
            if (lobby.players.length === 2 && lobby.players.every(p => p.ready)) {
                lobby.status = 'playing';
                io.to(lobbyId).emit('gameStart', {
                    lobby,
                    players: lobby.players.map(p => ({
                        username: p.username,
                        role: p.role,
                        deckConfig: p.deckConfig
                    }))
                });
                broadcastLobbyList();
                console.log(`[Lobby] Game starting in ${lobbyId}`);
            }
        }
    });

    // Server-authoritative dice roll for setup.
    // Either player may request; server will roll once per lobby and broadcast the same
    // predetermined result + synchronized schedule to both players.
    socket.on('requestDiceRoll', () => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;
        if (!Array.isArray(lobby.players) || lobby.players.length !== 2) return;

        lobby.setup = lobby.setup || {};

        // If we've already rolled for this lobby, just rebroadcast it.
        if (lobby.setup.diceRoll && typeof lobby.setup.diceRoll === 'object') {
            io.to(lobbyId).emit('diceRollStart', lobby.setup.diceRoll);
            return;
        }

        // Canonical mapping: host is "player"; guest is "opponent".
        const [pRoll, oRoll] = rollDiceNoTieCrypto();
        const firstPlayer = pRoll > oRoll ? 'player' : 'opponent';

        // Schedule: start a tiny bit in the future so both clients can begin together.
        const startAt = Date.now() + 350;
        const revealAt = startAt + 2000;

        const payload = {
            playerRoll: pRoll,
            opponentRoll: oRoll,
            firstPlayer,
            startAt,
            revealAt
        };

        lobby.setup.diceRoll = payload;
        io.to(lobbyId).emit('diceRollStart', payload);
    });

    // Leave lobby
    socket.on('leaveLobby', () => {
        const lobbyId = playerToLobby.get(socket.id);
        if (lobbyId) {
            leaveLobby(socket, lobbyId);
        }
    });

    // Game action from any player (legacy)
    socket.on('gameAction', (action) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;

        const info = playerInfo.get(socket.id);
        console.log(`[Lobby] Relaying gameAction from ${info?.username}:`, action?.type || action);

        // Send to the other player(s) in the lobby (do not echo back).
        socket.to(lobbyId).emit('gameAction', action);
    });

    // NEW: Accept authoritative commands from client to run via server command processor
    socket.on('command', (command) => {
        // Ensure we know the origin socket for command processing
        command.clientSocketId = socket.id;
        try {
            commandProcessor.handleCommand(command, { socket }).catch((err) => {
                console.error('[Command] processing error', err);
            });
        } catch (err) {
            console.error('[Command] immediate handler error', err);
            socket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Server error' });
        }
    });

    // Full game state sync from any player (legacy)
    socket.on('syncGameState', (gameState) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        const info = playerInfo.get(socket.id);
        console.log(`[Lobby] Player ${info?.username} syncing game state`);

        // Merge incoming state, but only accept the side the sender controls.
        // This prevents overwriting the other player's private zones.
        mergeGameStateFromClient(lobby, gameState, info?.playerRole);

        // Broadcast to ALL clients in the lobby (with concealment)
        emitGameStateToLobby(io, lobby);
        console.log(`[Lobby] Game state synced to lobby ${lobbyId}`);
    });

    // End turn notification (legacy)
    socket.on('endTurn', (data) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;

        socket.to(lobbyId).emit('endTurn', data);
    });

    // Game over - server broadcasts to all
    socket.on('gameOver', (data) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        const info = playerInfo.get(socket.id);
        console.log(`[Lobby] Game over in ${lobbyId} (initiated by ${info?.username})`);

        lobby.status = 'finished';
        
        // Broadcast to ALL players in lobby
        io.to(lobbyId).emit('gameEnded', {
            ...data,
            initiatedBy: info?.username
        });
        
        broadcastLobbyList();
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        const lobbyId = playerToLobby.get(socket.id);
        if (lobbyId) {
            leaveLobby(socket, lobbyId, true);
        }
        playerInfo.delete(socket.id);
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

// --- Helper: Leave a lobby (original implementation unchanged) ---
function leaveLobby(socket, lobbyId, disconnected = false) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    const info = playerInfo.get(socket.id);
    const leavingPlayer = lobby.players.find(p => p.socketId === socket.id);
    
    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
    playerToLobby.delete(socket.id);
    
    if (info) {
        info.lobbyId = null;
        info.playerRole = null;
        playerInfo.set(socket.id, info);
    }

    socket.leave(lobbyId);

    if (lobby.players.length === 0) {
        // Delete empty lobby
        lobbies.delete(lobbyId);
        console.log(`[Lobby] Deleted empty lobby: ${lobbyId}`);
    } else {
        // If host left, transfer host to remaining player
        if (lobby.hostId === socket.id) {
            const newHost = lobby.players[0];
            lobby.hostId = newHost.socketId;
            lobby.hostName = newHost.username;
        }
        
        // Reset status if game was in progress or ready
        if (lobby.status === 'playing') {
            // Notify remaining player that opponent left
            io.to(lobbyId).emit('opponentLeft', {
                username: leavingPlayer?.username || 'Unknown',
                disconnected
            });
        }
        
        lobby.status = 'waiting';
        io.to(lobbyId).emit('lobbyUpdated', lobby);
    }

    broadcastLobbyList();
    console.log(`[Lobby] Player left ${lobbyId}, ${lobby.players.length} remaining`);
}

// API endpoint to get lobbies (alternative to socket for initial load)
app.get('/api/lobbies', (req, res) => {
    res.json({ lobbies: getLobbyList() });
});

server.listen(PORT, () => {
    console.log(`One Piece TCG Sim server running on port ${PORT}`);
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    mongoClient.close().then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});
