'use strict';
/*
 * gameState.js — Minimal GameState implementation & helpers
 * =============================================================================
 * PURPOSE
 *  - Provide a minimal but well-specified canonical GameState shape used by the
 *    engine during implementation.
 *  - Provide utilities to create initial state, clone state immutably for
 *    functional-style mutations, and generate unique instance IDs for card
 *    instances placed in zones.
 *
 * RESPONSIBILITIES
 *  - createInitialState(options): returns a new GameState with players and zones.
 *  - cloneState(gameState): deep clone for safe immutability semantics (JSON-safe).
 *  - generateInstanceId(gameState): produce globally unique instance id (mutates nextInstanceId).
 *  - createCardInstance(cardId, owner, zone, gameState): helper to create an instance object.
 *  - getCardInstanceById(gameState, instanceId): find instance and its location.
 *  - findInstancesByCardId(gameState, cardId): find instances matching printed card id.
 *
 * GAMESTATE SHAPE (basic)
 *  {
 *    nextInstanceId: number,
 *    turnNumber: number,
 *    phase: string,
 *    players: {
 *      player: {
 *         id: 'player',
 *         leader: null | CardInstance,
 *         deck: CardInstance[],
 *         donDeck: CardInstance[], // DON objects or placeholders
 *         hand: CardInstance[],
 *         trash: CardInstance[],
 *         char: CardInstance[],
 *         stage: null | CardInstance,
 *         costArea: CardInstance[], // DONs parked in cost area as objects
 *         life: CardInstance[] // life cards (face-down or face-up metadata)
 *      },
 *      opponent: { ... }
 *    },
 *    continuousEffects: [], // placeholder
 *    // ... other engine-managed metadata
 *  }
 *
 * CardInstance = {
 *   instanceId: 'i-1',
 *   cardId: 'OP01-001', // printed id
 *   owner: 'player' | 'opponent',
 *   zone: 'deck' | 'hand' | 'char' | 'stage' | 'leader' | 'trash' | 'life' | 'donDeck' | 'costArea',
 *   faceUp: boolean, // optional
 *   givenDon: number, // optional - number of DONs attached
 *   // additional runtime fields can be added by engine modules
 * }
 *
 * NOTES:
 *  - This is a minimal, testable foundation. Later modules will extend state.
 *  - cloneState uses JSON round-trip to deep copy; this assumes no functions/BigInt in state.
 *
 * TODO:
 *  - Consider structuredClone for richer types.
 *  - Add helper indexing for quick lookup (instanceIndex) for performance.
 * =============================================================================
 */

function defaultPlayerTemplate() {
  return {
    id: null,
    leader: null,
    deck: [],
    donDeck: [],
    hand: [],
    trash: [],
    char: [],
    stage: null,
    costArea: [],
    life: []
  };
}

/**
 * generateInstanceId(gameState) -> string
 * Mutates gameState.nextInstanceId by incrementing it and returns id string 'i-N'.
 */
export function generateInstanceId(gameState) {
  if (!gameState || typeof gameState !== 'object') {
    throw new TypeError('generateInstanceId requires a gameState object');
  }
  if (typeof gameState.nextInstanceId !== 'number') {
    gameState.nextInstanceId = 1;
  }
  const id = `i-${gameState.nextInstanceId}`;
  gameState.nextInstanceId += 1;
  return id;
}

/**
 * createCardInstance(cardId, owner, zone, gameState, opts)
 * Creates and returns a CardInstance object with a fresh instanceId.
 * Mutates gameState.nextInstanceId via generateInstanceId.
 *
 * opts: { faceUp: boolean, givenDon: number }
 */
export function createCardInstance(cardId, owner = 'player', zone = 'deck', gameState = null, opts = {}) {
  const instance = {
    instanceId: (gameState && typeof gameState === 'object') ? generateInstanceId(gameState) : `i-temp-${Math.floor(Math.random()*1e9)}`,
    cardId: cardId || null,
    owner,
    zone,
    faceUp: !!opts.faceUp,
    givenDon: typeof opts.givenDon === 'number' ? opts.givenDon : 0
  };
  return instance;
}

/**
 * createInitialState(options)
 *
 * options:
 *  {
 *    playerDeck: Array<string> (cardIds),
 *    opponentDeck: Array<string>,
 *    playerDonDeck: Array<any> (don ids or placeholders),
 *    opponentDonDeck: Array<any>,
 *    playerLeaderId: string|null,
 *    opponentLeaderId: string|null,
 *    lifeCount: number (cards placed in life area if desired)
 *  }
 *
 * Returns a new GameState object.
 */
