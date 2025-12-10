import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';
import MongoStore from 'connect-mongo';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:5583'],
        credentials: true
    }
});
const PORT = 5583;

// Parsers
app.use(bodyParser.json({ limit: '50gb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Mongo client with auto-retry connect
const mongoClient = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
async function connectWithRetry(delay = 5000) {
    let attempt = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            console.log(`Attempt ${attempt} to connect to MongoDB...`);
            await mongoClient.connect();
            console.log('MongoDB Connected');
            break;
        } catch (err) {
            console.error(`MongoDB connection error (attempt ${attempt}):`, err?.message || err);
            await new Promise((r) => setTimeout(r, delay));
            attempt++;
        }
    }
}
await connectWithRetry();

// Sessions stored in Mongo
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'change-me',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 days
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URL,
            dbName: 'opsim_sessions',
            ttl: 60 * 60 * 24 * 30,
        }),
    })
);

function isAuthenticated(req, res, next) {
    if (req.session?.user?.username) return next();
    return res.status(401).json({ message: 'Unauthorized' });
}

// --- Resolve cards root directory robustly ---
function resolveCardsRoot() {
    const candidates = [];
    if (process.env.CARDS_DIR) candidates.push(process.env.CARDS_DIR);
    candidates.push(path.join(__dirname, 'public', 'cards'));
    candidates.push(path.join(process.cwd(), 'public', 'cards'));
    // Add a common deployment sibling pattern if server is run from dist/server
    candidates.push(path.join(__dirname, '..', 'public', 'cards'));
    for (const dir of candidates) {
        try {
            if (fs.existsSync(dir)) return dir;
        } catch {}
    }
    return candidates[0];
}
const CARDS_ROOT = resolveCardsRoot();
console.log('[Startup] Cards root resolved to:', CARDS_ROOT);

// --- Auth APIs ---
app.get('/api/checkLoginStatus', async (req, res) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ isLoggedIn: false });
    try {
        const [dbUser] = await mongoRead('opsim', 'users', { comparisonUsername: user.username.toLowerCase() });
        const settings = dbUser?.settings || { theme: 'light' };
        return res.json({ isLoggedIn: true, username: user.username, settings });
    } catch {
        return res.json({ isLoggedIn: true, username: user.username, settings: { theme: 'light' } });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, passwordConfirm } = req.body;
        if (!username || !password || !passwordConfirm) return res.status(400).json({ error: 'Missing fields' });
        if (password !== passwordConfirm) return res.status(400).json({ error: 'Passwords do not match' });
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Invalid username' });
        if (password.length < 8 || password.length > 64) return res.status(400).json({ error: 'Invalid password length' });

        const comparisonUsername = username.toLowerCase();
        const existing = await mongoRead('opsim', 'users', { comparisonUsername });
        if (existing.length) return res.status(409).json({ error: 'Username already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userDoc = {
            username,
            comparisonUsername,
            password: hashedPassword,
            registered: Date.now(),
            settings: { theme: 'light' },
        };
        await mongoWrite('opsim', 'users', userDoc);
        req.session.user = { username };
        res.json({ message: 'Registered', username, settings: userDoc.settings });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
        const comparisonUsername = username.toLowerCase();
        const users = await mongoRead('opsim', 'users', { comparisonUsername });
        if (!users.length) return res.status(401).json({ error: 'Invalid credentials' });
        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.user = { username: user.username };
        res.json({ message: 'Login successful', username: user.username, settings: user.settings || { theme: 'light' } });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: 'Failed to logout' });
        res.status(200).json({ message: 'Logged out' });
    });
});

// --- Card assets APIs ---
// Serve static card image assets under /api namespace (frontend will use /api/cards/assets/...)
app.use('/api/cards/assets', (req, res, next) => {
    if (!fs.existsSync(CARDS_ROOT)) {
        console.warn('[cards/assets] Cards root not found:', CARDS_ROOT);
        return res.status(404).end();
    }
    return express.static(CARDS_ROOT)(req, res, next);
});

