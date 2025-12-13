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
import crypto from 'crypto';

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

// Card back asset used when sending concealed zones to the opponent.
// Keep in sync with client constant in Home.jsx.
const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';

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

function rollDiceNoTie() {
    let a = 0;
    let b = 0;
    while (a === b) {
        a = Math.floor(Math.random() * 6) + 1;
        b = Math.floor(Math.random() * 6) + 1;
    }
    return [a, b];
}

function rollDiceNoTieCrypto() {
    let a = 0;
    let b = 0;
    while (a === b) {
        a = crypto.randomInt(1, 7);
        b = crypto.randomInt(1, 7);
    }
    return [a, b];
}

// Helper function to apply game actions on server
async function applyGameAction(lobbyId, action, socketId) {
    const game = games.get(lobbyId);
    if (!game) return;
    const { type, payload } = action || {};

    const actorIndex = game.players.findIndex(p => p.socketId === socketId);
    if (actorIndex === -1) return;

    const isMyTurn = game.turn.currentPlayerIndex === actorIndex;

    switch (type) {
        case 'SETUP_READY': {
            // Mark player ready; when both ready, roll dice and deal hands.
            game.setup.readyBySocketId[socketId] = true;
            const bothReady = game.players.every(p => game.setup.readyBySocketId[p.socketId]);
            if (!bothReady) break;

            // Roll dice on server and send revealAt for synced animation.
            const [r0, r1] = rollDiceNoTie();
            const firstPlayerIndex = r0 > r1 ? 0 : 1;
            const revealAt = Date.now() + 600;

            game.setup.dice = {
                rollsByIndex: [r0, r1],
                firstPlayerIndex,
                revealAt
            };

            // Deal opening hands + life now (canonical). Confirmation is separate.
            for (const p of game.players) {
                p.handIds = [];
                p.lifeIds = [];
                const hand = drawFromDeck(p, 5);
                const life = drawFromDeck(p, 5);
                p.handIds = hand;
                p.lifeIds = life;
            }

            // Setup phase progresses to hands.
            game.setup.phase = 'hands';
            for (const p of game.players) {
                game.setup.handConfirmedBySocketId[p.socketId] = false;
            }

            // Initialize turn state (game will only start after both confirm).
            game.turn.currentPlayerIndex = firstPlayerIndex;
            game.turn.turnNumber = 1;
            game.turn.phase = 'Draw';
            break;
        }

        case 'OPENING_HAND_CONFIRM': {
            if (game.setup.phase !== 'hands') break;
            game.setup.handConfirmedBySocketId[socketId] = true;
            const allConfirmed = game.players.every(p => game.setup.handConfirmedBySocketId[p.socketId]);
            if (allConfirmed) {
                game.setup.phase = 'complete';
            }
            break;
        }

        case 'DRAW_CARD': {
            if (!isMyTurn) break;
            if (game.setup.phase !== 'complete') break;
            if (game.turn.phase !== 'Draw') break;
            const p = game.players[actorIndex];
            const [card] = drawFromDeck(p, 1);
            if (card) p.handIds.push(card);
            game.turn.phase = 'Don';
            break;
        }

        case 'DRAW_DON': {
            if (!isMyTurn) break;
            if (game.setup.phase !== 'complete') break;
            if (game.turn.phase !== 'Don') break;
            const p = game.players[actorIndex];
            const amt = Math.max(1, Math.min(2, Number(payload?.amount) || 2));
            p.donCount = (p.donCount || 0) + amt;
            game.turn.phase = 'Main';
            break;
        }

        case 'END_TURN': {
            if (!isMyTurn) break;
            if (game.setup.phase !== 'complete') break;
            game.turn.currentPlayerIndex = actorIndex === 0 ? 1 : 0;
            game.turn.turnNumber += 1;
            game.turn.phase = 'Draw';
            break;
        }

        default:
            // Ignore unknown actions for now
            break;
    }
}

function createCardBacks(count) {
    const n = Math.max(0, Number(count) || 0);
    return Array.from({ length: n }, () => ({
        id: 'BACK',
        thumb: CARD_BACK_URL,
        full: CARD_BACK_URL
    }));
}

