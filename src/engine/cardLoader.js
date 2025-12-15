'use strict';
/*
 * cardLoader.js — Card Metadata Loader for Engine
 * =============================================================================
 * PURPOSE
 *  - Provide card metadata lookup for the engine.
 *  - Supports both Node.js (for tests) and browser environments.
 *  - Caches loaded card data for efficient lookups.
 *
 * API
 *  - loadCards(): Promise<void> - Load all card data
 *  - getCardMeta(cardId): CardMeta | null - Get card metadata by ID
 *  - getCardMetaBulk(cardIds): CardMeta[] - Get multiple cards
 *  - isLoaded(): boolean - Check if cards are loaded
 * =============================================================================
 */

// Card cache
let cardCache = new Map();
let isInitialized = false;
let loadPromise = null;

/**
 * Load cards from JSON files (Node.js environment) or API (browser).
 * This is designed to work in both environments.
 */
export async function loadCards() {
  if (loadPromise) return loadPromise;
  if (isInitialized) return;
  
  loadPromise = _doLoad();
  await loadPromise;
  loadPromise = null;
}

async function _doLoad() {
  try {
    // Check if we're in a browser environment with fetch
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      // Browser: try API first
      try {
        const resp = await fetch(`/api/cards/data?v=${Date.now()}`, { cache: 'no-store' });
        if (resp.ok) {
          const { cards } = await resp.json();
          _indexCards(cards || []);
          isInitialized = true;
          return;
        }
      } catch (e) {
        // API failed, try import.meta.glob if available (Vite)
      }
      
      // Vite eager import fallback
      if (typeof import.meta !== 'undefined' && import.meta.glob) {
        const modules = import.meta.glob('/src/data/cards/**/*.json', { eager: true });
        const cards = [];
        for (const key of Object.keys(modules)) {
          const mod = modules[key];
          const raw = mod?.default || mod;
          if (raw && (raw.cardId || raw.id)) cards.push(raw);
        }
        _indexCards(cards);
        isInitialized = true;
        return;
      }
    }
    
    // Node.js environment: use fs and path
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      await _loadCardsNode();
      isInitialized = true;
      return;
    }
    
    // Fallback: empty cache
    console.warn('cardLoader: Could not load cards in this environment');
    isInitialized = true;
  } catch (e) {
    console.error('cardLoader: Error loading cards:', e);
    isInitialized = true;
  }
}

/**
 * Load cards in Node.js environment using fs
 */
async function _loadCardsNode() {
  const fs = await import('fs');
  const path = await import('path');
  const url = await import('url');
  
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const cardsDir = path.join(__dirname, '..', 'data', 'cards');
  
  const cards = [];
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json') && entry.name !== 'schema.json') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(content);
          if (data && (data.cardId || data.id)) {
            cards.push(data);
          }
        } catch (e) {
          // Skip invalid JSON files
        }
      }
    }
  }
  
  walkDir(cardsDir);
  _indexCards(cards);
}

/**
 * Index cards into the cache
 */
function _indexCards(cards) {
  cardCache.clear();
  for (const card of cards) {
    const id = card.cardId || card.id;
    if (id) {
      cardCache.set(id, card);
      // Also index by uppercase for case-insensitive lookup
      cardCache.set(id.toUpperCase(), card);
    }
  }
}

/**
 * Get card metadata by ID
 * @param {string} cardId - The card ID to look up
 * @returns {object|null} Card metadata or null if not found
 */
export function getCardMeta(cardId) {
  if (!cardId) return null;
  
  // Try exact match first
  let card = cardCache.get(cardId);
  if (card) return normalizeCardMeta(card);
  
  // Try uppercase
  card = cardCache.get(cardId.toUpperCase());
  if (card) return normalizeCardMeta(card);
  
  return null;
}

/**
 * Get multiple card metadata by IDs
 * @param {string[]} cardIds - Array of card IDs
 * @returns {object[]} Array of card metadata (nulls filtered out)
 */
export function getCardMetaBulk(cardIds) {
  if (!Array.isArray(cardIds)) return [];
  return cardIds.map(id => getCardMeta(id)).filter(c => c !== null);
}

/**
 * Normalize card metadata to a consistent shape
 */
function normalizeCardMeta(card) {
  if (!card) return null;
  
  return {
    cardId: card.cardId || card.id || null,
    cardName: card.cardName || card.name || null,
    power: typeof card.power === 'number' ? card.power : (parseInt(card.power, 10) || 0),
    cost: typeof card.cost === 'number' ? card.cost : (parseInt(card.cost, 10) || 0),
    counter: typeof card.counter === 'number' ? card.counter : (parseInt(card.counter, 10) || null),
    life: typeof card.life === 'number' ? card.life : (parseInt(card.life, 10) || null),
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
    abilities: Array.isArray(card.abilities) ? card.abilities : [],
    colors: Array.isArray(card.colors) ? card.colors : [],
    types: Array.isArray(card.types) ? card.types : [],
    traits: Array.isArray(card.traits) ? card.traits : [],
    attribute: card.attribute || null,
    setId: card.setId || card.set || null,
    cardNumber: card.cardNumber || card.number || null,
    rarity: card.rarity || null,
    art: card.art || null,
    printedText: card.printedText || card.text || card.effect || '',
    // Raw data for anything else
    _raw: card
  };
}

/**
 * Check if cards have been loaded
 */
export function isLoaded() {
  return isInitialized;
}

/**
 * Get total number of loaded cards
 */
export function getCardCount() {
  // Divide by 2 since we store both exact and uppercase keys
  return Math.floor(cardCache.size / 2);
}

/**
 * Clear the cache (for testing)
 */
export function clearCache() {
  cardCache.clear();
  isInitialized = false;
  loadPromise = null;
}

export default {
  loadCards,
  getCardMeta,
  getCardMetaBulk,
  isLoaded,
  getCardCount,
  clearCache
};