// List all cards recursively across all subdirectories in public/cards (must come BEFORE param route)
function handleListAllCards(req, res) {
    try {
        const root = CARDS_ROOT;
        if (!fs.existsSync(root)) {
            console.warn('[cards/all] Cards directory not found at', root);
            return res.status(404).json({ error: 'Cards directory not found' });
        }

        const walk = (dir) => {
            const out = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const fullPath = path.join(dir, e.name);
                if (e.isDirectory()) {
                    out.push(...walk(fullPath));
                } else {
                    out.push(fullPath);
                }
            }
            return out;
        };
        const all = walk(root).map(p => p.replace(root, '').replace(/\\/g, '/')); // relative
        const set = new Set(all);
        const cards = [];
        for (const rel of all) {
            const name = rel.split('/').pop() || '';
            const dirRel = rel.slice(0, rel.length - name.length);
            if (/(_small)\.(jpg|png)$/i.test(name)) {
                const base = name.replace(/_small\.(jpg|png)$/i, '');
                const png = dirRel + base + '.png';
                const jpg = dirRel + base + '.jpg';
                const fullRel = set.has(png) ? png : (set.has(jpg) ? jpg : null);
                if (fullRel) {
                    cards.push({
                        id: base,
                        number: null,
                        full: `/api/cards/assets${fullRel}`,
                        thumb: `/api/cards/assets${dirRel + name}`,
                    });
                }
            } else if (/\.(png|jpg)$/i.test(name) && !/_small\./i.test(name)) {
                const base = name.replace(/\.(png|jpg)$/i, '');
                const thumbJpg = dirRel + base + '_small.jpg';
                const thumbPng = dirRel + base + '_small.png';
                const thumbRel = set.has(thumbJpg) ? thumbJpg : (set.has(thumbPng) ? thumbPng : null);
                cards.push({
                    id: base,
                    number: null,
                    full: `/api/cards/assets${rel}`,
                    thumb: thumbRel ? `/api/cards/assets${thumbRel}` : `/api/cards/assets${rel}`,
                });
            }
        }
        const uniqueMap = new Map();
        for (const c of cards) uniqueMap.set(c.full, c);
        const uniqueCards = Array.from(uniqueMap.values());
        return res.json({ count: uniqueCards.length, cards: uniqueCards });
    } catch (e) {
        console.error('cards all error:', e);
        return res.status(500).json({ error: 'Failed to list all cards' });
    }
}
app.get('/api/cards/all', handleListAllCards);
// Provide alias outside of /api/cards/* path to avoid proxy static collisions
app.get('/api/cardsAll', handleListAllCards);
// List available card set directories under public/cards
app.get('/api/cardSets', (req, res) => {
    try {
        const cardsRoot = CARDS_ROOT;
        if (!fs.existsSync(cardsRoot)) return res.status(404).json({ error: 'Cards directory not found' });
        const entries = fs.readdirSync(cardsRoot, { withFileTypes: true });
        const sets = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
        return res.json({ sets });
    } catch (e) {
        console.error('cardSets error:', e);
        return res.status(500).json({ error: 'Failed to list card sets' });
    }
});

// Serve aggregated live card JSON from filesystem to reflect edits without rebuild
app.get('/api/cards/data', (req, res) => {
    try {
        const jsonRoot = path.join(__dirname, 'src', 'data', 'cards');
        if (!fs.existsSync(jsonRoot)) return res.status(404).json({ error: 'Card data directory not found' });

        const walk = (dir) => {
            const out = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) out.push(...walk(full));
                else if (e.isFile() && e.name.endsWith('.json')) out.push(full);
            }
            return out;
        };

        const files = walk(jsonRoot);
        const cards = [];
        for (const f of files) {
            try {
                const buf = fs.readFileSync(f, 'utf8');
                const obj = JSON.parse(buf);
                const cardId = obj?.cardId || obj?.id;
                if (!cardId) {
                    console.warn('Card JSON missing cardId/id, skipping:', f);
                    continue;
                }

                // Normalize to have both cardId and id populated so clients can key reliably
                if (!obj.id) obj.id = cardId;
                if (!obj.cardId) obj.cardId = cardId;

                cards.push(obj);
            } catch (e) {
                console.warn('Failed to parse card JSON:', f, e?.message || e);
            }
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        return res.json({ count: cards.length, cards });
    } catch (e) {
        console.error('cards data error:', e);
        return res.status(500).json({ error: 'Failed to load card data' });
    }
});

