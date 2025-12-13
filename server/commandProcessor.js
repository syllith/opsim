// server/commandProcessor.js
/**
 * server/commandProcessor.js
 *
 * Creates a per-lobby command processor that:
 *  - enqueues commands per-lobby (serial execution)
 *  - checks idempotency (findEventByCommandId)
 *  - calls engine.applyCommand
 *  - persists event and snapshot (appendGameEvent, saveGameSnapshot)
 *  - broadcasts commandAck and per-player concealed statePatch
 *
 * createCommandProcessor({ io, getGameSnapshot, saveGameSnapshot, appendGameEvent, findEventByCommandId, engine, concealStateForRole, lobbies, games, logger, cardBackUrl })
 *
 * Exposes: handleCommand(command, socketInfo)
 *
 * Note: command should include either lobbyId or the sender socketId (we derive lobby if necessary).
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
  staleThreshold = 5 // version staleness threshold (tunable)
} = {}) {
  if (!io || !getGameSnapshot || !saveGameSnapshot || !appendGameEvent || !engine || !concealStateForRole) {
    throw new Error('Missing required dependencies for createCommandProcessor');
  }

  // Per-lobby queue state
  const queues = new Map();

  function enqueue(lobbyId, task) {
    if (!queues.has(lobbyId)) queues.set(lobbyId, { queue: [], running: false });
    const q = queues.get(lobbyId);
    q.queue.push(task);
    if (!q.running) runQueue(lobbyId);
  }

  async function runQueue(lobbyId) {
    const q = queues.get(lobbyId);
    if (!q) return;
    q.running = true;
    while (q.queue.length > 0) {
      const task = q.queue.shift();
      try {
        await task();
      } catch (err) {
        logger?.error(`[CommandProcessor:${lobbyId}] task error`, err);
      }
    }
    q.running = false;
  }

  function findLobbyIdForSocket(socketId) {
    if (!lobbies) return null;
    for (const [id, lobby] of lobbies) {
      if (Array.isArray(lobby.players) && lobby.players.some(p => p.socketId === socketId)) return id;
    }
    return null;
  }

  async function handleCommand(command = {}, socketInfo = {}) {
    // Expect: command = { commandId, type, payload, lobbyId?, clientSocketId? }
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
      const existing = await findEventByCommandId?.(lobbyId, command.commandId);
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

      // Apply command via engine (pure)
      let result;
      try {
        result = engine.applyCommand(gameSnapshot.state, command, { rng: Math.random, now: Date.now() });
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
        await appendGameEvent(lobbyId, event);
        const newState = { ...(result.newState || gameSnapshot.state || {}), version: newVersion, updatedAt: Date.now() };
        await saveGameSnapshot(lobbyId, newState);

        // Ack origin
        if (originSocket) {
          originSocket.emit('commandAck', { commandId: command.commandId, status: 'accepted', eventId, resultingStateVersion: newVersion });
        }

        // Broadcast per-player concealed snapshot
        const lobby = lobbies.get(lobbyId);
        const players = lobby?.players || (gameSnapshot.players || []);
        for (const p of players) {
          try {
            const role = p.role || 'player';
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
