// test/command_processor.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import createCommandProcessor from '../server/commandProcessor.js';

test('commandProcessor accepts command: persists event, snapshot and broadcasts statePatch + ack', async () => {
  // Setup fake lobby & game snapshot
  const lobbyId = 'L1';
  const players = [
    { socketId: 's1', role: 'player' },
    { socketId: 's2', role: 'opponent' }
  ];
  const initialState = { version: 1, foo: 'bar' };

  // Mock DB helpers
  let appendedEvents = [];
  let savedSnapshots = [];
  const appendGameEvent = async (lid, ev) => {
    appendedEvents.push({ lid, ev });
    return;
  };
  const saveGameSnapshot = async (lid, newState) => {
    savedSnapshots.push({ lid, newState });
    return;
  };
  const findEventByCommandId = async (lid, commandId) => null;
  const getGameSnapshot = async (lid) => ({ state: initialState, players });

  // Fake engine that accepts any command and returns deterministic newState
  const engine = {
    applyCommand: (state, command, opts = {}) => {
      const newState = { ...(state || {}), _applied: command.type || 'X' };
      return { valid: true, newState, eventType: command.type || 'CMD', eventPayload: { ok: true } };
    }
  };

  // Fake conceal helper: just attach a marker so we can detect it was called
  const concealStateForRole = (state, role, opts) => ({ _concealedFor: role, ...state });

  // Fake io: record per-socket emits
  const ioEmits = new Map();
  const io = {
    to: (socketId) => {
      if (!ioEmits.has(socketId)) ioEmits.set(socketId, []);
      return {
        emit: (event, payload) => {
          ioEmits.get(socketId).push({ event, payload });
        }
      };
    }
  };

  // Fake lobbies/games maps
  const lobbies = new Map([[lobbyId, { players }]]);
  const games = new Map([[lobbyId, { gameState: initialState, players }]]);

  // Origin socket: capture emits
  const originSocketEmits = [];
  const originSocket = {
    id: 's1',
    emit: (event, payload) => originSocketEmits.push({ event, payload })
  };

  // create command processor
  const cp = createCommandProcessor({
    io,
    getGameSnapshot,
    saveGameSnapshot,
    appendGameEvent,
    findEventByCommandId,
    engine,
    concealStateForRole,
    lobbies,
    games,
    logger: console,
    cardBackUrl: '/back.png'
  });

  // Prepare command and wait for appendGameEvent to be called (we'll poll)
  const command = { commandId: 'cmd1', type: 'DRAW_CARD', clientSocketId: 's1', lobbyId };

  // Kick off handler
  await cp.handleCommand(command, { socket: originSocket });

  // Wait a tiny bit for async work to finish
  await new Promise((r) => setTimeout(r, 100));

  // Assertions
  // appendGameEvent should have been called once
  assert.strictEqual(appendedEvents.length, 1, 'expected one appended event');
  assert.strictEqual(appendedEvents[0].lid, lobbyId);
  assert.strictEqual(appendedEvents[0].ev.commandId, command.commandId);

  // saveGameSnapshot called once
  assert.strictEqual(savedSnapshots.length, 1, 'expected one saved snapshot');
  assert.strictEqual(savedSnapshots[0].lid, lobbyId);
  assert.ok(savedSnapshots[0].newState._applied === command.type);

  // origin socket should have received commandAck accepted
  const ack = originSocketEmits.find(e => e.event === 'commandAck');
  assert.ok(ack, 'expected commandAck to origin');
  assert.strictEqual(ack.payload.commandId, command.commandId);
  assert.strictEqual(ack.payload.status, 'accepted');

  // Each player should have received a statePatch
  for (const p of players) {
    const records = ioEmits.get(p.socketId) || [];
    const patch = records.find(r => r.event === 'statePatch');
    assert.ok(patch, `expected statePatch for ${p.socketId}`);
    assert.strictEqual(patch.payload.fromVersion, initialState.version);
    assert.strictEqual(patch.payload.toVersion, initialState.version + 1);
    // concealed marker
    assert.strictEqual(patch.payload.state._concealedFor, p.role);
  }
});