// List cards within a specific set, pairing full image with its thumbnail if present
app.get('/api/cards/:set', (req, res) => {
    try {
        const set = req.params.set;
        const setDir = path.join(CARDS_ROOT, set);
        if (!/^[A-Za-z0-9_-]+$/.test(set)) return res.status(400).json({ error: 'Invalid set' });
        if (!fs.existsSync(setDir)) return res.status(404).json({ error: 'Set not found' });
        const files = fs.readdirSync(setDir);
        // Collect only PNG full-size files; derive thumb names by convention *_small.jpg
        const fullPngs = files.filter((f) => f.endsWith('.png'));
        const cards = fullPngs.map((file) => {
            const base = file.replace('.png', '');
            const thumbName = `${base}_small.jpg`;
            const hasThumb = files.includes(thumbName);
            // id attempts to extract trailing number sequence
            const idMatch = base.match(/(\d{3})$/);
            const numericId = idMatch ? parseInt(idMatch[1], 10) : null;
            return {
                id: base,
                number: numericId,
                full: `/api/cards/assets/${set}/${file}`,
                thumb: hasThumb ? `/api/cards/assets/${set}/${thumbName}` : `/api/cards/assets/${set}/${file}`,
            };
        }).sort((a, b) => {
            if (a.number != null && b.number != null) return a.number - b.number;
            return a.id.localeCompare(b.id);
        });
        return res.json({ set, count: cards.length, cards });
    } catch (e) {
        console.error('cards listing error:', e);
        return res.status(500).json({ error: 'Failed to list cards' });
    }
});

// Save updated card JSON (for human verification/editing)
app.post('/api/cards/save', isAuthenticated, async (req, res) => {
    try {
        const { cardId, cardData } = req.body;
        if (!cardId || typeof cardId !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid cardId' });
        }
        if (!cardData || typeof cardData !== 'object') {
            return res.status(400).json({ error: 'Missing or invalid cardData' });
        }

        // Extract set from cardId (e.g., "EB01-001" -> "EB01")
        const setMatch = cardId.match(/^([A-Za-z0-9]+)-/);
        if (!setMatch) {
            return res.status(400).json({ error: 'Invalid card ID format' });
        }
        const setName = setMatch[1];
        
        // Construct file path to card JSON
        const jsonDir = path.join(__dirname, 'src', 'data', 'cards', setName);
        const jsonPath = path.join(jsonDir, `${cardId}.json`);

        // Verify the file exists
        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({ error: 'Card JSON file not found' });
        }

        // Write the updated JSON with pretty formatting
        fs.writeFileSync(jsonPath, JSON.stringify(cardData, null, 2), 'utf8');

        console.log(`[Card Edit] Saved ${cardId} by ${req.session.user.username}`);
        res.json({ message: 'Card saved successfully', cardId });
    } catch (e) {
        console.error('save card error:', e);
        res.status(500).json({ error: 'Failed to save card data' });
    }
});

// Serve aggregated live card JSON from filesystem to reflect edits without rebuild
// (moved /api/cards/data above /api/cards/:set to avoid param-route capture)


// --- Deck APIs ---
// List current user's decks
app.get('/api/decks', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const decks = await mongoRead('opsim', 'decks', { username });
        const out = decks.map(d => ({ name: d.name, updatedAt: d.updatedAt, size: d.size, leaderId: d.leaderId }));
        res.json({ decks: out });
    } catch (e) {
        console.error('list decks error:', e);
        res.status(500).json({ error: 'Failed to list decks' });
    }
});

// Get a deck by name
app.get('/api/decks/:name', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const name = String(req.params.name || '').slice(0, 120);
        const [deck] = await mongoRead('opsim', 'decks', { username, name });
        if (!deck) return res.status(404).json({ error: 'Deck not found' });
        res.json({
            name: deck.name,
            leaderId: deck.leaderId,
            items: deck.items,
            text: deck.text,
            updatedAt: deck.updatedAt,
        });
    } catch (e) {
        console.error('get deck error:', e);
        res.status(500).json({ error: 'Failed to get deck' });
    }
});

// Save or update a deck
app.post('/api/decks/save', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const { name, leaderId, items, text } = req.body || {};
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing deck name' });
        if (!leaderId || typeof leaderId !== 'string') return res.status(400).json({ error: 'Missing leaderId' });
        if (!Array.isArray(items)) return res.status(400).json({ error: 'Missing items' });
        const cleanName = name.trim().slice(0, 80);
        const size = items.reduce((a, b) => a + (b?.count || 0), 0);
        const doc = {
            username,
            name: cleanName,
            leaderId,
            items: items.map(i => ({ id: String(i.id), count: Math.max(1, Math.min(4, Number(i.count) || 1)) })),
            text: typeof text === 'string' ? text : null,
            size,
            updatedAt: Date.now(),
        };
        await mongoUpdate('opsim', 'decks', { username, name: cleanName }, { $set: doc, $setOnInsert: { createdAt: Date.now() } , }, { upsert: true });
        res.json({ message: 'Saved', name: cleanName, size });
    } catch (e) {
        console.error('save deck error:', e);
        res.status(500).json({ error: 'Failed to save deck' });
    }
});

