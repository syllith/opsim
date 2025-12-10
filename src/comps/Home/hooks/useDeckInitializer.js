import { useEffect, useCallback, useRef } from 'react';
import _ from 'lodash';

//. Creates initial empty board areas
//. Both sides have symmetric structure with top and bottom for multiplayer board flipping
export const createInitialAreas = () => ({
  opponent: {
    top: { hand: [], trash: [], cost: [], don: [] },
    bottom: { hand: [], don: [], cost: [], trash: [] },
    middle: { deck: [], stage: [], leader: [], leaderDon: [] },
    char: [],
    charDon: [],
    life: []
  },
  player: {
    top: { hand: [], trash: [], cost: [], don: [] },
    bottom: { hand: [], don: [], cost: [], trash: [] },
    life: [],
    char: [],
    charDon: [],
    middle: { leader: [], leaderDon: [], stage: [], deck: [] }
  }
});

//. Shuffles an array using lodash (pure)
const shuffle = (arr) => _.shuffle(arr);

//. Expands deck items ({ id, count }) into a flat id array
const expandDeckItems = (items) => {
  if (_.isEmpty(items)) { return []; }
  return _.flatMap(items, (it) =>
    _.times(it.count || 0, () => it.id)
  );
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
  cardBackUrl,
  gameMode, // Game mode must be selected before initialization
  isMultiplayerHost = true // In multiplayer, only host initializes decks
}) {
  //. Card back factory
  const createCardBacks = useCallback((count) => {
    return _.times(count, () => ({
      id: 'BACK',
      thumb: cardBackUrl,
      full: cardBackUrl
    }));
  }, [cardBackUrl]);

  //. Asset resolver for id -> { id, thumb, full }
  const getAssetForId = useCallback((id) => {
    if (!id) { return null; }

    const hit = _.get(allById, id);
    if (hit) { return hit; }

    const m = String(id).match(/^([A-Za-z0-9]+)-/);
    const setName = m ? m[1] : '';

    return {
      id,
      thumb: `/api/cards/assets/${setName}/${id}_small.png`,
      full: `/api/cards/assets/${setName}/${id}.png`
    };
  }, [allById]);

  //. One-time game init flag
  const gameInitializedRef = useRef(false);

  useEffect(() => {
    //. Guard: must be logged in, have a game mode selected, and card list loaded
    if (!isLoggedIn || !gameMode || !allCards.length || gameInitializedRef.current) { return; }

    //. In multiplayer, only the host initializes decks - guest receives state from host
    if (gameMode === 'multiplayer' && !isMultiplayerHost) {
      console.log('[DeckInit] Skipping deck init - multiplayer guest waits for host state');
      gameInitializedRef.current = true;
      return;
    }

    //. Guard: already initialized if any library has entries
    if (library.length || oppLibrary.length) { return; }

    gameInitializedRef.current = true;

    (async () => {
      try {
        //. Hardcoded demo config
        if (HARDCODED) {
          const ids = expandDeckItems(DEMO_DECK_ITEMS);
          const libP = shuffle(ids.slice());
          const libO = shuffle(ids.slice());
          const leaderAsset = getAssetForId(DEMO_LEADER);

          //. Setup areas: leaders, decks (but NOT opponent hand - both hands selected during setup)
          setAreas(prev => {
            const next = _.cloneDeep(prev);

            if (leaderAsset) {
              next.player.middle.leader = [{ ...leaderAsset, rested: false }];
              next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
            }

            next.player.middle.deck = createCardBacks(libP.length);
            next.opponent.middle.deck = createCardBacks(libO.length);

            return next;
          });

          //. Initialize DON decks if provided
          if (typeof initializeDonDecks === 'function') {
            initializeDonDecks();
          }

          //. Set libraries for both players
          setLibrary(libP);
          setOppLibrary(libO);

          //. NOTE: Opening hand is now initialized by the game setup flow (dice roll -> hand selection)
          //. Do not call openingHandRef?.current?.initialize here

          return;
        }

        //. Dynamic deck load
        const res = await fetch('/api/decks', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'No decks');
        }

        const decks = _.orderBy(
          data.decks || [],
          (d) => d.updatedAt || 0,
          'desc'
        );

        //. If no decks, just show 50 card backs each side
        if (!decks.length) {
          setAreas(prev => {
            const next = _.cloneDeep(prev);
            next.player.middle.deck = createCardBacks(50);
            next.opponent.middle.deck = createCardBacks(50);
            return next;
          });
          return;
        }

        const chosen = decks[0];

        //. Load chosen deck detail
        const dres = await fetch(
          `/api/decks/${encodeURIComponent(chosen.name)}`,
          { credentials: 'include' }
        );
        const deck = await dres.json();
        if (!dres.ok) {
          throw new Error(deck.error || 'Failed to load deck');
        }

        let ids = expandDeckItems(deck.items);
        //. Pad to 50 if short, using random cards from the card pool
        if (ids.length !== 50) {
          console.warn('Deck not 50 cards; padding with random cards');
          while (ids.length < 50 && allCards.length) {
            const randomCard = _.sample(allCards);
            if (!randomCard?.id) { break; }
            ids.push(randomCard.id);
          }
        }

        const lib = shuffle(ids.slice());
        const lead = deck.leaderId;

        //. Setup areas: leaders and decks
        setAreas(prev => {
          const next = _.cloneDeep(prev);
          const leaderAsset = getAssetForId(lead);

          if (leaderAsset) {
            next.player.middle.leader = [{ ...leaderAsset, rested: false }];
            next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
          }

          next.player.middle.deck = createCardBacks(lib.length);
          next.opponent.middle.deck = createCardBacks(50);

          return next;
        });

        //. Store library (do not initialize opening hand - game setup flow handles it)
        setLibrary(lib);
        //. Also set opponent library for vs-self mode
        setOppLibrary(shuffle(ids.slice()));
      } catch (e) {
        console.error('Init game failed:', e);

        //. Fallback: just show 50 card backs each side
        setAreas(prev => {
          const next = _.cloneDeep(prev);
          next.player.middle.deck = createCardBacks(50);
          next.opponent.middle.deck = createCardBacks(50);
          return next;
        });
      }
    })();
  }, [
    isLoggedIn,
    gameMode,
    allCards.length,
    library.length,
    oppLibrary.length,
    HARDCODED,
    DEMO_DECK_ITEMS,
    DEMO_LEADER,
    allById,
    setAreas,
    setLibrary,
    setOppLibrary,
    openingHandRef,
    initializeDonDecks,
    createCardBacks,
    getAssetForId
  ]);

  //. Reset function to allow re-initialization when starting a new game
  const resetGameInit = useCallback(() => {
    gameInitializedRef.current = false;
  }, []);

  return {
    createCardBacks,
    getAssetForId,
    resetGameInit
  };
}

export default useDeckInitializer;
