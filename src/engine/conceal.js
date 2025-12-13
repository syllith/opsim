/**
 * src/engine/conceal.js
 *
 * Pure helper to produce a per-recipient concealed game state.
 * Replaces opponent private zones (hand / life arrays) with card-back placeholders.
 *
 * API:
 *   concealStateForRole(gameState, recipientRole, opts)
 *
 * Params:
 *   - gameState: authoritative state object (will not be mutated)
 *   - recipientRole: 'player' or 'opponent' (the role of recipient, i.e., which side they control)
 *   - opts:
 *       - cardBackUrl: string URL to use for thumb/full on back cards
 *
 * Returns:
 *   - cloned and concealed state object
 *
 * Notes:
 *   - Uses structuredClone if available; falls back to JSON clone.
 *   - The function is intentionally minimal and conservative so it can be used both by server
 *     and client code that wants to render a concealed snapshot.
 */

const DEFAULT_CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';

function cloneState(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  // Fallback (loses functions and non-JSON-safe types, acceptable for plain state)
  return JSON.parse(JSON.stringify(obj || {}));
}

function createCardBacks(count, cardBackUrl = DEFAULT_CARD_BACK_URL) {
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, () => ({
    id: 'BACK',
    thumb: cardBackUrl,
    full: cardBackUrl
  }));
}

/**
 * Conceal opponent private zones for a recipient role.
 */
export function concealStateForRole(gameState, recipientRole, opts = {}) {
  const cardBackUrl = opts.cardBackUrl || DEFAULT_CARD_BACK_URL;

  const cloned = cloneState(gameState || {});
  const areas = cloned?.gameState?.areas || cloned?.areas || null;

  if (!areas || typeof areas !== 'object') {
    // Nothing to conceal, return cloned shallow state
    return cloned;
  }

  // In this data model:
  // - Host controls 'player' and their private hand is in areas.player.bottom.hand
  // - Guest controls 'opponent' and their private hand is in areas.opponent.top.hand
  // - Life arrays are similarly on those subpaths
  if (recipientRole === 'player') {
    try {
      const oppHand = areas?.opponent?.top?.hand;
      const oppLife = areas?.opponent?.life;
      if (Array.isArray(oppHand)) {
        areas.opponent.top.hand = createCardBacks(oppHand.length, cardBackUrl);
      }
      if (Array.isArray(oppLife)) {
        areas.opponent.life = createCardBacks(oppLife.length, cardBackUrl);
      }
    } catch (e) {
      // noop: if structure differs, leave as-is
    }
  } else if (recipientRole === 'opponent') {
    try {
      const hostHand = areas?.player?.bottom?.hand;
      const hostLife = areas?.player?.life;
      if (Array.isArray(hostHand)) {
        areas.player.bottom.hand = createCardBacks(hostHand.length, cardBackUrl);
      }
      if (Array.isArray(hostLife)) {
        areas.player.life = createCardBacks(hostLife.length, cardBackUrl);
      }
    } catch (e) {
      // noop
    }
  }

  return cloned;
}

export default { concealStateForRole };
