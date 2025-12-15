'use strict';
/*
 * rng.js — Deterministic RNG & Shuffle utilities
 * =============================================================================
 * PURPOSE
 *  - Provide a deterministic, seeded random number generator for the engine.
 *  - Provide a deterministic Fisher–Yates shuffle implementation that uses
 *    the seeded RNG. Deterministic RNG is required for reproducible replays,
 *    deterministic tests, and consistent shuffle behavior for the same seed.
 *
 * RESPONSIBILITIES
 *  - Create an RNG from a numeric seed (32-bit signed integer or any numeric)
 *  - Provide methods:
 *     - nextUint32(): returns next 32-bit unsigned integer
 *     - random(): returns float in [0, 1)
 *     - randInt(min, max): returns integer in [min, max] inclusive
 *     - fork(): create a new RNG instance derived from the current one (useful for
 *               per-component determinism while maintaining global sequence)
 *  - Provide deterministic shuffle utilities:
 *     - shuffleInPlace(array, rngOrSeed)
 *     - shuffleCopy(array, rngOrSeed)
 *
 * PUBLIC API
 *  - createLCGRNG(seed) -> RNG
 *    RNG interface:
 *      - nextUint32() => number (0..2^32-1)
 *      - random() => number in [0,1)
 *      - randInt(min, max) => integer
 *      - fork() => RNG (new instance)
 *
 *  - shuffleInPlace(array, rngOrSeed) => array (shuffled in place)
 *  - shuffleCopy(array, rngOrSeed) => new shuffled array (original unchanged)
 *
 * IMPLEMENTATION NOTES
 *  - LCG parameters chosen for 32-bit arithmetic:
 *      multiplier = 1664525
 *      increment  = 1013904223
 *      modulus    = 2^32
 *    These are common LCG parameters (Numerical Recipes variant).
 *
 *  - The RNG stores state as a 32-bit unsigned integer. seed input can be any
 *    number (including negative); it will be normalized into a 32-bit unsigned int.
 *
 *  - For fork(), the RNG advances its state and creates a new RNG seeded from
 *    the produced nextUint32() — this produces independent streams useful for
 *    splitting determinism without complicating the primary stream.
 *
 *  - Fisher–Yates shuffle uses RNG.randInt(0, i) to pick swap index, guaranteeing
 *    deterministic permutations for a given seed.
 *
 * EDGE CASES & DECISIONS
 *  - The RNG is not cryptographically secure. That's fine — we only require
 *    determinism and speed.
 *  - To guarantee identical shuffles across platforms, all operations use >>>0
 *    to ensure 32-bit unsigned arithmetic.
 *
 * TEST PLAN (examples)
 *  - Same seed -> same sequence:
 *      const a = createLCGRNG(1234), b = createLCGRNG(1234);
 *      assert(a.nextUint32() === b.nextUint32());
 *
 *  - Fork yields deterministic but different stream:
 *      const r = createLCGRNG(1); const f = r.fork();
 *      assert(r.nextUint32() !== f.nextUint32());
 *
 *  - Shuffle deterministic:
 *      const arr = [1,2,3,4,5];
 *      const a = shuffleCopy(arr, 12345);
 *      const b = shuffleCopy(arr, 12345);
 *      assert.deepEqual(a, b);
 *
 * TODO CHECKLIST
 *  - [ ] Consider supporting BigInt seeds for large-space RNG (not necessary)
 *  - [ ] Add consistency tests into tests/ to assert sequences and permutations
 *  - [ ] Provide small helper to derive seed from game-state (turn/seed manager)
 *
 * EXPORTS (both named and default)
 *  export {
 *    createLCGRNG,
 *    shuffleInPlace,
 *    shuffleCopy
 *  }
 *
 * NOTE: This module is intentionally small and dependency-free.
 * =============================================================================
 */

/* eslint-disable no-bitwise */

const DEFAULT_MULTIPLIER = 1664525 >>> 0; // numeric, ensure unsigned
const DEFAULT_INCREMENT = 1013904223 >>> 0;
const MOD_32 = 0x100000000; // 2^32

/**
 * Normalize a numeric seed into a 32-bit unsigned integer.
 * Accepts numbers (including negative), booleans, or strings that parse to numbers.
 */
function normalizeSeed(seed) {
  if (seed === undefined || seed === null) {
    // Use time-based seed fallback, but force to unsigned 32-bit
    return (Date.now() & 0xffffffff) >>> 0;
  }
  if (typeof seed === 'number') {
    // Ensure integer
    const s = Math.floor(seed);
    return s >>> 0;
  }
  // try to parse string
  if (typeof seed === 'string') {
    const n = Number(seed);
    if (!Number.isNaN(n)) return Math.floor(n) >>> 0;
  }
  // fallback
  return 0 >>> 0;
}

