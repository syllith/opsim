// tests/replay.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, cloneState } from '../src/engine/core/gameState.js';
import zones from '../src/engine/core/zones.js';
import interpreter from '../src/engine/actions/interpreter.js';
import { createReplay, replayAll, replayStep, createSnapshot, loadSnapshot, validateReplay } from '../src/engine/persistence/replay.js';

const { createAndAdd, findInstance } = zones;

test('createSnapshot / loadSnapshot roundtrip', () => {
  const s = createInitialState({});
  const snap = createSnapshot(s);
  const restored = loadSnapshot(snap);
  assert.deepStrictEqual(restored, snap.gameState);
});

test('validateReplay reports errors for invalid replay', () => {
  const bad = null;
  const r1 = validateReplay(bad);
  assert.strictEqual(r1.valid, false);
  const incomplete = { version: 1, startingState: null, rngSeed: 'no', actionLog: null };
  const r2 = validateReplay(incomplete);
  assert.strictEqual(r2.valid, false);
  assert.ok(r2.errors.length >= 1);
});

test('replayAll reproduces an interpreter-manual final state', () => {
  const start = createInitialState({});
  // add a card to hand
  const inst = createAndAdd(start, 'CARD-01', 'player', 'hand');

  // create action: play card
  const action = { type: 'playCard', instanceId: inst.instanceId, destination: 'char' };

  // Execute manually on a clone
  const manual = cloneState(start);
  const res = interpreter.executeAction(manual, action, { activePlayer: 'player' });
  assert.ok(res && res.success, `manual action failed: ${res && res.error}`);

  // use a simple actionLog wrapper
  const actionLog = [{ actionType: 'playCard', params: { instanceId: inst.instanceId, destination: 'char' }, playerId: 'player', sequence: 1 }];
  const replay = createReplay(start, 0, actionLog);

  const final = replayAll(replay);
  assert.deepStrictEqual(final, manual, 'replayed final state must match manual execution');
});

test('replayStep returns intermediate states (step 0) and final (step 1)', () => {
  const start = createInitialState({});
  const inst = createAndAdd(start, 'CARD-02', 'player', 'hand');

  const log = [
    { actionType: 'playCard', params: { instanceId: inst.instanceId, destination: 'char' }, playerId: 'player', sequence: 1 },
    { actionType: 'moveCard', params: { instanceId: inst.instanceId, destination: 'stage' }, playerId: 'player', sequence: 2 }
  ];
  const replay = createReplay(start, 0, log);

  const after0 = replayStep(replay, 0);
  const loc0 = findInstance(after0, inst.instanceId);
  assert.ok(loc0, 'instance exists after step 0');
  assert.strictEqual(loc0.zone, 'char', 'after step 0 card must be in char');

  const after1 = replayStep(replay, 1);
  const loc1 = findInstance(after1, inst.instanceId);
  assert.ok(loc1);
  assert.strictEqual(loc1.zone, 'stage', 'after step 1 card must be in stage');

  // replayAll equals replayStep final
  const all = replayAll(replay);
  assert.deepStrictEqual(all, after1);
});
