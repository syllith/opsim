// tests/openingHand.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOpeningHand } from '../src/comps/Home/OpeningHandHelpers.js';

test('pickOpeningHand deterministic selection and round rotation', () => {
  // Prepare a simple deck of 10 "cards" represented by ids
  const deck = Array.from({ length: 10 }, (_, i) => `CARD-${i+1}`);

  const hand0 = pickOpeningHand(deck, 5, 0);
  assert.strictEqual(hand0.length, 5);
  assert.deepStrictEqual(hand0, ['CARD-1','CARD-2','CARD-3','CARD-4','CARD-5']);

  const hand1 = pickOpeningHand(deck, 5, 1);
  assert.strictEqual(hand1.length, 5);
  assert.deepStrictEqual(hand1, ['CARD-6','CARD-7','CARD-8','CARD-9','CARD-10']);

  // round 2 wraps back around to the first block
  const hand2 = pickOpeningHand(deck, 5, 2);
  assert.strictEqual(hand2.length, 5);
  assert.deepStrictEqual(hand2, ['CARD-1','CARD-2','CARD-3','CARD-4','CARD-5']);

  // If deck smaller than count, return deck subset
  const smallDeck = ['A','B','C'];
  const small = pickOpeningHand(smallDeck, 5, 0);
  assert.deepStrictEqual(small, ['A','B','C']);

  // Test count < deck length but non-divisible deck size
  const deck7 = Array.from({ length: 7 }, (_, i) => `D${i+1}`);
  const h0 = pickOpeningHand(deck7, 5, 0);
  assert.deepStrictEqual(h0, ['D1','D2','D3','D4','D5']);
  const h1 = pickOpeningHand(deck7, 5, 1);
  // start index = 5 => picks D6, D7, then wraps to D1,D2,D3 (total 5)
  assert.deepStrictEqual(h1, ['D6','D7','D1','D2','D3']);
});