/**
 * Create a simple LCG-based RNG seeded with "seed".
 * Returns an object with:
 *  - nextUint32(): number 0..2^32-1
 *  - random(): float in [0,1)
 *  - randInt(min,max): integer in [min,max] inclusive
 *  - fork(): new RNG seeded from nextUint32()
 */
export function createLCGRNG(seed) {
  let state = normalizeSeed(seed);

  function nextUint32() {
    // state = (a * state + c) mod 2^32
    // Use >>>0 to ensure unsigned 32-bit wrap
    state = (( (DEFAULT_MULTIPLIER * (state >>> 0)) >>> 0 ) + DEFAULT_INCREMENT) >>> 0;
    return state >>> 0;
  }

  function random() {
    // produce float in [0,1)
    // Use nextUint32 / 2^32
    const u = nextUint32();
    // Convert to fraction in [0,1)
    return (u >>> 0) / MOD_32;
  }

  function randInt(min, max) {
    // inclusive
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError('randInt requires integer min and max');
    }
    if (max < min) {
      // swap
      const t = min; min = max; max = t;
    }
    const range = (max - min + 1) >>> 0;
    // Use rejection sampling for uniformity if range is not power of two.
    // But for simplicity (and performance), we can scale using float.
    const r = Math.floor(random() * range);
    return min + r;
  }

  function fork() {
    // Advance state and use produced uint32 as new seed.
    const childSeed = nextUint32();
    return createLCGRNG(childSeed);
  }

  return {
    nextUint32,
    random,
    randInt,
    fork,
    // Provide access to current state for debug; not intended for production mutation.
    _getState: () => state >>> 0
  };
}

/**
 * Internal helper: produce an RNG instance from either an RNG-like object
 * or a numeric seed. If rngOrSeed is an object with 'random' or 'nextUint32'
 * it is returned unchanged. If it is a number, a new RNG is created from that seed.
 */
function ensureRng(rngOrSeed) {
  if (!rngOrSeed && rngOrSeed !== 0) {
    // no rng provided: create RNG from some default seed (use 0 for reproducibility)
    return createLCGRNG(0);
  }
  // if it's an object and has random() or nextUint32() assume it's an RNG
  if (typeof rngOrSeed === 'object' && (typeof rngOrSeed.random === 'function' || typeof rngOrSeed.nextUint32 === 'function')) {
    return rngOrSeed;
  }
  // else treat as seed
  return createLCGRNG(rngOrSeed);
}

/**
 * Fisher–Yates shuffle in place using provided RNG (or numeric seed).
 * Returns the same array reference shuffled.
 *
 * Note: The shuffle uses RNG.randInt(0, i).
 */
export function shuffleInPlace(array, rngOrSeed) {
  if (!Array.isArray(array)) {
    throw new TypeError('shuffleInPlace requires an array');
  }
  const rng = ensureRng(rngOrSeed);
  // Fisher-Yates
  for (let i = array.length - 1; i > 0; --i) {
    const j = rng.randInt(0, i);
    // swap i and j
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/**
 * Shuffle a copy of the array and return the new array (original unchanged).
 * rngOrSeed may be an RNG instance or a seed number.
 */
export function shuffleCopy(array, rngOrSeed) {
  if (!Array.isArray(array)) {
    throw new TypeError('shuffleCopy requires an array');
  }
  const copy = array.slice();
  shuffleInPlace(copy, rngOrSeed);
  return copy;
}

/**
 * Utility: return a random boolean with p probability of true (default p=0.5).
 */
export function randomBool(rngOrSeed, p = 0.5) {
  const rng = ensureRng(rngOrSeed);
  return rng.random() < p;
}

/**
 * Utility: choose a random element from array
 */
export function choice(array, rngOrSeed) {
  if (!Array.isArray(array)) {
    throw new TypeError('choice requires an array');
  }
  if (array.length === 0) return undefined;
  const rng = ensureRng(rngOrSeed);
  const idx = rng.randInt(0, array.length - 1);
  return array[idx];
}

/* Default export: convenience object */
export default {
  createLCGRNG,
  shuffleInPlace,
  shuffleCopy,
  randomBool,
  choice,
  ensureRng
};

/* --------------------------
   Simple self-test helpers (not executed automatically)
   --------------------------
   Example usage:
     const rng = createLCGRNG(1234);
     console.log(rng.nextUint32(), rng.random(), rng.randInt(1,6));
     const arr = [1,2,3,4,5];
     console.log(shuffleCopy(arr, 1234));
*/

