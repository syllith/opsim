// tests/search.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, createCardInstance } from '../src/engine/core/gameState.js';
import searchAction from '../src/engine/actions/search.js';
import { findInstance } from '../src/engine/core/zones.js';

test('search deck -> hand moves specified card from deck to hand', () => {
  const s = createInitialState({});
  // Create deck with two specific cards
  const c1 = createCardInstance('CARD-A', 'player', 'deck', s);
  const c2 = createCardInstance('CARD-B', 'player', 'deck', s);
  s.players.player.deck.push(c1, c2);

  const res = searchAction.search(s, { type: 'search', sourceZone: 'deck', cardId: 'CARD-B', side: 'player', addTo: 'hand' });
  assert.ok(res.success, `search failed: ${res.error}`);
  // CARD-B should now be in hand
  const f = findInstance(s, c2.instanceId);
  assert.ok(f && f.zone === 'hand', 'CARD-B must be moved to hand');
});

test('search trash -> topOfDeck moves specified card from trash to top of deck', () => {
  const s = createInitialState({});
  // Put card into trash
  const c = createCardInstance('TRASH-1', 'player', 'trash', s);
  s.players.player.trash.push(c);

  const res = searchAction.search(s, { type: 'search', sourceZone: 'trash', cardId: 'TRASH-1', side: 'player', addTo: 'topOfDeck' });
  assert.ok(res.success, `search failed: ${res.error}`);
  // It should be found at deck index 0
  const deckTop = s.players.player.deck[0];
  assert.ok(deckTop && deckTop.instanceId === c.instanceId, 'card should be top of deck');
});

test('search hand -> stage moves specified card to stage', () => {
  const s = createInitialState({});
  const c = createCardInstance('STAGE-1', 'player', 'hand', s);
  s.players.player.hand.push(c);

  const res = searchAction.search(s, { type: 'search', sourceZone: 'hand', cardId: 'STAGE-1', side: 'player', addTo: 'stage' });
  assert.ok(res.success, `search failed: ${res.error}`);
  const f = findInstance(s, c.instanceId);
  assert.ok(f && f.zone === 'stage', 'card should be in stage');
});
