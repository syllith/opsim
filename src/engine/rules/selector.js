'use strict';
// selector.js — Target Selection System
// =============================================================================
// Implementation notes:
// - resolveSelector(selector) returns either the inline object or the registered
//   global selector by name.
// - evaluateSelector(gameState, selector, context) returns an array of matching
//   CardInstance objects (raw instance objects).
// - Basic filter application uses expressions.evaluateFilter.
// - validateSelection enforces min/max/upTo semantics.
// - applyDistinctBy returns instances with distinct values on requested field.
// =============================================================================

import expressions from './expressions.js';
import zones from '../core/zones.js';
import gameStateHelpers from '../core/gameState.js';

const GLOBAL_SELECTORS = {
  selfTopDeckCard: { side: 'self', type: 'deck', zones: ['deck'], max: 1 },
  opponentTopDeckCard: { side: 'opponent', type: 'deck', zones: ['deck'], max: 1 },
  selfTopLifeCard: { side: 'self', type: 'any', zones: ['life'], max: 1 },
  opponentTopLifeCard: { side: 'opponent', type: 'any', zones: ['life'], max: 1 },
  selfLeader: { side: 'self', type: 'leader' },
  opponentLeader: { side: 'opponent', type: 'leader' },
  selfThisCard: { type: 'thisCard' },
  selfTriggerSourceCard: { type: 'triggerSource' }
};

export const resolveSelector = (selector, context = {}) => {
  if (!selector) return null;
  if (typeof selector === 'string') {
    return GLOBAL_SELECTORS[selector] || null;
  }
  return selector;
};

function _sideToOwners(side, context = {}) {
  // context.activePlayer should be 'player' or 'opponent'
  if (!side) side = 'self';
  const active = context.activePlayer || 'player';
  if (side === 'self') return [active];
  if (side === 'opponent') return [active === 'player' ? 'opponent' : 'player'];
  if (side === 'both') return ['player', 'opponent'];
  // fallback
  return [active];
}

function _gatherFromZonesForSide(gameState, side, selector, context) {
  const p = (gameState && gameState.players) ? gameState.players[side] : null;
  if (!p) return [];

  // If explicit zones array present, use it; otherwise infer from type
  const zonesToSearch = (Array.isArray(selector.zones) && selector.zones.length > 0)
    ? selector.zones
    : (function inferZones() {
      switch (selector.type) {
        case 'leader': return ['leader'];
        case 'character': return ['char'];
        case 'thisCard': return []; // handled specially
        case 'any': return ['leader', 'stage', 'deck', 'donDeck', 'hand', 'trash', 'char', 'costArea', 'life'];
        case 'deck': return ['deck'];
        case 'trash': return ['trash'];
        case 'hand': return ['hand'];
        case 'don': return ['donDeck'];
        case 'donDeck': return ['donDeck'];
        case 'stage': return ['stage'];
        case 'leaderOrCharacter': return ['leader', 'char'];
        case 'costArea': return ['costArea'];
        case 'life': return ['life'];
        default:
          // If type is 'character' or synonyms
          if (selector.type === 'character' || selector.type === 'char') return ['char'];
          return ['char'];
      }
    })();

  const candidates = [];

  // special types handled here:
  if (selector.type === 'thisCard' && context && context.thisCard && context.thisCard.instanceId) {
    return [context.thisCard];
  }
  if (selector.type === 'triggerSource' && context && context.triggerSource) {
    return [context.triggerSource];
  }

  for (const z of zonesToSearch) {
    if (z === 'leader') {
      if (p.leader) candidates.push(p.leader);
      continue;
    }
    if (z === 'stage') {
      if (p.stage) candidates.push(p.stage);
      continue;
    }
    // array zones
    const arr = p[z];
    if (!Array.isArray(arr)) continue;
    // If searching top-of-deck only, some callers expect first element
    if (z === 'deck' && selector.max === 1 && selector.zones && selector.zones.includes('deck')) {
      if (arr.length > 0) candidates.push(arr[0]);
    } else {
      for (const inst of arr) {
        if (inst) candidates.push(inst);
      }
    }
  }

  return candidates;
}

export const evaluateSelector = (gameState, selectorRef, context = {}) => {
  const sel = resolveSelector(selectorRef, context);
  if (!sel) return [];

  let result = [];
  const owners = _sideToOwners(sel.side || 'self', context);

  for (const owner of owners) {
    const gathered = _gatherFromZonesForSide(gameState, owner, sel, context);
    // only include instances that match owner (we already used owner-specific gather)
    result = result.concat(gathered);
  }

  // Apply filters if any
  if (Array.isArray(sel.filters) && sel.filters.length > 0) {
    result = result.filter((inst) => {
      // For each filter, if any filter fails -> exclude
      return sel.filters.every((f) => expressions.evaluateFilter(f, inst, gameState, context));
    });
  }

  // Apply distinctBy if present
  if (sel.distinctBy) {
    result = applyDistinctBy(result, sel.distinctBy);
  }

  // Apply min/max/upTo trimming: if a specific max is set, trim to max (keep first N)
  if (typeof sel.max === 'number' && sel.max >= 0) {
    if (result.length > sel.max) {
      result = result.slice(0, sel.max);
    }
  }

  // bindAs: store into context.boundVars if requested
  if (sel.bindAs && context) {
    if (!context.boundVars) context.boundVars = {};
    context.boundVars[sel.bindAs] = result;
  }

  return result;
};

export const validateSelection = (candidates, selector) => {
  const min = (selector && typeof selector.min === 'number') ? selector.min : 0;
  const max = (selector && typeof selector.max === 'number') ? selector.max : undefined;
  const upTo = !!(selector && selector.upTo);

  if (min && candidates.length < min) {
    return { valid: false, error: `Must select at least ${min}` };
  }
  if (!upTo && typeof max === 'number' && candidates.length > max) {
    return { valid: false, error: `Must select no more than ${max}` };
  }
  return { valid: true };
};

export const applyDistinctBy = (candidates, field) => {
  const seen = new Set();
  const out = [];
  for (const inst of candidates) {
    if (!inst) continue;
    const key = (typeof inst[field] !== 'undefined') ? inst[field] : inst.cardId || inst.instanceId;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(inst);
    }
  }
  return out;
};

export const getGlobalSelector = (name) => {
  return GLOBAL_SELECTORS[name] || null;
};

export default {
  evaluateSelector,
  resolveSelector,
  getGlobalSelector,
  validateSelection,
  applyDistinctBy,
  GLOBAL_SELECTORS
};
