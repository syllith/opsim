'use strict';
// rng.js — Random Number Generation
// =============================================================================
// PURPOSE:
// This module provides seeded random number generation for the game engine.
// Using seeded RNG allows for deterministic game replays - given the same seed
// and inputs, the game plays out identically.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Generate random numbers deterministically from a seed
// - Support common random operations (shuffle, pick, range)
// - Allow RNG state serialization for replays
// - Support reseeding for new games

// =============================================================================
// PUBLIC API
// =============================================================================
// createRng(seed) -> RngState
//   Creates a new RNG state from a seed.
//   seed: number or string (converted to number)
//
// nextFloat(rngState) -> { value: number, newState: RngState }
//   Returns a random float in [0, 1) and advances state.
//
// nextInt(rngState, min, max) -> { value: number, newState: RngState }
//   Returns a random integer in [min, max] inclusive.
//
// shuffle(rngState, array) -> { shuffled: Array, newState: RngState }
//   Returns a shuffled copy of the array using Fisher-Yates.
//
// pickRandom(rngState, array) -> { value: any, newState: RngState }
//   Picks a random element from the array.
//
// serializeRngState(rngState) -> string
//   Serializes RNG state for storage/replay.
//
// deserializeRngState(serialized) -> RngState
//   Restores RNG state from serialized string.

// =============================================================================
// RNG STATE SCHEMA
// =============================================================================
// RngState = {
//   seed: number,       // Original seed for reference
//   state: number,      // Current internal state
//   // Additional algorithm-specific fields as needed
// }

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - seed: number to initialize RNG
// - rngState: current state for generation
// - array: for shuffle/pick operations
//
// OUTPUTS:
// - Random values (float, int, array element)
// - Updated RNG state (for functional/immutable pattern)

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/core/gameState.js: initialize RNG on game start
// - src/engine/core/zones.js: shuffle decks
// - src/engine/actions/search.js: random ordering option
// - Any module needing randomness
//
// STORAGE:
// gameState.rngState: RngState - stored in game state for replay

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// ALGORITHM:
// Use a well-known PRNG algorithm like:
// - Linear Congruential Generator (LCG) - simple, fast
// - Mersenne Twister - better distribution
// - xorshift - good balance of speed and quality
//
// Choose based on requirements. LCG is often sufficient for games.
//
// IMMUTABILITY:
// All functions return NEW rngState, never mutate.
// This allows for:
// - Replays (same seed + inputs = same outputs)
// - Branching (what-if scenarios)
// - Debugging (can save state at any point)
//
// SEED GENERATION:
// For new games, generate seed from:
// - Current timestamp
// - User input
// - Server-provided value
// Store seed in game state for replay.
//
// FISHER-YATES SHUFFLE:
// Standard algorithm for unbiased shuffling:
// for i from n-1 down to 1:
//   j = random integer in [0, i]
//   swap array[i] and array[j]

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: same seed produces same sequence
//   Input: createRng(12345), generate 5 numbers
//   Input: createRng(12345), generate 5 numbers again
//   Expected: Identical sequences
//
// TEST: different seeds produce different sequences
//   Input: createRng(12345) vs createRng(54321)
//   Expected: Different sequences
//
// TEST: nextInt respects range
//   Input: nextInt(state, 1, 6) called 1000 times
//   Expected: All values in [1, 6], reasonable distribution
//
// TEST: shuffle produces valid permutation
//   Input: shuffle([1,2,3,4,5])
//   Expected: Contains all 5 elements, different order (usually)
//
// TEST: serialize/deserialize roundtrip
//   Input: Serialize state, deserialize, continue generating
//   Expected: Same sequence as if never serialized

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Choose PRNG algorithm
// [ ] 2. Implement createRng
// [ ] 3. Implement nextFloat
// [ ] 4. Implement nextInt
// [ ] 5. Implement shuffle (Fisher-Yates)
// [ ] 6. Implement pickRandom
// [ ] 7. Implement serialization
// [ ] 8. Test distribution quality
// [ ] 9. Document algorithm choice
// [ ] 10. Add seed generation helper

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

// Simple LCG implementation for stubs
const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_M = Math.pow(2, 32);

export const createRng = (seed) => {
  const numericSeed = typeof seed === 'string' 
    ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    : seed;
  return {
    seed: numericSeed,
    state: numericSeed >>> 0
  };
};

export const nextFloat = (rngState) => {
  // TODO: Proper PRNG implementation
  const newState = ((LCG_A * rngState.state + LCG_C) % LCG_M) >>> 0;
  return {
    value: newState / LCG_M,
    newState: { ...rngState, state: newState }
  };
};

export const nextInt = (rngState, min, max) => {
  const { value, newState } = nextFloat(rngState);
  const range = max - min + 1;
  return {
    value: Math.floor(value * range) + min,
    newState
  };
};

export const shuffle = (rngState, array) => {
  // TODO: Fisher-Yates shuffle
  const shuffled = [...array];
  let currentState = rngState;
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const { value: j, newState } = nextInt(currentState, 0, i);
    currentState = newState;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return { shuffled, newState: currentState };
};

export const pickRandom = (rngState, array) => {
  if (!array || array.length === 0) {
    return { value: undefined, newState: rngState };
  }
  const { value: index, newState } = nextInt(rngState, 0, array.length - 1);
  return { value: array[index], newState };
};

export const serializeRngState = (rngState) => {
  return JSON.stringify(rngState);
};

export const deserializeRngState = (serialized) => {
  return JSON.parse(serialized);
};

export default {
  createRng,
  nextFloat,
  nextInt,
  shuffle,
  pickRandom,
  serializeRngState,
  deserializeRngState
};