// Delete a deck by name
app.delete('/api/decks/:name', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const name = String(req.params.name || '').slice(0, 120);
        const result = await mongoDelete('opsim', 'decks', { username, name });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Deck not found' });
        res.json({ message: 'Deleted', name });
    } catch (e) {
        console.error('delete deck error:', e);
        res.status(500).json({ error: 'Failed to delete deck' });
    }
});

// --- DB helpers ---
async function mongoWrite(db, collection, data) {
    return mongoClient.db(db).collection(collection).insertOne(data);
}
async function mongoRead(db, collection, filter) {
    return mongoClient.db(db).collection(collection).find(filter).toArray();
}
async function mongoUpdate(db, collection, filter, update, options = undefined) {
    return mongoClient.db(db).collection(collection).updateOne(filter, update, options);
}
async function mongoDelete(db, collection, filter) {
    return mongoClient.db(db).collection(collection).deleteOne(filter);
}

// ============================================================================
// MULTIPLAYER LOBBY SYSTEM (Socket.io)
// ============================================================================

// In-memory lobby storage (could move to MongoDB for persistence)
const lobbies = new Map();
const playerToLobby = new Map(); // socketId -> lobbyId
const playerInfo = new Map(); // socketId -> { username, lobbyId, playerRole }

// Generate unique lobby ID
function generateLobbyId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Get lobby list for clients
function getLobbyList() {
    const list = [];
    for (const [id, lobby] of lobbies) {
        list.push({
            id,
            name: lobby.name,
            hostName: lobby.hostName,
            playerCount: lobby.players.length,
            maxPlayers: 2,
            status: lobby.status, // 'waiting', 'ready', 'playing'
            createdAt: lobby.createdAt
        });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
}

// Broadcast lobby list to all connected clients
function broadcastLobbyList() {
    io.emit('lobbyList', getLobbyList());
}

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

    // Leave lobby
    socket.on('leaveLobby', () => {
        const lobbyId = playerToLobby.get(socket.id);
        if (lobbyId) {
            leaveLobby(socket, lobbyId);
        }
    });

    // Game state synchronization
    socket.on('gameAction', (action) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;

        const info = playerInfo.get(socket.id);
        
        // Broadcast the action to the other player
        socket.to(lobbyId).emit('opponentAction', {
            ...action,
            from: info?.playerRole || 'unknown'
        });
    });

    // Full game state sync (HOST ONLY - for reconnection or state updates)
    // Only accept syncGameState from the host to prevent state manipulation
    socket.on('syncGameState', (gameState) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        // SECURITY: Only the host can sync game state
        if (socket.id !== lobby.hostId) {
            console.log(`[Lobby] Rejected syncGameState from non-host: ${socket.id}`);
            return;
        }

        // Store the canonical game state on the server
        lobby.gameState = gameState;
        
        // Broadcast to ALL clients in the lobby (including host for consistency)
        // This ensures both players receive the same event with the same state
        io.to(lobbyId).emit('gameStateSync', gameState);
        console.log(`[Lobby] Game state synced to lobby ${lobbyId}`);
    });

    // Guest sends action to host
    socket.on('guestAction', (action) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;

        // Only non-hosts (guests) can send guest actions
        const info = playerInfo.get(socket.id);
        if (!info) return;

        // Forward to the host
        const hostSocket = lobby.hostId;
        if (hostSocket && hostSocket !== socket.id) {
            io.to(hostSocket).emit('guestAction', {
                ...action,
                from: info.username
            });
        }
    });

    // End turn notification
    socket.on('endTurn', (data) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'playing') return;

        const info = playerInfo.get(socket.id);
        
        // Notify opponent that turn has ended
        socket.to(lobbyId).emit('turnEnded', {
            ...data,
            from: info?.playerRole || 'unknown'
        });
    });

    // Game over
    socket.on('gameOver', (data) => {
        const lobbyId = playerToLobby.get(socket.id);
        if (!lobbyId) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        lobby.status = 'finished';
        io.to(lobbyId).emit('gameEnded', data);
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

// Helper: Leave a lobby
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
