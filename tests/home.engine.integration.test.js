// tests/home.engine.integration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialAreas } from '../src/comps/Home/hooks/useDeckInitializer.js';
import { convertAreasToGameState } from '../src/comps/Home/hooks/engineAdapter.js';
import interpreter from '../src/engine/actions/interpreter.js';

/**
 * Integration test: convert UI areas -> engine gameState, call giveDon action,
 * and assert the engine mutated gameState correctly (attached DON moved).
 */
test('home -> engine integration: giveDon via adapter', () => {
  // 1) Create minimal UI areas
  const areas = createInitialAreas();

  // 2) Add one DON in player's cost area (UI format)
  // The adapter will convert this into an engine CardInstance in player.costArea
  areas.player.bottom.cost.push({ id: 'DON', cardId: 'DON' });

  // 3) Add a target character on the player's field
  areas.player.char.push({ id: 'CHAR-GD', cardId: 'CHAR-GD' });

  // 4) Convert to engine gameState
  const gameState = convertAreasToGameState(areas, {
    turnSide: 'player',
    turnNumber: 1,
    phase: 'Main'
  });

  // Sanity checks: costArea should have one DON instance now in engine state
  assert.ok(Array.isArray(gameState.players.player.costArea), 'player.costArea should be an array');
  assert.strictEqual(gameState.players.player.costArea.length, 1, 'expected 1 DON in costArea');

  // 5) Get the target instanceId produced by conversion
  const targetInstance = gameState.players.player.char[0];
  assert.ok(targetInstance && typeof targetInstance.instanceId === 'string', 'target instance not created');

  // 6) Execute giveDon action via interpreter (engine action)
  const action = { type: 'giveDon', count: 1, target: targetInstance.instanceId, enterRested: true };
  const result = interpreter.executeAction(gameState, action, { activePlayer: 'player' });

  // 7) Assertions
  assert.ok(result && result.success, `giveDon action failed: ${result && result.error}`);
  // After giveDon, the char instance should have attachedDons
  const attached = gameState.players.player.char[0].attachedDons || [];
  assert.strictEqual(attached.length, 1, 'expected 1 attached DON on target char');
  // Cost area should be empty now
  assert.strictEqual(gameState.players.player.costArea.length, 0, 'expected costArea to be emptied');

  // Optionally confirm returned metadata
  assert.strictEqual(result.moved, 1, 'engine reported moved != 1');
});
