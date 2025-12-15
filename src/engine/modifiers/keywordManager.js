'use strict';
/*
 * keywordManager.js — Keyword State Management (implemented)
 *
 * Implements granting/revoking keywords, computing effective keywords, expiry,
 * and clearing modifiers on zone change.
 */

function _ensureKeywordModifiers(gameState) {
  if (!gameState) throw new TypeError('gameState required');
  if (!Array.isArray(gameState.keywordModifiers)) gameState.keywordModifiers = [];
  if (typeof gameState.nextKeywordModifierId !== 'number') gameState.nextKeywordModifierId = 1;
}

function _generateKeywordModifierId(gameState) {
  _ensureKeywordModifiers(gameState);
  const id = `km-${gameState.nextKeywordModifierId}`;
  gameState.nextKeywordModifierId += 1;
  return id;
}

function _nowTurn(gameState) {
  return typeof gameState.turnNumber === 'number' ? gameState.turnNumber : 0;
}

/**
 * grantKeyword(gameState, instanceId, keyword, duration = 'permanent', sourceId = null, ownerId = null)
 */
export const grantKeyword = (gameState, instanceId, keyword, duration = 'permanent', sourceId = null, ownerId = null) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId || !keyword) return { success: false, error: 'missing instanceId or keyword' };

  _ensureKeywordModifiers(gameState);

  // Prevent duplicate identical grants for same instance+keyword+source+duration
  const exists = gameState.keywordModifiers.find(m =>
    m && m.instanceId === instanceId && m.keyword === keyword && m.operation === 'grant' && m.duration === duration && m.sourceInstanceId === sourceId
  );
  if (exists) return { success: true, id: exists.id, modifier: exists };

  const id = _generateKeywordModifierId(gameState);
  const mod = {
    id,
    instanceId,
    keyword,
    operation: 'grant',
    duration,
    sourceInstanceId: sourceId || null,
    createdTurn: _nowTurn(gameState),
    ownerId: ownerId || null,
    _registeredAt: Date.now()
  };
  gameState.keywordModifiers.push(mod);
  return { success: true, id, modifier: mod };
};

/**
 * revokeKeyword(gameState, instanceId, keyword, duration = 'permanent', sourceId = null, ownerId = null)
 */
export const revokeKeyword = (gameState, instanceId, keyword, duration = 'permanent', sourceId = null, ownerId = null) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!instanceId || !keyword) return { success: false, error: 'missing instanceId or keyword' };

  _ensureKeywordModifiers(gameState);

  // Prevent duplicate identical revokes
  const exists = gameState.keywordModifiers.find(m =>
    m && m.instanceId === instanceId && m.keyword === keyword && m.operation === 'revoke' && m.duration === duration && m.sourceInstanceId === sourceId
  );
  if (exists) return { success: true, id: exists.id, modifier: exists };

  const id = _generateKeywordModifierId(gameState);
  const mod = {
    id,
    instanceId,
    keyword,
    operation: 'revoke',
    duration,
    sourceInstanceId: sourceId || null,
    createdTurn: _nowTurn(gameState),
    ownerId: ownerId || null,
    _registeredAt: Date.now()
  };
  gameState.keywordModifiers.push(mod);
  return { success: true, id, modifier: mod };
};

/**
 * getKeywords(gameState, instanceId)
 * Computes printed + grants - revokes. Printed keywords are taken from instance.keywords if present.
 */
export const getKeywords = (gameState, instanceId) => {
  if (!gameState || !instanceId) return [];
  _ensureKeywordModifiers(gameState);

  // Find the instance to read printed keywords
  // Instances are simple objects scattered in gameState; do a search
  let printed = [];
  if (gameState && gameState.players) {
    const pkeys = Object.keys(gameState.players);
    for (const owner of pkeys) {
      const p = gameState.players[owner];
      // leader
      if (p.leader && p.leader.instanceId === instanceId) { printed = p.leader.keywords || []; break; }
      if (p.stage && p.stage.instanceId === instanceId) { printed = p.stage.keywords || []; break; }
      const arrays = ['deck','donDeck','hand','trash','char','costArea','life'];
      for (const zone of arrays) {
        const arr = p[zone] || [];
        for (const inst of arr) {
          if (inst && inst.instanceId === instanceId) {
            printed = inst.keywords || [];
            break;
          }
        }
        if (printed && printed.length) break;
      }
      if (printed && printed.length) break;
    }
  }

  // Gather modifiers for instance that are not expired in semantics (we don't track turn-based expiry beyond duration label)
  const grants = new Set();
  const revokes = new Set();

  for (const m of (gameState.keywordModifiers || [])) {
    if (!m || m.instanceId !== instanceId) continue;
    if (m.operation === 'grant') grants.add(m.keyword);
    if (m.operation === 'revoke') revokes.add(m.keyword);
  }

  // Start with printed
  const result = new Set(Array.isArray(printed) ? printed.slice() : []);

  // Add grants
  for (const k of grants) result.add(k);
  // Remove revokes
  for (const k of revokes) result.delete(k);

  return Array.from(result);
};

/**
 * hasKeyword(gameState, instanceId, keyword)
 */
export const hasKeyword = (gameState, instanceId, keyword) => {
  if (!gameState || !instanceId || !keyword) return false;
  const kws = getKeywords(gameState, instanceId);
  return Array.isArray(kws) && kws.includes(keyword);
};

/**
 * isKeywordRevoked(gameState, instanceId, keyword)
 */
export const isKeywordRevoked = (gameState, instanceId, keyword) => {
  if (!gameState || !instanceId || !keyword) return false;
  _ensureKeywordModifiers(gameState);
  for (const m of (gameState.keywordModifiers || [])) {
    if (!m) continue;
    if (m.instanceId === instanceId && m.keyword === keyword && m.operation === 'revoke') return true;
  }
  return false;
};

/**
 * clearKeywordsForInstance(gameState, instanceId)
 */
export const clearKeywordsForInstance = (gameState, instanceId) => {
  if (!gameState || !instanceId) return gameState;
  _ensureKeywordModifiers(gameState);
  gameState.keywordModifiers = (gameState.keywordModifiers || []).filter(m => !m || m.instanceId !== instanceId);
  return gameState;
};

/**
 * expireKeywords(gameState, trigger)
 * trigger: 'turnEnd' -> removes duration 'thisTurn'
 *          'battleEnd' -> removes duration 'thisBattle'
 *          exact match -> removes those durations
 */
export const expireKeywords = (gameState, trigger) => {
  if (!gameState) return { success: false, error: 'missing gameState' };
  _ensureKeywordModifiers(gameState);
  const before = (gameState.keywordModifiers || []).length;
  gameState.keywordModifiers = (gameState.keywordModifiers || []).filter(m => {
    if (!m || !m.duration) return true;
    if (trigger === 'turnEnd' && m.duration === 'thisTurn') return false;
    if (trigger === 'battleEnd' && m.duration === 'thisBattle') return false;
    if (trigger === m.duration) return false;
    return true;
  });
  const after = (gameState.keywordModifiers || []).length;
  return { success: true, removed: before - after };
};

export default {
  grantKeyword,
  revokeKeyword,
  getKeywords,
  hasKeyword,
  isKeywordRevoked,
  clearKeywordsForInstance,
  expireKeywords
};
