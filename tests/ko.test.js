// tests/ko.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import koModule from '../src/engine/core/ko.js';
import donManager from '../src/engine/modifiers/donManager.js';
import { modifyStat } from '../src/engine/actions/modifyStat.js';
import zones from '../src/engine/core/zones.js';
import continuousEffects from '../src/engine/modifiers/continuousEffects.js'; // <-- ADDED import

const { findInstance } = zones;

test('ko moves character to trash and detaches DONs and removes modifiers', () => {
  const s = createInitialState({});
  // Create a player character in char
  const ch = createCardInstance('CHAR-1', 'player', 'char', s);
  ch.basePower = 2000;
  ch.state = 'active';
  s.players.player.char.push(ch);

  // Put two DONs into costArea
  const don1 = createCardInstance('DON', 'player', 'costArea', s);
  const don2 = createCardInstance('DON', 'player', 'costArea', s);
  s.players.player.costArea.push(don1, don2);

  // Attach both DONs to character
  const giveRes = donManager.giveDon(s, 'player', ch.instanceId, 2);
  assert.ok(giveRes.success && giveRes.moved === 2);

  // Add a modifier targeting this character
  const modRes = modifyStat(s, {
    stat: 'power',
    mode: 'add',
    amount: 1000,
    targetInstanceIds: [ch.instanceId],
    duration: 'permanent',
    ownerId: 'player'
  });
  assert.ok(modRes.success);

  // Now KO the character
  const res = koModule.ko(s, ch.instanceId, 'battle');
  assert.ok(res.success, `ko failed: ${res.error}`);

  // Character should now be in trash
  const found = findInstance(s, ch.instanceId);
  assert.ok(found && found.zone === 'trash', 'character must be in trash after KO');

  // DONs should have been returned to costArea (2) and be rested
  const cost = s.players.player.costArea || [];
  const restedCount = cost.filter(d => d && d.state === 'rested').length;
  assert.strictEqual(restedCount, 2, 'two DONs should be returned to costArea and rested');

  // Modifiers for the instance should have been removed
  const mods = continuousEffects.getModifiersFor ? continuousEffects.getModifiersFor(s, ch.instanceId) : [];
  assert.ok(Array.isArray(mods) && mods.length === 0, 'modifiers for KOed instance should be removed');
});
