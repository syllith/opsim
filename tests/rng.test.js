// tests/rng.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLCGRNG,
  shuffleCopy,
  shuffleInPlace,
  randomBool,
  choice
} from '../src/engine/rng/rng.js';

test('createLCGRNG with same seed produces identical sequences', () => {
  const seed = 1234567;
  const a = createLCGRNG(seed);
  const b = createLCGRNG(seed);

  for (let i = 0; i < 10; i++) {
    const av = a.nextUint32();
    const bv = b.nextUint32();
    assert.strictEqual(av, bv, `Mismatch at iteration ${i}: ${av} !== ${bv}`);
  }
});

test('fork produces deterministic but independent stream (consistent across clones)', () => {
  const seed = 42;
  const root1 = createLCGRNG(seed);
  const root2 = createLCGRNG(seed);

  const fork1 = root1.fork();
  const fork2 = root2.fork();

  for (let i = 0; i < 8; i++) {
    const v1 = fork1.nextUint32();
    const v2 = fork2.nextUint32();
    assert.strictEqual(v1, v2, `Fork mismatch at ${i}: ${v1} !== ${v2}`);
  }

  // Parents continue to be deterministic
  const p1 = root1.nextUint32();
  const p2 = root2.nextUint32();
  assert.strictEqual(p1, p2, 'Parent streams should still match across identical seeds');
});

test('random() produces values in [0, 1)', () => {
  const rng = createLCGRNG(999);
  for (let i = 0; i < 100; i++) {
    const r = rng.random();
    assert.ok(typeof r === 'number', 'random() must return a number');
    assert.ok(r >= 0 && r < 1, `random() out of range: ${r}`);
  }
});

test('randInt(min,max) returns integers within inclusive bounds', () => {
  const rng = createLCGRNG(12345);
  const min = 1;
  const max = 6;
  for (let i = 0; i < 100; i++) {
    const v = rng.randInt(min, max);
    assert.ok(Number.isInteger(v), 'randInt must return integer');
    assert.ok(v >= min && v <= max, `randInt out of bounds: ${v}`);
  }
});

test('shuffleCopy is deterministic for same seed and does not mutate original', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seed = 2024;
  const a = shuffleCopy(arr, seed);
  const b = shuffleCopy(arr, seed);

  assert.deepStrictEqual(a, b, 'shuffleCopy with same seed must produce same permutation');
  assert.deepStrictEqual(arr, [1,2,3,4,5,6,7,8,9], 'shuffleCopy must not mutate the original array');
});

test('shuffleInPlace shuffles array and content set preserved', () => {
  const original = [1, 2, 3, 4, 5];
  const arr = original.slice();
  const seed = 5555;
  const rng = createLCGRNG(seed);

  shuffleInPlace(arr, rng);

  assert.strictEqual(arr.length, original.length, 'shuffled array must have same length');
  assert.deepStrictEqual(new Set(arr), new Set(original), 'shuffled array must contain same elements');

  const arr2 = shuffleCopy(original, createLCGRNG(seed));
  assert.deepStrictEqual(arr, arr2, 'shuffleInPlace with RNG should match shuffleCopy with same RNG seed');
});

test('randomBool and choice basic behavior', () => {
  assert.strictEqual(randomBool(createLCGRNG(1), 1), true, 'randomBool with p=1 must be true');
  assert.strictEqual(randomBool(createLCGRNG(2), 0), false, 'randomBool with p=0 must be false');

  const arr = ['a', 'b', 'c'];
  const c = choice(arr, 123);
  assert.ok(arr.includes(c), 'choice must return an element from the array');
});
