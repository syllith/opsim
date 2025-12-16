/**
 * engineAdapter.js - Bridge between UI areas state and Engine gameState
 * 
 * PURPOSE:
 * The UI uses an 'areas' object organized by visual layout (top/middle/bottom).
 * The engine uses a 'gameState' object organized by zone type (deck, hand, char, etc.).
 * This adapter provides conversion functions between the two formats.
 * 
 * UI AREAS STRUCTURE (from createInitialAreas):
 * {
 *   player: {
 *     top: { don: [], cost: [] },
 *     middle: { deck: [], leader: [], stage: [], leaderDon: [] },
 *     bottom: { hand: [], don: [], cost: [] },
 *     life: [],
 *     trash: [],
 *     char: [],
 *     charDon: []
 *   },
 *   opponent: {
 *     top: { hand: [], don: [], cost: [] },
 *     middle: { deck: [], leader: [], stage: [], leaderDon: [] },
 *     bottom: { don: [], cost: [] },
 *     life: [],
 *     trash: [],
 *     char: [],
 *     charDon: []
 *   }
 * }
 * 
 * ENGINE GAMESTATE STRUCTURE (from gameState.js):
 * {
 *   nextInstanceId: number,
 *   turnNumber: number,
 *   phase: string,
 *   turnPlayer: string,
 *   players: {
 *     player: {
 *       id: 'player',
 *       leader: CardInstance | null,
 *       deck: CardInstance[],
 *       donDeck: CardInstance[],
 *       hand: CardInstance[],
 *       trash: CardInstance[],
 *       char: CardInstance[],
 *       stage: CardInstance | null,
 *       costArea: CardInstance[],
 *       life: CardInstance[]
 *     },
 *     opponent: { ... }
 *   },
 *   continuousEffects: [],
 *   metadata: {}
 * }
 * 
 * NOTES:
 * - This is a TEMPORARY bridge adapter. Long-term, the engine should be the
 *   canonical source of truth and UI should subscribe to engine state changes.
 * - UI card objects may have different fields than engine CardInstances.
 * - We generate temporary instanceIds for UI cards that don't have them.
 */

/**
 * Convert a UI card object to an engine CardInstance format.
 * 
 * @param {object} uiCard - The UI card object
 * @param {string} owner - 'player' or 'opponent'
 * @param {string} zone - Engine zone name ('hand', 'char', 'deck', etc.)
 * @param {number} index - Position in the zone
 * @returns {object} - CardInstance compatible object
 */
function uiCardToInstance(uiCard, owner, zone, index) {
  if (!uiCard) return null;
  
  return {
    // Use existing instanceId if present, otherwise generate a temp one
    instanceId: uiCard.instanceId || `ui-${owner}-${zone}-${index}`,
    // cardId can be from various UI fields
    cardId: uiCard.cardId || uiCard.id || null,
    owner,
    zone,
    faceUp: uiCard.faceUp ?? (zone !== 'deck' && zone !== 'life'),
    givenDon: uiCard.givenDon ?? uiCard.don ?? 0,
    // Preserve additional fields the engine might need
    basePower: uiCard.basePower ?? uiCard.power ?? null,
    printedName: uiCard.printedName ?? uiCard.name ?? uiCard.cardId ?? uiCard.id,
    keywords: uiCard.keywords || [],
    counter: uiCard.counter ?? null,
    cost: uiCard.cost ?? null,
    state: uiCard.state || 'active' // 'active' or 'rested'
  };
}

/**
 * Convert UI areas state to engine gameState format.
 * 
 * This creates a minimal gameState that can be used with engine functions
 * like getTotalPower() and prompt handlers.
 * 
 * @param {object} areas - The UI areas state object
 * @param {object} options - Additional state info
 * @param {string} options.turnSide - Current turn side ('player' or 'opponent')
 * @param {number} options.turnNumber - Current turn number
 * @param {string} options.phase - Current phase name
 * @returns {object} - Engine-compatible gameState object
 */
