/* server.js — full replacement: new server-authoritative command model only.
 *
 * Notes:
 *  - This file intentionally removes legacy snapshot merging and gameAction relay.
 *  - All gameplay actions must come via socket.emit('command', {...}).
 *  - Clients should request initial state via socket.emit('requestState', { lobbyId })
 *
 *  Prereqs:
 *    - server/commandProcessor.js present (createCommandProcessor)
 *    - src/engine/* available (engine.applyCommand used by commandProcessor)
 *    - src/engine/conceal.js present
 */

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
import _ from 'lodash';

import createCommandProcessor from './server/commandProcessor.js';
import engine from './src/engine/index.js';
import { concealStateForRole } from './src/engine/conceal.js';

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
const PORT = process.env.PORT ? Number(process.env.PORT) : 5583;

const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// ----------------- Mongo -----------------
const mongoClient = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
async function connectWithRetry(delay = 5000) {
  let attempt = 1;
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    dbName: 'opsim_sessions',
    ttl: 60 * 60 * 24 * 30
  })
}));

function isAuthenticated(req, res, next) {
  if (req.session?.user?.username) return next();
  return res.status(401).json({ message: 'Unauthorized' });
}

// ----------------- Files & Cards -----------------
function resolveCardsRoot() {
  const candidates = [];
  if (process.env.CARDS_DIR) candidates.push(process.env.CARDS_DIR);
  candidates.push(path.join(__dirname, 'public', 'cards'));
  candidates.push(path.join(process.cwd(), 'public', 'cards'));
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

// Serve assets (same as before)
app.use('/api/cards/assets', (req, res, next) => {
  if (!fs.existsSync(CARDS_ROOT)) {
    console.warn('[cards/assets] Cards root not found:', CARDS_ROOT);
    return res.status(404).end();
  }
  return express.static(CARDS_ROOT)(req, res, next);
});

// Serve aggregated card JSON
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
        if (!cardId) continue;
        if (!obj.id) obj.id = cardId;
        if (!obj.cardId) obj.cardId = cardId;
        cards.push(obj);
      } catch (e) {
        console.warn('Failed to parse card JSON:', f, e?.message || e);
      }
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ count: cards.length, cards });
  } catch (e) {
    console.error('cards data error:', e);
    return res.status(500).json({ error: 'Failed to load card data' });
  }
});

// ----------------- DB helpers -----------------
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

// ----------------- In-memory structures -----------------
const lobbies = new Map();      // lobbyId -> lobby
const playerToLobby = new Map(); // socketId -> lobbyId
const playerInfo = new Map();   // socketId -> { username, lobbyId, playerRole }
const games = new Map();        // lobbyId -> { gameState, players, version }

// ----------------- Card meta & power helpers -----------------
const metaById = new Map();
function loadCardMeta() {
  try {
    const jsonRoot = path.join(__dirname, 'src', 'data', 'cards');
    if (!fs.existsSync(jsonRoot)) return;
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
    for (const f of files) {
      try {
        const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
        const id = obj?.cardId || obj?.id;
        if (id) metaById.set(id, obj);
      } catch (e) { /* ignore */ }
    }
    console.log('[Startup] Loaded', metaById.size, 'card metadata entries');
  } catch (e) {
    console.warn('[Startup] Failed to load card meta', e);
  }
}
loadCardMeta();

function getTotalPower(side, section, keyName, index, id) {
  const meta = metaById.get(id) || {};
  const base = Number(_.get(meta, 'power', _.get(meta, 'stats.power', 0))) || 0;
  return base;
}

function dealDamageToLeaderMutate(nextAreas, side, amount = 1, opts = {}) {
  const res = { paid: false, triggers: [] };
  try {
    if (!nextAreas || !nextAreas[side]) return res;
    const life = nextAreas[side].life || [];
    if (life.length === 0) return res;
    for (let i = 0; i < amount && life.length > 0; i++) {
      const removed = life.shift();
      const trash = nextAreas[side].bottom?.trash || nextAreas[side].top?.trash;
      if (Array.isArray(trash)) trash.push(removed);
      res.paid = true;
    }
  } catch (e) {}
  return res;
}

function returnDonFromCardMutate(nextAreas, side, section, keyName, index) {
  try {
    if (!nextAreas || !nextAreas[side]) return 0;
    if (section === 'char' && keyName === 'char') {
      const arr = nextAreas[side].charDon || [];
      if (Array.isArray(arr) && arr[index]) {
        arr.splice(index, 1);
        return 1;
      }
    } else if (section === 'middle' && keyName === 'leader') {
      const arr = nextAreas[side].middle?.leaderDon || [];
      if (Array.isArray(arr) && arr[index]) {
        arr.splice(index, 1);
        return 1;
      }
    }
  } catch (e) {}
  return 0;
}