function battleStepRank(step) {
    const order = {
        declaring: 0,
        attack: 1,
        block: 2,
        counter: 3,
        damage: 4,
        end: 5
    };
    const k = String(step || '');
    return Object.prototype.hasOwnProperty.call(order, k) ? order[k] : -1;
}

function mergeBattleState(prevBattle, incomingBattle) {
    if (typeof incomingBattle === 'undefined') return prevBattle;

    // Allow explicit clear only if caller is authoritative (handled by caller),
    // or if there's nothing to merge.
    if (incomingBattle === null) return null;
    if (!incomingBattle || typeof incomingBattle !== 'object') return prevBattle;
    if (!prevBattle || typeof prevBattle !== 'object') return incomingBattle;

    const prevId = prevBattle.battleId;
    const incId = incomingBattle.battleId;
    if (prevId && incId && prevId !== incId) {
        // New battle instance; replace fully so counters don't leak across battles.
        return incomingBattle;
    }

    const prevRank = battleStepRank(prevBattle.step);
    const incRank = battleStepRank(incomingBattle.step);

    // Base merge prefers incoming fields, but we guard against regressions.
    const merged = { ...prevBattle, ...incomingBattle };

    // Never regress battle step when two clients are racing.
    if (prevRank >= 0 && incRank >= 0 && incRank < prevRank) {
        merged.step = prevBattle.step;
    }

    // Counter power should be monotonic within a battle.
    const prevCounter = Number(prevBattle.counterPower) || 0;
    const incCounter = Number(incomingBattle.counterPower) || 0;
    merged.counterPower = Math.max(prevCounter, incCounter);

    // blockerUsed is sticky.
    merged.blockerUsed = !!(prevBattle.blockerUsed || incomingBattle.blockerUsed);

    // If incoming snapshot is older, keep the newer target/counterTarget.
    if (prevRank >= 0 && incRank >= 0 && incRank < prevRank) {
        if (prevBattle.target) merged.target = prevBattle.target;
        if (prevBattle.counterTarget) merged.counterTarget = prevBattle.counterTarget;
    }

    // If counterPower came from prev but incoming lacks counterTarget, preserve it.
    if (merged.counterPower === prevCounter && prevBattle.counterTarget && !incomingBattle.counterTarget) {
        merged.counterTarget = prevBattle.counterTarget;
    }

    return merged;
}

// Merge a client sync snapshot into server state, but only for the side that client controls.
// This prevents one client from overwriting the other player's private zones during setup.
function mergeGameStateFromClient(lobby, incoming, playerRole) {
    if (!incoming || typeof incoming !== 'object') return;
    if (!lobby.gameState) lobby.gameState = {};

    const state = lobby.gameState;

    // Always-safe scalar-ish fields.
    // NOTE: Some setup-related fields are merged specially below to avoid clients clobbering each other.
    const passthroughKeys = [
        'currentHandSide',
        'firstPlayer',
        'turnSide',
        'turnNumber',
        'phase',
        'diceResult',
        'currentAttack',
        'battleArrow',
        'modifiers',
        'oncePerTurnUsage',
        'attackLocked'
    ];
    for (const k of passthroughKeys) {
        if (Object.prototype.hasOwnProperty.call(incoming, k)) {
            state[k] = incoming[k];
        }
    }

    // Battle state is shared/public and is especially prone to "last writer wins" races.
    // Merge it carefully so defender counter updates don't get overwritten by stale snapshots.
    if (Object.prototype.hasOwnProperty.call(incoming, 'battle')) {
        const incBattle = incoming.battle;

        // Only allow an explicit clear from the authoritative role (host/player).
        if (incBattle === null) {
            if (playerRole === 'player') {
                state.battle = null;
            }
        } else {
            state.battle = mergeBattleState(state.battle, incBattle);
        }
    }

    // Setup phase is monotonic: dice -> hands -> complete.
    // Never allow regression if one client is behind.
    if (Object.prototype.hasOwnProperty.call(incoming, 'setupPhase')) {
        const order = { dice: 0, hands: 1, 'hand-first': 1, complete: 2 };
        const cur = String(state.setupPhase || 'dice');
        const inc = String(incoming.setupPhase || 'dice');
        const curRank = Object.prototype.hasOwnProperty.call(order, cur) ? order[cur] : 0;
        const incRank = Object.prototype.hasOwnProperty.call(order, inc) ? order[inc] : 0;
        if (incRank >= curRank) {
            state.setupPhase = incoming.setupPhase;
        }
    }

    // Hand selection flags must be merged per-role; otherwise the last writer wins and we get stuck.
    if (playerRole === 'player' && Object.prototype.hasOwnProperty.call(incoming, 'playerHandSelected')) {
        state.playerHandSelected = !!incoming.playerHandSelected;
    }
    if (playerRole === 'opponent' && Object.prototype.hasOwnProperty.call(incoming, 'opponentHandSelected')) {
        state.opponentHandSelected = !!incoming.opponentHandSelected;
    }

    // Side-scoped fields: only accept the side the client controls
    const incAreas = incoming.areas;
    if (incAreas && typeof incAreas === 'object') {
        if (!state.areas || typeof state.areas !== 'object') state.areas = {};

        if (playerRole === 'player' && incAreas.player) {
            state.areas.player = incAreas.player;
        }
        if (playerRole === 'opponent' && incAreas.opponent) {
            state.areas.opponent = incAreas.opponent;
        }

        // Leaders/decks are effectively public; accept if present to avoid missing UI pieces.
        // (Still prefer the controlling player's data if both exist.)
        if (!state.areas.player && incAreas.player) state.areas.player = incAreas.player;
        if (!state.areas.opponent && incAreas.opponent) state.areas.opponent = incAreas.opponent;
    }

    // Libraries are also per-side in the current client architecture
    if (playerRole === 'player' && Array.isArray(incoming.library)) {
        state.library = incoming.library;
    }
    if (playerRole === 'opponent' && Array.isArray(incoming.oppLibrary)) {
        state.oppLibrary = incoming.oppLibrary;
    }
}