test('commandProcessor idempotency: existing event returns accepted ack', async () => {
  const lobbyId = 'L-2';
  const players = [{ socketId: 's1', role: 'player' }];
  const initialState = { version: 5 };

  const appendGameEvent = async () => { throw new Error('should not be called'); };
  const saveGameSnapshot = async () => { throw new Error('should not be called'); };
  const existingEvent = { eventId: 'evt-existing', version: 6 };

  const findEventByCommandId = async (lid, commandId) => existingEvent;
  const getGameSnapshot = async (lid) => ({ state: initialState, players });

  const engine = { applyCommand: () => { throw new Error('engine should not be called'); } };
  const concealStateForRole = (s, r) => s;
  const io = { to: (id) => ({ emit: () => {} }) };
  const lobbies = new Map([[lobbyId, { players }]]);
  const games = new Map([[lobbyId, { gameState: initialState, players }]]);

  const originSocketEmits = [];
  const originSocket = { id: 's1', emit: (event, payload) => originSocketEmits.push({ event, payload }) };

  const cp = createCommandProcessor({
    io,
    getGameSnapshot,
    saveGameSnapshot,
    appendGameEvent,
    findEventByCommandId,
    engine,
    concealStateForRole,
    lobbies,
    games,
    logger: console
  });

  const command = { commandId: 'cmd-ex', type: 'DRAW_CARD', clientSocketId: 's1', lobbyId };
  await cp.handleCommand(command, { socket: originSocket });

  // wait
  await new Promise((r) => setTimeout(r, 50));

  const ack = originSocketEmits.find(e => e.event === 'commandAck');
  assert.ok(ack);
  assert.strictEqual(ack.payload.commandId, command.commandId);
  assert.strictEqual(ack.payload.status, 'accepted');
  assert.strictEqual(ack.payload.eventId, existingEvent.eventId);
});

test('commandProcessor stale lastKnownStateVersion triggers rebaseNeeded', async () => {
  const lobbyId = 'L-3';
  const players = [{ socketId: 's1', role: 'player' }, { socketId: 's2', role: 'opponent' }];
  const initialState = { version: 20 };

  const appendGameEvent = async () => { throw new Error('should not be called'); };
  const saveGameSnapshot = async () => { throw new Error('should not be called'); };
  const findEventByCommandId = async () => null;
  const getGameSnapshot = async () => ({ state: initialState, players });

  const engine = { applyCommand: () => { throw new Error('should not be called'); } };
  const concealStateForRole = () => ({});
  const io = { to: (id) => ({ emit: () => {} }) };
  const lobbies = new Map([[lobbyId, { players }]]);
  const games = new Map([[lobbyId, { gameState: initialState, players }]]);

  const originSocketEmits = [];
  const originSocket = { id: 's1', emit: (event, payload) => originSocketEmits.push({ event, payload }) };

  const cp = createCommandProcessor({
    io,
    getGameSnapshot,
    saveGameSnapshot,
    appendGameEvent,
    findEventByCommandId,
    engine,
    concealStateForRole,
    lobbies,
    games,
    logger: console,
    staleThreshold: 5 // default
  });

  // lastKnownStateVersion is very stale
  const command = { commandId: 'cmd-stale', type: 'DRAW_CARD', clientSocketId: 's1', lobbyId, lastKnownStateVersion: 1 };
  await cp.handleCommand(command, { socket: originSocket });

  await new Promise((r) => setTimeout(r, 50));

  const rebase = originSocketEmits.find(e => e.event === 'rebaseNeeded');
  assert.ok(rebase, 'expected rebaseNeeded to be emitted');
  assert.strictEqual(rebase.payload.commandId, command.commandId);
  assert.strictEqual(rebase.payload.serverVersion, initialState.version);
});
