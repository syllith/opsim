// tests/battleHelpers.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialAreas } from '../src/comps/Home/hooks/useDeckInitializer.js';
import { convertAreasToGameState } from '../src/comps/Home/hooks/engineAdapter.js';
import { runLocalBattle } from '../src/comps/Home/BattleHelpers.js';

test('runLocalBattle: attacker >= defender -> defender K.O.', async () => {
  // Arrange: create minimal UI areas with attacker (3k) and defender (2k)
  const areas = createInitialAreas();

  // Place attacker in player.char[0] (active) and defender in opponent.char[0] (RESTED)
  areas.player.char[0] = { id: 'ATT-01', cardId: 'ATT-01', basePower: 3000, state: 'active' };
  areas.opponent.char[0] = { id: 'DEF-01', cardId: 'DEF-01', basePower: 2000, state: 'rested' };

  // Convert to a gameState once so we can read the deterministic instanceIds
  const gs = convertAreasToGameState(areas, { turnSide: 'player', turnNumber: 1, phase: 'Main' });

  // Get the instanceIds created by the adapter
  const attackerInstanceId = gs.players.player.char[0].instanceId;
  const defenderInstanceId = gs.players.opponent.char[0].instanceId;

  // Sanity checks
  assert.ok(attackerInstanceId, 'attackerInstanceId should exist');
  assert.ok(defenderInstanceId, 'defenderInstanceId should exist');

  // Act: run local battle
  const resWrap = await runLocalBattle(areas, attackerInstanceId, defenderInstanceId, { turnSide: 'player', turnNumber: 1, phase: 'Main' });

  // Assert that battle succeeded
  assert.ok(resWrap && resWrap.success, `Expected runLocalBattle to succeed, got: ${JSON.stringify(resWrap)}`);

  // After battle, defender should be K.O.'d (engine will remove card from char or mark KO)
  const newAreas = resWrap.newAreas;
  assert.ok(newAreas, 'Expected newAreas from result');

  // Defender char array length should be less than original (character K.O. removed)
  const postLen = (newAreas.opponent && Array.isArray(newAreas.opponent.char)) ? newAreas.opponent.char.length : 0;

  // Either removed or flagged by result. Check for removal or KO flag
  const defenderWasRemoved = postLen < 1;
  const resultIndicatesKO = resWrap.result && (resWrap.result.defenderKOd || (resWrap.result.ko && resWrap.result.ko.length > 0));

  assert.ok(defenderWasRemoved || resultIndicatesKO, 'Expected defender to be K.O. or removed from field');
});