// Build a per-recipient state snapshot that hides opponent private zones.
// IMPORTANT: This is for UI concealment only; server still stores full state.
function buildConcealedStateForRole(gameState, recipientRole) {
    // structuredClone is available in modern Node; fall back to JSON clone if needed.
    const cloned = (typeof structuredClone === 'function')
        ? structuredClone(gameState)
        : JSON.parse(JSON.stringify(gameState || {}));

    const areas = cloned?.areas;
    if (!areas || typeof areas !== 'object') return cloned;

    // In the current client data model:
    // - Host controls 'player' and their private hand is in areas.player.bottom.hand
    // - Guest controls 'opponent' and their private hand is in areas.opponent.top.hand
    // Board.jsx flips visuals client-side.
    if (recipientRole === 'player') {
        const oppHand = areas?.opponent?.top?.hand;
        const oppLife = areas?.opponent?.life;
        if (Array.isArray(oppHand)) areas.opponent.top.hand = createCardBacks(oppHand.length);
        if (Array.isArray(oppLife)) areas.opponent.life = createCardBacks(oppLife.length);
    } else if (recipientRole === 'opponent') {
        const hostHand = areas?.player?.bottom?.hand;
        const hostLife = areas?.player?.life;
        if (Array.isArray(hostHand)) areas.player.bottom.hand = createCardBacks(hostHand.length);
        if (Array.isArray(hostLife)) areas.player.life = createCardBacks(hostLife.length);
    }

    return cloned;
}

function emitGameStateToLobby(io, lobby) {
    if (!lobby?.id) return;
    const lobbyId = lobby.id;
    const gameState = lobby.gameState || {};

    // Send a role-appropriate concealed snapshot to each player.
    for (const p of lobby.players || []) {
        const role = p.role;
        const socketId = p.socketId;
        if (!socketId) continue;
        const payload = buildConcealedStateForRole(gameState, role);
        io.to(socketId).emit('gameStateSync', payload);
    }
}

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

    // Game action from any player
    // NOTE: During the current migration, gameplay is still synchronized via `syncGameState` snapshots.
    // We keep `gameAction` as a lightweight relay channel for any remaining callers.
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

    // Full game state sync from any player (typically during setup)
    // Server accepts state updates and broadcasts to all clients
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
    // Keeping for backward compatibility; most gameplay should flow via `syncGameState`.
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