export function convertAreasToGameState(areas, options = {}) {
  const { turnSide = 'player', turnNumber = 1, phase = 'Main' } = options;
  
  if (!areas) {
    return createEmptyGameState(turnSide, turnNumber, phase);
  }
  
  let nextInstanceId = 1;
  
  /**
   * Helper to convert an array of UI cards to engine instances
   */
  function convertArray(uiArray, owner, zone) {
    if (!Array.isArray(uiArray)) return [];
    return uiArray.map((card, idx) => {
      const inst = uiCardToInstance(card, owner, zone, idx);
      if (inst && inst.instanceId.startsWith('ui-')) {
        // Track generated IDs to ensure uniqueness
        nextInstanceId++;
      }
      return inst;
    }).filter(Boolean);
  }
  
  /**
   * Helper to get first item as single instance (for leader/stage)
   */
  function getSingleInstance(uiArray, owner, zone) {
    if (!Array.isArray(uiArray) || uiArray.length === 0) return null;
    return uiCardToInstance(uiArray[0], owner, zone, 0);
  }
  
  const gameState = {
    nextInstanceId: 1000, // Start high to avoid conflicts with UI-generated IDs
    turnNumber,
    turnPlayer: turnSide,
    phase,
    players: {
      player: {
        id: 'player',
        leader: null,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        char: [],
        stage: null,
        costArea: [],
        life: []
      },
      opponent: {
        id: 'opponent',
        leader: null,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        char: [],
        stage: null,
        costArea: [],
        life: []
      }
    },
    continuousEffects: [],
    metadata: {
      convertedFromUI: true,
      conversionTimestamp: Date.now()
    }
  };
  
  // Convert player zones
  const playerAreas = areas.player;
  if (playerAreas) {
    const p = gameState.players.player;
    
    // Leader (middle.leader array -> single instance)
    p.leader = getSingleInstance(playerAreas.middle?.leader, 'player', 'leader');
    
    // Stage (middle.stage array -> single instance)
    p.stage = getSingleInstance(playerAreas.middle?.stage, 'player', 'stage');
    
    // Deck
    p.deck = convertArray(playerAreas.middle?.deck, 'player', 'deck');
    
    // Hand (player's hand is in bottom.hand)
    p.hand = convertArray(playerAreas.bottom?.hand, 'player', 'hand');
    
    // Characters
    p.char = convertArray(playerAreas.char, 'player', 'char');
    
    // Life
    p.life = convertArray(playerAreas.life, 'player', 'life');
    
    // Trash
    p.trash = convertArray(playerAreas.trash, 'player', 'trash');
    
    // DON deck (from middle.don or top.don - may vary by UI implementation)
    // The "don deck" in UI is usually represented as don arrays
    // Cost area DONs are in bottom.cost for player
    p.costArea = convertArray(playerAreas.bottom?.cost, 'player', 'costArea');
    
    // DON deck cards (usually pre-game, might be empty during game)
    p.donDeck = convertArray(playerAreas.top?.don, 'player', 'donDeck');
  }
  
  // Convert opponent zones
  const oppAreas = areas.opponent;
  if (oppAreas) {
    const o = gameState.players.opponent;
    
    // Leader
    o.leader = getSingleInstance(oppAreas.middle?.leader, 'opponent', 'leader');
    
    // Stage
    o.stage = getSingleInstance(oppAreas.middle?.stage, 'opponent', 'stage');
    
    // Deck
    o.deck = convertArray(oppAreas.middle?.deck, 'opponent', 'deck');
    
    // Hand (opponent's hand is in top.hand)
    o.hand = convertArray(oppAreas.top?.hand, 'opponent', 'hand');
    
    // Characters
    o.char = convertArray(oppAreas.char, 'opponent', 'char');
    
    // Life
    o.life = convertArray(oppAreas.life, 'opponent', 'life');
    
    // Trash
    o.trash = convertArray(oppAreas.trash, 'opponent', 'trash');
    
    // Cost area DONs (top.cost for opponent)
    o.costArea = convertArray(oppAreas.top?.cost, 'opponent', 'costArea');
    
    // DON deck
    o.donDeck = convertArray(oppAreas.bottom?.don, 'opponent', 'donDeck');
  }
  
  return gameState;
}

/**
 * Create an empty gameState structure.
 */
function createEmptyGameState(turnSide = 'player', turnNumber = 1, phase = 'Main') {
  return {
    nextInstanceId: 1,
    turnNumber,
    turnPlayer: turnSide,
    phase,
    players: {
      player: {
        id: 'player',
        leader: null,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        char: [],
        stage: null,
        costArea: [],
        life: []
      },
      opponent: {
        id: 'opponent',
        leader: null,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        char: [],
        stage: null,
        costArea: [],
        life: []
      }
    },
    continuousEffects: [],
    metadata: {}
  };
}

/**
 * Convert engine gameState back to UI areas format.
 * 
 * This is the reverse of convertAreasToGameState, used when the engine
 * becomes the canonical source of truth and needs to update the UI.
 * 
 * @param {object} gameState - Engine gameState object
 * @returns {object} - UI areas object
 */