export function createInitialState(options = {}) {
  const {
    playerDeck = [],
    opponentDeck = [],
    playerDonDeck = [],
    opponentDonDeck = [],
    playerLeaderId = null,
    opponentLeaderId = null,
    lifeCount = 0,
    startingTurnNumber = 1,
    startingPhase = 'Refresh'
  } = options;

  const gameState = {
    nextInstanceId: 1,
    turnNumber: startingTurnNumber,
    phase: startingPhase,
    players: {
      player: defaultPlayerTemplate(),
      opponent: defaultPlayerTemplate()
    },
    continuousEffects: [],
    // Additional engine-level metadata placeholders
    metadata: {}
  };

  // Assign player ids
  gameState.players.player.id = 'player';
  gameState.players.opponent.id = 'opponent';

  // Helper to convert a list of cardIds into CardInstance array
  function populateDeck(cardIdArray, owner, zoneName) {
    const arr = [];
    for (const cardId of cardIdArray) {
      const inst = createCardInstance(cardId, owner, zoneName, gameState);
      arr.push(inst);
    }
    return arr;
  }

  // Populate decks (top of array is top of deck? keep consistent: index 0 top)
  gameState.players.player.deck = populateDeck(playerDeck, 'player', 'deck');
  gameState.players.opponent.deck = populateDeck(opponentDeck, 'opponent', 'deck');

  // DON decks can be placeholders or objects; create instances with cardId 'DON' or provided id
  function populateDonDeck(donArray, owner) {
    const arr = [];
    for (const d of donArray) {
      const donId = d || 'DON';
      // DON instances are specialized but represented similarly
      const inst = createCardInstance(donId, owner, 'donDeck', gameState, { faceUp: true });
      arr.push(inst);
    }
    return arr;
  }

  gameState.players.player.donDeck = populateDonDeck(playerDonDeck, 'player');
  gameState.players.opponent.donDeck = populateDonDeck(opponentDonDeck, 'opponent');

  // Leader instances (if provided)
  if (playerLeaderId) {
    gameState.players.player.leader = createCardInstance(playerLeaderId, 'player', 'leader', gameState);
  } else {
    gameState.players.player.leader = null;
  }
  if (opponentLeaderId) {
    gameState.players.opponent.leader = createCardInstance(opponentLeaderId, 'opponent', 'leader', gameState);
  } else {
    gameState.players.opponent.leader = null;
  }

  // Life: optionally move top X cards from deck to life area (top-of-deck -> bottom-of-life)
  if (lifeCount && Number.isInteger(lifeCount) && lifeCount > 0) {
    // For player
    for (let i = 0; i < lifeCount; i++) {
      // Pop from deck top (shift) or if deck empty create blank life card
      if (gameState.players.player.deck.length > 0) {
        const top = gameState.players.player.deck.shift();
        top.zone = 'life';
        // Place at bottom of life stack (we treat array index 0 as top of life for retrieval)
        gameState.players.player.life.unshift(top); // unshift so top-of-deck becomes bottom-of-life? adjust as needed
      } else {
        const lifeCard = createCardInstance(null, 'player', 'life', gameState);
        gameState.players.player.life.unshift(lifeCard);
      }
    }
    for (let i = 0; i < lifeCount; i++) {
      if (gameState.players.opponent.deck.length > 0) {
        const top = gameState.players.opponent.deck.shift();
        top.zone = 'life';
        gameState.players.opponent.life.unshift(top);
      } else {
        const lifeCard = createCardInstance(null, 'opponent', 'life', gameState);
        gameState.players.opponent.life.unshift(lifeCard);
      }
    }
  }

  // Initialize empty hand, trash, characters, stage, cost area already by default

  return gameState;
}

/**
 * cloneState(gameState)
 * A safe deep clone. For now uses JSON round-trip.
 * Note: this loses functions or undefined properties. Suitable for engine state which should be pure-data.
 */
export function cloneState(gameState) {
  if (gameState === null || gameState === undefined) return gameState;
  // JSON-based deep clone
  return JSON.parse(JSON.stringify(gameState));
}

/**
 * getCardInstanceById(gameState, instanceId)
 * Searches through the players' zones and returns:
 *   { instance, owner, zone, index }
 * or null if not found.
 *
 * NOTE: This is O(N) scan. For large state you may add an index.
 */
export function getCardInstanceById(gameState, instanceId) {
  if (!gameState || !instanceId) return null;
  const pkeys = Object.keys(gameState.players || {});
  for (const owner of pkeys) {
    const p = gameState.players[owner];
    // check leader
    if (p.leader && p.leader.instanceId === instanceId) {
      return { instance: p.leader, owner, zone: 'leader', index: 0 };
    }
    // stage
    if (p.stage && p.stage.instanceId === instanceId) {
      return { instance: p.stage, owner, zone: 'stage', index: 0 };
    }
    // arrays
    const arrays = ['deck','donDeck','hand','trash','char','costArea','life'];
    for (const zone of arrays) {
      const arr = p[zone] || [];
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst && inst.instanceId === instanceId) {
          return { instance: inst, owner, zone, index: i };
        }
      }
    }
  }
  return null;
}

/**
 * findInstancesByCardId(gameState, cardId)
 * Returns an array of matches: { instance, owner, zone, index }
 */
export function findInstancesByCardId(gameState, cardId) {
  if (!gameState || !cardId) return [];
  const matches = [];
  const pkeys = Object.keys(gameState.players || {});
  for (const owner of pkeys) {
    const p = gameState.players[owner];
    // leader
    if (p.leader && p.leader.cardId === cardId) matches.push({ instance: p.leader, owner, zone: 'leader', index:0 });
    if (p.stage && p.stage.cardId === cardId) matches.push({ instance: p.stage, owner, zone: 'stage', index:0 });
    const arrays = ['deck','donDeck','hand','trash','char','costArea','life'];
    for (const zone of arrays) {
      const arr = p[zone] || [];
      for (let i = 0; i < arr.length; i++) {
        const inst = arr[i];
        if (inst && inst.cardId === cardId) {
          matches.push({ instance: inst, owner, zone, index: i });
        }
      }
    }
  }
  return matches;
}

export default {
  createInitialState,
  cloneState,
  generateInstanceId,
  createCardInstance,
  getCardInstanceById,
  findInstancesByCardId
};
