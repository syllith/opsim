// test/conceal.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { concealStateForRole } from '../src/engine/conceal.js';

test('concealStateForRole hides opponent hand and life for player view', () => {
  const state = {
    gameState: {
      areas: {
        player: { bottom: { hand: [{ id: 'A' }, { id: 'B' }] }, life: [{ id: 'L1' }] },
        opponent: { top: { hand: [{ id: 'X' }, { id: 'Y' }] }, life: [{ id: 'OL1' }, { id: 'OL2' }] }
      }
    }
  };

  const concealed = concealStateForRole(state, 'player', { cardBackUrl: '/back.png' });
  assert.strictEqual(concealed.gameState.areas.opponent.top.hand.length, 2);
  assert.ok(concealed.gameState.areas.opponent.top.hand.every(c => c.id === 'BACK' && c.full === '/back.png'));
  assert.strictEqual(concealed.gameState.areas.opponent.life.length, 2);
  assert.ok(concealed.gameState.areas.opponent.life.every(c => c.id === 'BACK' && c.full === '/back.png'));
  assert.strictEqual(concealed.gameState.areas.player.bottom.hand[0].id, 'A');
  assert.strictEqual(concealed.gameState.areas.player.life[0].id, 'L1');
});
