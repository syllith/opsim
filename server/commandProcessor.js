// server/commandProcessor.js
/**
 * server/commandProcessor.js
 *
 * Per-lobby command processor for the Opsim server.
 *
 * createCommandProcessor(options) -> { handleCommand(command, socketInfo) }
 *
 * Required options:
 *  - io: socket.io server instance
 *  - getGameSnapshot(lobbyId) -> { state, players }
 *  - saveGameSnapshot(lobbyId, newState)
 *  - appendGameEvent(lobbyId, event)
 *  - findEventByCommandId(lobbyId, commandId) -> existingEvent|null
 *  - engine: engine module (has applyCommand)
 *  - concealStateForRole: function(newState, role, opts)
 *  - lobbies: in-memory Map of lobbyId->lobby
 *  - games: in-memory Map of lobbyId->gameSnapshot
 *
 * Optional options:
 *  - logger (console-like)
 *  - cardBackUrl
 *  - staleThreshold (int)
 *  - metaById (Map of cardId->meta)
 *  - getTotalPower(side, section, keyName, index, id)
 *  - dealDamageToLeaderMutate, returnDonFromCardMutate (optional)
 */

import crypto from 'crypto';

export default function createCommandProcessor({
  io,
  getGameSnapshot,
  saveGameSnapshot,
  appendGameEvent,
  findEventByCommandId,
  engine,
  concealStateForRole,
  lobbies,
  games,
  logger = console,
  cardBackUrl = '/api/cards/assets/Card%20Backs/CardBackRegular.png',
  staleThreshold = 5,
  // optional helpers from server
  metaById = new Map(),
  getTotalPower = null,
  dealDamageToLeaderMutate = null,
  returnDonFromCardMutate = null
} = {}) {
  if (!io || !getGameSnapshot || !saveGameSnapshot || !appendGameEvent || !engine || !concealStateForRole) {
    throw new Error('Missing required dependencies for createCommandProcessor');
  }

  // Per-lobby queue state
  const queues = new Map();

  function enqueue(lobbyId, task) {
    if (!queues.has(lobbyId)) queues.set(lobbyId, { queue: [], running: false });
    const entry = queues.get(lobbyId);
    entry.queue.push(task);
    if (!entry.running) runQueue(lobbyId);
  }

  async function runQueue(lobbyId) {
    const entry = queues.get(lobbyId);
    if (!entry) return;
    entry.running = true;
    while (entry.queue.length > 0) {
      const task = entry.queue.shift();
      try {
        await task();
      } catch (err) {
        logger?.error(`[CommandProcessor:${lobbyId}] task error`, err);
      }
    }
    entry.running = false;
  }

  function findLobbyIdForSocket(socketId) {
    if (!lobbies) return null;
    for (const [id, lobby] of lobbies) {
      if (Array.isArray(lobby.players) && lobby.players.some(p => p.socketId === socketId)) return id;
    }
    // fallback: if games contains it with players, check there
    for (const [id, game] of games) {
      const pls = game?.players || [];
      if (Array.isArray(pls) && pls.some(p => p.socketId === socketId)) return id;
    }
    return null;
  }

  async function handleCommand(command = {}, socketInfo = {}) {
    // Expect: command = { commandId, type, payload, lobbyId?, clientSocketId?, lastKnownStateVersion? }
    // socketInfo: { socket } optional to reply directly
    const originSocket = socketInfo?.socket;
    const originSocketId = originSocket?.id;

    const lobbyId = command.lobbyId || command.lobby || findLobbyIdForSocket(command.clientSocketId || originSocketId);
    if (!lobbyId) {
      if (originSocket) originSocket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Missing or unknown lobbyId' });
      return;
    }

    enqueue(lobbyId, async () => {
      // Fetch authoritative snapshot (from memory/cache or DB)
      const gameSnapshot = await getGameSnapshot(lobbyId);
      if (!gameSnapshot) {
        if (originSocket) originSocket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Lobby not found' });
        return;
      }

      const serverVersion = (gameSnapshot.state?.version || 0);

      // Idempotency: check if this command already processed
      let existing = null;
      try {
        existing = await findEventByCommandId?.(lobbyId, command.commandId);
      } catch (e) {
        logger?.warn('[CommandProcessor] findEventByCommandId error', e);
      }
      if (existing) {
        if (originSocket) {
          originSocket.emit('commandAck', {
            commandId: command.commandId,
            status: 'accepted',
            eventId: existing.eventId,
            resultingStateVersion: existing.version
          });
        }
        return;
      }

      // Stale check - reject if client's lastKnownStateVersion too stale
      const lastKnown = typeof command.lastKnownStateVersion === 'number' ? command.lastKnownStateVersion : null;
      if (lastKnown !== null && lastKnown < (serverVersion - staleThreshold)) {
        if (originSocket) {
          originSocket.emit('rebaseNeeded', { commandId: command.commandId, serverVersion });
        }
        return;
      }

      // Build engine helpers to pass into engine.applyCommand
      const engineHelpers = {
        // meta/lookup helpers
        getCardMeta: (id) => (metaById && metaById.get ? metaById.get(id) : null),
        getTotalPower: typeof getTotalPower === 'function' ? getTotalPower : null,
        metaById,
        // mutate helpers if available
        dealDamageToLeaderMutate,
        returnDonFromCardMutate,
        // small helpers the Battle module may expect: getHandCostRoot - server can provide none in first pass
        getHandCostRoot: null
      };

      // Apply command via engine
      let result;
      try {
        // Pass helpers and RNG into engine.applyCommand for determinism & server-side lookups
        result = engine.applyCommand(gameSnapshot.state, command, { rng: Math.random, now: Date.now(), helpers: engineHelpers });
      } catch (err) {
        logger?.error(`[CommandProcessor:${lobbyId}] engine.applyCommand error`, err);
        if (originSocket) originSocket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Engine error' });
        return;
      }

      if (!result || !result.valid) {
        if (originSocket) {
          originSocket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: result?.error || 'Invalid command' });
        }
        return;
      }

      // Persist event and new snapshot
      const newVersion = (serverVersion || 0) + 1;
      const eventId = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
      const event = {
        eventId,
        commandId: command.commandId,
        type: result.eventType || command.type,
        payload: result.eventPayload || result.events || {},
        lobbyId,
        version: newVersion,
        serverTimestamp: Date.now()
      };

      try {
        // persist event
        await appendGameEvent(lobbyId, event);

        // new state snapshot
        const newState = { ...(result.newState || gameSnapshot.state || {}), version: newVersion, updatedAt: Date.now() };
        await saveGameSnapshot(lobbyId, newState);

        // ack origin
        if (originSocket) {
          originSocket.emit('commandAck', { commandId: command.commandId, status: 'accepted', eventId, resultingStateVersion: newVersion });
        }

        // Broadcast per-player concealed snapshot
        const lobby = lobbies.get(lobbyId) || { players: (gameSnapshot.players || []) };
        const players = (lobby.players || gameSnapshot.players || []);

        // When broadcasting, prefer lobby.players roles; fallback to simple assignment
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          try {
            const role = p?.role || (i === 0 ? 'player' : 'opponent');
            const socketId = p.socketId;
            const concealed = concealStateForRole(newState, role, { cardBackUrl });
            io.to(socketId).emit('statePatch', { fromVersion: serverVersion, toVersion: newVersion, state: concealed });
          } catch (err) {
            logger?.warn(`[CommandProcessor:${lobbyId}] failed to send statePatch to player ${p?.socketId}`, err);
          }
        }
      } catch (err) {
        logger?.error(`[CommandProcessor:${lobbyId}] persist/broadcast error`, err);
        if (originSocket) originSocket.emit('commandAck', { commandId: command.commandId, status: 'rejected', error: 'Persistence error' });
      }
    });
  }

  return { handleCommand };
}