// ----------------- Persistence wrappers used by command processor -----------------
async function getGameSnapshotFromStore(lobbyId) {
  const mem = games.get(lobbyId);
  if (mem && mem.gameState) {
    return { state: mem.gameState, players: mem.players || [] };
  }
  try {
    const rows = await mongoRead('opsim', 'games', { lobbyId });
    if (Array.isArray(rows) && rows.length > 0) {
      const doc = rows[0];
      games.set(lobbyId, { gameState: doc.state || {}, players: lobbies.get(lobbyId)?.players || [], version: doc.state?.version || 0 });
      return { state: doc.state || {}, players: lobbies.get(lobbyId)?.players || [] };
    }
  } catch (e) {
    console.error('[CommandProcessor] getGameSnapshotFromStore db error', e);
  }
  const lobby = lobbies.get(lobbyId);
  if (lobby) {
    const initialState = {
      players: (lobby.players || []).map(p => ({ socketId: p.socketId, username: p.username, deckIds: [], handIds: [], lifeIds: [], donCount: 0 })),
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
    games.set(lobbyId, { gameState: newState, players: lobbies.get(lobbyId)?.players || [], version: newState.version || 0 });
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

// ----------------- Instantiate command processor -----------------
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
  cardBackUrl: CARD_BACK_URL,
  metaById,
  getTotalPower,
  dealDamageToLeaderMutate,
  returnDonFromCardMutate
});

// ----------------- Utility helpers -----------------
function generateLobbyId() {
  return `L-${Math.random().toString(36).slice(2, 9)}`;
}

function broadcastLobbyList() {
  const list = Array.from(lobbies.values()).map(l => ({ id: l.id, name: l.name, players: l.players.length, status: l.status }));
  io.emit('lobbyList', list);
}

function getLobbyList() {
  return Array.from(lobbies.values()).map(l => ({ id: l.id, name: l.name, players: l.players.length, status: l.status }));
}

// ----------------- Socket handlers (NEW authoritative-only flows) -----------------
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('setUsername', (username) => {
    playerInfo.set(socket.id, { username, lobbyId: null, playerRole: null });
  });

  socket.on('requestLobbyList', () => socket.emit('lobbyList', getLobbyList()));

  // Create Lobby
  socket.on('createLobby', async ({ lobbyName, deckConfig } = {}) => {
    const info = playerInfo.get(socket.id);
    if (!info?.username) {
      socket.emit('error', { message: 'Must be logged in to create a lobby' });
      return;
    }

    const current = playerToLobby.get(socket.id);
    if (current) {
      leaveLobby(socket, current);
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
        role: 'player',
        ready: false,
        deckConfig: deckConfig || null
      }],
      status: 'waiting',
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

    // Create an initial empty game snapshot for this lobby
    const initialGameState = {
      players: lobby.players.map(p => ({ socketId: p.socketId, username: p.username, deckIds: [], handIds: [], lifeIds: [], donCount: 0 })),
      setup: {},
      turn: {}
    };
    await saveGameSnapshotToStore(lobbyId, initialGameState);

    // Immediately send the new initial state to the creator
    const concealed = concealStateForRole(initialGameState, 'player', { cardBackUrl: CARD_BACK_URL });
    socket.emit('statePatch', { fromVersion: 0, toVersion: initialGameState.version || 0, state: concealed });
  });

  // Join Lobby
  socket.on('joinLobby', async ({ lobbyId, deckConfig } = {}) => {
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

    const current = playerToLobby.get(socket.id);
    if (current && current !== lobbyId) { leaveLobby(socket, current); }

    lobby.players.push({
      socketId: socket.id,
      username: info.username,
      role: 'opponent',
      ready: false,
      deckConfig: deckConfig || null
    });

    playerToLobby.set(socket.id, lobbyId);
    info.lobbyId = lobbyId;
    info.playerRole = 'opponent';
    playerInfo.set(socket.id, info);

    socket.join(lobbyId);

    if (lobby.players.length === 2) {
      lobby.status = 'ready';
    }

    socket.emit('lobbyJoined', { lobby, role: 'opponent' });
    io.to(lobbyId).emit('lobbyUpdated', lobby);
    broadcastLobbyList();

    // On join, send the most recent authoritative state snapshot (concealed for this role)
    const snap = await getGameSnapshotFromStore(lobbyId);
    if (snap && snap.state) {
      const role = 'opponent'; // this joiner is opponent by convention
      const concealed = concealStateForRole(snap.state, role, { cardBackUrl: CARD_BACK_URL });
      socket.emit('statePatch', { fromVersion: snap.state.version || 0, toVersion: snap.state.version || 0, state: concealed });
    }
  });

  // Update deck, set ready, requestDiceRoll, leaveLobby — keep as before
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

  socket.on('setReady', (isReady) => {
    const lobbyId = playerToLobby.get(socket.id);
    if (!lobbyId) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.find(p => p.socketId === socket.id);
    if (player) {
      player.ready = isReady;
      io.to(lobbyId).emit('lobbyUpdated', lobby);
      if (lobby.players.length === 2 && lobby.players.every(p => p.ready)) {
        lobby.status = 'playing';
        io.to(lobbyId).emit('gameStart', {
          lobby,
          players: lobby.players.map(p => ({ username: p.username, role: p.role, deckConfig: p.deckConfig }))
        });
        broadcastLobbyList();
      }
    }
  });

  socket.on('requestDiceRoll', () => {
    const lobbyId = playerToLobby.get(socket.id);
    if (!lobbyId) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing') return;
    if (!Array.isArray(lobby.players) || lobby.players.length !== 2) return;
    lobby.setup = lobby.setup || {};
    if (lobby.setup.diceRoll && typeof lobby.setup.diceRoll === 'object') {
      io.to(lobbyId).emit('diceRollStart', lobby.setup.diceRoll);
      return;
    }
    const [pRoll, oRoll] = (() => {
      let a = 0, b = 0;
      while (a === b) { a = Math.floor(Math.random()*6)+1; b = Math.floor(Math.random()*6)+1; }
      return [a, b];
    })();
    const firstPlayer = pRoll > oRoll ? 'player' : 'opponent';
    const startAt = Date.now() + 350;
    const revealAt = startAt + 2000;
    const payload = { playerRoll: pRoll, opponentRoll: oRoll, firstPlayer, startAt, revealAt };
    lobby.setup.diceRoll = payload;
    io.to(lobbyId).emit('diceRollStart', payload);
  });

  socket.on('leaveLobby', () => {
    const lobbyId = playerToLobby.get(socket.id);
    if (lobbyId) leaveLobby(socket, lobbyId);
  });

  // -----------------------
  // New: requestState (client asks server for authoritative per-player concealed snapshot)
  // -----------------------
  socket.on('requestState', async ({ lobbyId } = {}) => {
    // If lobbyId not provided, derive from playerToLobby
    const lid = lobbyId || playerToLobby.get(socket.id);
    if (!lid) { socket.emit('error', { message: 'Missing lobbyId for requestState' }); return; }
    const snap = await getGameSnapshotFromStore(lid);
    if (!snap) { socket.emit('error', { message: 'Lobby not found' }); return; }
    // Determine role of requester
    const lobby = lobbies.get(lid);
    const p = lobby?.players?.find(x => x.socketId === socket.id);
    const role = (p && p.role) ? p.role : 'player';
    const concealed = concealStateForRole(snap.state, role, { cardBackUrl: CARD_BACK_URL });
    socket.emit('statePatch', { fromVersion: snap.state.version || 0, toVersion: snap.state.version || 0, state: concealed });
  });

  // -----------------------
  // New: authoritative command handler (delegates to commandProcessor)
  // -----------------------
  socket.on('command', (command) => {
    command.clientSocketId = socket.id;
    try {
      commandProcessor.handleCommand(command, { socket }).catch(err => console.error('[Command] processing error', err));
    } catch (err) {
      console.error('[Command] immediate handler error', err);
      socket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Server error' });
    }
  });

  // Remove legacy: no 'gameAction' or 'syncGameState' handlers here.

  // Legacy-like events we keep at UI-level (opponentLeft, gameEnded) are emitted from other flows
  socket.on('disconnect', () => {
    const lobbyId = playerToLobby.get(socket.id);
    if (lobbyId) leaveLobby(socket, lobbyId, true);
    playerInfo.delete(socket.id);
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Helper: leaveLobby (keeps behavior as before)
function leaveLobby(socket, lobbyId, disconnected = false) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const leavingPlayer = lobby.players.find(p => p.socketId === socket.id);
  lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
  playerToLobby.delete(socket.id);
  const info = playerInfo.get(socket.id);
  if (info) { info.lobbyId = null; info.playerRole = null; playerInfo.set(socket.id, info); }
  socket.leave(lobbyId);
  if (lobby.players.length === 0) {
    lobbies.delete(lobbyId);
  } else {
    if (lobby.hostId === socket.id) {
      const newHost = lobby.players[0];
      lobby.hostId = newHost.socketId;
      lobby.hostName = newHost.username;
    }
    if (lobby.status === 'playing') {
      io.to(lobbyId).emit('opponentLeft', { username: leavingPlayer?.username || 'Unknown', disconnected });
    }
    lobby.status = 'waiting';
    io.to(lobbyId).emit('lobbyUpdated', lobby);
  }
  broadcastLobbyList();
}

// Server start
server.listen(PORT, () => {
  console.log(`Opsim server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await mongoClient.close();
  process.exit(0);
});