export function convertGameStateToAreas(gameState) {
  if (!gameState || !gameState.players) {
    // Return empty areas structure
    return createEmptyAreas();
  }
  
  /**
   * Convert engine instance to UI card format
   */
  function instanceToUICard(inst) {
    if (!inst) return null;
    return {
      instanceId: inst.instanceId,
      id: inst.cardId,
      cardId: inst.cardId,
      faceUp: inst.faceUp,
      givenDon: inst.givenDon || 0,
      don: inst.givenDon || 0,
      basePower: inst.basePower,
      power: inst.basePower,
      printedName: inst.printedName,
      name: inst.printedName,
      keywords: inst.keywords || [],
      counter: inst.counter,
      cost: inst.cost,
      state: inst.state || 'active'
    };
  }
  
  function convertInstArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(instanceToUICard).filter(Boolean);
  }
  
  const player = gameState.players.player || {};
  const opponent = gameState.players.opponent || {};
  
  return {
    player: {
      top: { 
        don: convertInstArray(player.donDeck), 
        cost: [] 
      },
      middle: { 
        deck: convertInstArray(player.deck), 
        leader: player.leader ? [instanceToUICard(player.leader)] : [], 
        stage: player.stage ? [instanceToUICard(player.stage)] : [], 
        leaderDon: [] 
      },
      bottom: { 
        hand: convertInstArray(player.hand), 
        don: [], 
        cost: convertInstArray(player.costArea) 
      },
      life: convertInstArray(player.life),
      trash: convertInstArray(player.trash),
      char: convertInstArray(player.char),
      charDon: []
    },
    opponent: {
      top: { 
        hand: convertInstArray(opponent.hand), 
        don: [], 
        cost: convertInstArray(opponent.costArea) 
      },
      middle: { 
        deck: convertInstArray(opponent.deck), 
        leader: opponent.leader ? [instanceToUICard(opponent.leader)] : [], 
        stage: opponent.stage ? [instanceToUICard(opponent.stage)] : [], 
        leaderDon: [] 
      },
      bottom: { 
        don: convertInstArray(opponent.donDeck), 
        cost: [] 
      },
      life: convertInstArray(opponent.life),
      trash: convertInstArray(opponent.trash),
      char: convertInstArray(opponent.char),
      charDon: []
    }
  };
}

/**
 * Create empty areas structure matching UI's createInitialAreas
 */
function createEmptyAreas() {
  const createSideAreas = (isPlayer) => ({
    top: isPlayer ? { don: [], cost: [] } : { hand: [], don: [], cost: [] },
    middle: { deck: [], leader: [], stage: [], leaderDon: [] },
    bottom: isPlayer ? { hand: [], don: [], cost: [] } : { don: [], cost: [] },
    life: [],
    trash: [],
    char: [],
    charDon: []
  });

  return {
    player: createSideAreas(true),
    opponent: createSideAreas(false)
  };
}

/**
 * Find the instanceId for a card at the given UI location.
 * Returns the card's instanceId if present, otherwise generates a fallback ID
 * matching the pattern used by convertAreasToGameState (ui-${owner}-${zone}-${index}).
 * 
 * @param {object} areas - UI areas
 * @param {string} side - 'player' or 'opponent'
 * @param {string} section - Section name (e.g., 'char', 'middle', 'life', 'trash')
 * @param {string} keyName - Key within section (e.g., 'leader', 'hand') - null for direct sections
 * @param {number} index - Index within the array
 * @returns {string|null} - instanceId or fallback ID, null if location invalid
 */
export function getInstanceIdFromAreas(areas, side, section, keyName, index) {
  if (!areas || !side) return null;
  
  const sideAreas = areas[side];
  if (!sideAreas) return null;
  
  let arr = null;
  let zoneName = null; // Used for fallback ID generation
  
  // Direct sections which are arrays (no keyName needed)
  if (section === 'char' || section === 'life' || section === 'trash' || section === 'charDon') {
    arr = sideAreas[section];
    zoneName = section;
  } else if (section === 'middle') {
    if (!keyName) return null;
    arr = sideAreas.middle?.[keyName];
    zoneName = keyName; // 'leader', 'stage', 'deck', etc.
  } else if (section === 'bottom') {
    if (!keyName) return null;
    arr = sideAreas.bottom?.[keyName];
    zoneName = keyName; // 'hand', 'cost', 'don'
  } else if (section === 'top') {
    if (!keyName) return null;
    arr = sideAreas.top?.[keyName];
    zoneName = keyName; // 'hand', 'cost', 'don'
  } else {
    // Fallback: try direct lookup on sideAreas
    arr = sideAreas[section];
    zoneName = section;
  }
  
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return null;
  
  const card = arr[index];
  if (!card) return null;
  
  // Return existing instanceId if present
  if (card.instanceId) return card.instanceId;
  
  // Generate fallback ID matching the pattern used by uiCardToInstance in convertAreasToGameState
  return `ui-${side}-${zoneName}-${index}`;
}

export default {
  convertAreasToGameState,
  convertGameStateToAreas,
  getInstanceIdFromAreas
};
