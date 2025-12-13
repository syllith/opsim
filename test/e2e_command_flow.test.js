// test/e2e_command_flow.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const SERVER_URL = process.env.SOCKET_URL || 'http://localhost:5583';
const CONNECT_TIMEOUT = 5000;
const EVENT_TIMEOUT = 5000;

function waitForEvent(socket, eventName, timeout = EVENT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error('socket disconnected'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeout);
    function cleanup() {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      socket.off('disconnect', onDisconnect);
    }
    socket.on(eventName, onEvent);
    socket.on('disconnect', onDisconnect);
  });
}

test('e2e: create lobby, join, ready, SETUP_READY commands produce commandAck and statePatch', async () => {
  const s1 = io(SERVER_URL, { transports: ['websocket'] });
  const s2 = io(SERVER_URL, { transports: ['websocket'] });

  // Connect and set username
  await Promise.all([
    waitForEvent(s1, 'connect', CONNECT_TIMEOUT),
    waitForEvent(s2, 'connect', CONNECT_TIMEOUT)
  ]).catch(() => { /* ignore if already connected */ });

  // Register listeners to collect events
  const s1Acks = [];
  const s2Acks = [];
  const s1Patches = [];
  const s2Patches = [];
  s1.on('commandAck', (a) => s1Acks.push(a));
  s2.on('commandAck', (a) => s2Acks.push(a));
  s1.on('statePatch', (p) => s1Patches.push(p));
  s2.on('statePatch', (p) => s2Patches.push(p));

  s1.emit('setUsername', 'u1');
  s2.emit('setUsername', 'u2');

  // s1 create lobby
  s1.emit('createLobby', { lobbyName: 'test-lobby' });
  const s1LobbyJoined = await waitForEvent(s1, 'lobbyJoined');
  assert.ok(s1LobbyJoined?.lobby?.id, 's1 did not receive lobbyJoined with id');
  const lobbyId = s1LobbyJoined.lobby.id;

  // s2 join
  s2.emit('joinLobby', { lobbyId });
  const s2LobbyJoined = await waitForEvent(s2, 'lobbyJoined');
  assert.strictEqual(s2LobbyJoined.lobby.id, lobbyId, 's2 joined different lobby');

  // both ready
  s1.emit('setReady', true);
  s2.emit('setReady', true);

  // Wait for gameStart on both
  await Promise.all([waitForEvent(s1, 'gameStart'), waitForEvent(s2, 'gameStart')]);

  // Send SETUP_READY commands from both clients
  const cmd1 = { commandId: `cmd-${Date.now()}-1`, type: 'SETUP_READY' };
  const cmd2 = { commandId: `cmd-${Date.now()}-2`, type: 'SETUP_READY' };

  s1.emit('command', cmd1);
  s2.emit('command', cmd2);

  // Wait for acks
  const ack1 = await waitForEvent(s1, 'commandAck');
  const ack2 = await waitForEvent(s2, 'commandAck');

  assert.strictEqual(ack1.status, 'accepted', 's1 command not accepted');
  assert.strictEqual(ack2.status, 'accepted', 's2 command not accepted');

  // Wait for statePatch on both sides (one or more patches)
  const patch1 = await waitForEvent(s1, 'statePatch');
  const patch2 = await waitForEvent(s2, 'statePatch');

  // Validate patch versions and presence of state
  assert.ok(typeof patch1.fromVersion === 'number' || patch1.fromVersion === null);
  assert.ok(typeof patch1.toVersion === 'number');
  assert.ok(patch1.state, 's1 patch has no state');

  assert.ok(typeof patch2.fromVersion === 'number' || patch2.fromVersion === null);
  assert.ok(typeof patch2.toVersion === 'number');
  assert.ok(patch2.state, 's2 patch has no state');

  // The toVersion should be >= fromVersion
  assert.ok((patch1.toVersion >= (patch1.fromVersion || 0)) && (patch2.toVersion >= (patch2.fromVersion || 0)));

  // Cleanup
  s1.disconnect();
  s2.disconnect();
});
