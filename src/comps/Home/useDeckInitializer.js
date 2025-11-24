import { useEffect, useCallback, useRef } from 'react';

// Create initial empty board areas
export const createInitialAreas = () => ({
  opponent: {
    top: { hand: [], trash: [], cost: [], don: [] },
    middle: { deck: [], stage: [], leader: [], leaderDon: [] },
    char: [],
    charDon: [],
    life: []
  },
  player: {
    life: [],
    char: [],
    charDon: [],
    middle: { leader: [], leaderDon: [], stage: [], deck: [] },
    bottom: { hand: [], don: [], cost: [], trash: [] }
  }
});

// Utility: Fisher-Yates shuffle (pure)
const shuffle = (arr) => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Expand deck item objects ({ id, count }) into a flat id array
const expandDeckItems = (items) => {
  if (!items) return [];
  const result = [];
  for (const it of items) {
    const count = it.count || 0;
    for (let i = 0; i < count; i++) result.push(it.id);
  }
  return result;
};

export function useDeckInitializer({
  isLoggedIn,
  allCards,
  allById,
  library,
  oppLibrary,
  setAreas,
  setLibrary,
  setOppLibrary,
  initializeDonDecks, // NOTE: passed from parent AFTER DON hook init if needed
  openingHandRef,
  demoConfig: { HARDCODED, DEMO_LEADER, DEMO_DECK_ITEMS },
  cardBackUrl
}) {
  // Card back factory
  const createCardBacks = useCallback((count) => {
    return Array.from({ length: count }, () => ({ id: 'BACK', thumb: cardBackUrl, full: cardBackUrl }));
  }, [cardBackUrl]);

  // Asset resolver for id -> { id, thumb, full }
  const getAssetForId = useCallback((id) => {
    if (!id) return null;
    const hit = allById.get(id);
    if (hit) return hit;
    const m = String(id).match(/^([A-Za-z0-9]+)-/);
    const setName = m ? m[1] : '';
    return {
      id,
      thumb: `/api/cards/assets/${setName}/${id}_small.png`,
      full: `/api/cards/assets/${setName}/${id}.png`
    };
  }, [allById]);

  // One-time game init flag
  const gameInitializedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || !allCards.length || gameInitializedRef.current) return;
    if (library.length || oppLibrary.length) return; // already initialized
    gameInitializedRef.current = true;

    (async () => {
      try {
        if (HARDCODED) {
          const ids = expandDeckItems(DEMO_DECK_ITEMS);
          const libP = shuffle(ids.slice());
          const libO = shuffle(ids.slice());
          const leaderAsset = getAssetForId(DEMO_LEADER);

          setAreas(prev => {
            const next = structuredClone(prev);
            next.player.middle.leader = [{ ...leaderAsset, rested: false }];
            next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
            next.player.middle.deck = createCardBacks(libP.length);
            next.opponent.middle.deck = createCardBacks(libO.length);
            const opp5 = libO.slice(-5).map(id => getAssetForId(id)).filter(Boolean);
            next.opponent.top.hand = opp5;
            next.opponent.middle.deck = createCardBacks(Math.max(0, libO.length - 5));
            return next;
          });

          if (typeof initializeDonDecks === 'function') {
            initializeDonDecks();
          }

            setLibrary(libP);
            setOppLibrary(libO);

            if (openingHandRef?.current) {
              openingHandRef.current.initialize(libP);
            }
            return;
        }
        // Dynamic deck load
        const res = await fetch('/api/decks', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No decks');
        const decks = (data.decks || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (!decks.length) {
          setAreas(prev => {
            const next = structuredClone(prev);
            next.player.middle.deck = createCardBacks(50);
            next.opponent.middle.deck = createCardBacks(50);
            return next;
          });
          return;
        }
        const chosen = decks[0];
        const dres = await fetch(`/api/decks/${encodeURIComponent(chosen.name)}`, { credentials: 'include' });
        const deck = await dres.json();
        if (!dres.ok) throw new Error(deck.error || 'Failed to load deck');
        const ids = expandDeckItems(deck.items);
        if (ids.length !== 50) {
          console.warn('Deck not 50 cards; padding with random cards');
          while (ids.length < 50 && allCards.length) ids.push(allCards[Math.floor(Math.random() * allCards.length)].id);
        }
        const lib = shuffle(ids.slice());
        const lead = deck.leaderId;

        setAreas(prev => {
          const next = structuredClone(prev);
          let leaderAsset = allById.get(lead) || null;
          if (!leaderAsset && typeof lead === 'string') {
            const m = lead.match(/^([A-Za-z0-9]+)-/);
            if (m) {
              const setName = m[1];
              leaderAsset = {
                id: lead,
                thumb: `/api/cards/assets/${setName}/${lead}_small.png`,
                full: `/api/cards/assets/${setName}/${lead}.png`
              };
            }
          }
          if (leaderAsset) {
            next.player.middle.leader = [{ ...leaderAsset, rested: false }];
            next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
          }
          next.player.middle.deck = createCardBacks(lib.length);
          next.opponent.middle.deck = createCardBacks(50);
          return next;
        });
        setLibrary(lib);
        if (openingHandRef?.current) openingHandRef.current.initialize(lib);
      } catch (e) {
        console.error('Init game failed:', e);
        setAreas(prev => {
          const next = structuredClone(prev);
          next.player.middle.deck = createCardBacks(50);
          next.opponent.middle.deck = createCardBacks(50);
          return next;
        });
      }
    })();
  }, [isLoggedIn, allCards.length, library.length, oppLibrary.length, HARDCODED, DEMO_DECK_ITEMS, DEMO_LEADER, allById, setAreas, setLibrary, setOppLibrary, openingHandRef, initializeDonDecks, createCardBacks, getAssetForId]);

  return {
    createCardBacks,
    getAssetForId
  };
}

export default useDeckInitializer;
