// src/comps/Home/OpeningHandHelpers.js
/**
 * Deterministic chooser: pickOpeningHand
 *
 * @param {Array} sideLibrary - array of card descriptors (or cardIds).
 * @param {number} count - how many cards to pick (default 5)
 * @param {number} round - mulligan round (0 = first pick; 1 = next block, etc.)
 * @returns {Array} - array of selected card entries
 */
export function pickOpeningHand(sideLibrary = [], count = 5, round = 0) {
  if (!Array.isArray(sideLibrary) || sideLibrary.length === 0) return [];

  const n = sideLibrary.length;
  if (count <= 0) return [];

  // If deck smaller than count, return entire deck (deterministic)
  if (n <= count) {
    return sideLibrary.slice(0, n).map((x) => x);
  }

  // Start index is (round * count) % n, pick `count` entries wrapping around
  const start = ((round * count) % n + n) % n;
  const result = [];
  for (let i = 0; i < Math.min(count, n); i++) {
    const idx = (start + i) % n;
    result.push(sideLibrary[idx]);
  }
  return result;
}
