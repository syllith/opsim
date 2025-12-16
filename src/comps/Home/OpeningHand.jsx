// src/comps/Home/OpeningHand.jsx
/**
 * OpeningHand - Deterministic opening hand UI
 *
 * - Preserves the previous ref API used by Home/Board:
 *    initialize(sideLibraryOrAreasOrGameState, side = 'player', opts = {})
 *    updateHandDisplay(sideLibrary)
 *    isOpen()
 *    reset()
 *    getHasSelected()
 *
 * - Deterministic pick strategy: `pickOpeningHand(sideLibrary, count=5, round=0)`
 *   picks a contiguous block of `count` cards starting at (round * count) % deckLen
 *   and wraps if necessary. This makes mulligan deterministic (round increments).
 *
 * - Finalization: if `onFinalize` is provided in props, OpeningHand will call
 *   it with `{ side, chosenCards, round }` when the player keeps the hand so that
 *   parent components may apply the selection (e.g., dispatch engine action).
 *
 * Notes:
 *  - This component tries to be engine-agnostic: callers can pass either:
 *     - `sideLibrary` (array of cardIds) to initialize,
 *     - `areas` (UI areas object) to initialize (the component will read the
 *        player's deck from the areas structure),
 *     - OR `gameState` (engine gameState) to initialize (it will read player.deck).
 *
 *  - For now, the component itself does not mutate engine state; it calls
 *    `onFinalize` or uses `setAreas` if provided for local testing flows.
 */
import React, {
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  Grid,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { pickOpeningHand } from './OpeningHandHelpers.js';

/**
 * Deterministic chooser: pickOpeningHand
 *
 * @param {Array} sideLibrary - array of card descriptors (or cardIds). The function
 *                              treats entries as objects or primitives and returns
 *                              the selected slice.
 * @param {number} count - how many cards to pick (default 5)
 * @param {number} round - mulligan round (0 = first pick; 1 = next block, etc.)
 * @returns {Array} - array of selected card entries
 */
export function pickOpeningHand(sideLibrary = [], count = 5, round = 0) {
  if (!Array.isArray(sideLibrary) || sideLibrary.length === 0) return [];

  const n = sideLibrary.length;
  if (count <= 0) return [];
  if (n <= count || round === 0) {
    // If deck smaller than count, return top count (or deck entirety)
    // For round === 0, take first count (deterministic)
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

/**
 * Utility: normalize an entry to UI card format for rendering.
 * Accepts either a string id or an object { id, thumb, full, ... }.
 */
function normalizeCardEntry(e) {
  if (!e) return null;
  if (typeof e === 'string') {
    return { id: e, cardId: e, thumb: `/api/cards/assets/${e}.png` };
  }
  // shallow clone to avoid mutating passed object
  return Object.assign({}, e);
}

const OpeningHand = forwardRef((props, ref) => {
  const {
    areas,
    setAreas,
    getAssetForId,
    setHovered,
    openingHandShown,
    setOpeningHandShown,
    CARD_W = 120,
    // optional callback that parent can use to apply the chosen opening hand (engine dispatch etc.)
    onFinalize = null,
  } = props;

  // internal state
  const [openingHand, setOpeningHand] = useState([]); // array of UI-card objects
  const [side, setSide] = useState('player');
  const [round, setRound] = useState(0); // mulligan round
  const [allowMulligan, setAllowMulligan] = useState(true);
  const [selectedIndexes, setSelectedIndexes] = useState(new Set());

  // Choose a library source: prefer last initialize input, but for convenience derive from areas
  const deriveSideLibraryFromAreas = useCallback((areasObj, sideName = 'player') => {
    try {
      if (!areasObj || !areasObj[sideName]) return [];
      // deck is typically areas[side].middle.deck for player or opponent
      const middle = areasObj[sideName].middle || {};
      const deckArr = Array.isArray(middle.deck) ? middle.deck : [];
      // Normalize deck entries to ids (or objects)
      return deckArr.map((c) => {
        // adapter converts engine instances to objects with `id`/`cardId` — preserve that
        return normalizeCardEntry(c);
      });
    } catch {
      return [];
    }
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    /**
     * initialize(source, side='player', opts = {})
     * - source may be:
     *    - Array (sideLibrary) of card objects/ids
     *    - An `areas` object (UI areas)
     *    - A `gameState` object (engine state) — if so, we'll try to read player.deck
     */
    initialize: (source, initSide = 'player', opts = {}) => {
      setSide(initSide || 'player');
      setRound(0);
      setAllowMulligan(true);
      setSelectedIndexes(new Set());

      let lib = [];
      if (Array.isArray(source)) {
        // treat as sideLibrary
        lib = source.map((c) => normalizeCardEntry(c));
      } else if (source && source.players) {
        // probably an engine gameState
        const p = source.players[initSide];
        if (p && Array.isArray(p.deck)) {
          lib = p.deck.map((inst) => normalizeCardEntry({
            id: inst.cardId || inst.id,
            cardId: inst.cardId || inst.id,
            thumb: getAssetForId ? getAssetForId(inst.cardId) : undefined
          }));
        }
      } else if (source && source[initSide]) {
        // assume this is an `areas` object
        lib = deriveSideLibraryFromAreas(source, initSide);
      } else {
        lib = [];
      }

      // pick initial hand deterministically (round=0)
      const picked = pickOpeningHand(lib, opts.count || 5, 0).map(normalizeCardEntry);
      setOpeningHand(picked);
      if (typeof setOpeningHandShown === 'function') setOpeningHandShown(true);
    },

    updateHandDisplay: (sideLibrary) => {
      // Replace the currently shown openingHand with new selection from given sideLibrary
      const picked = pickOpeningHand(Array.isArray(sideLibrary) ? sideLibrary : [], 5, round).map(normalizeCardEntry);
      setOpeningHand(picked);
    },

    isOpen: () => !!openingHandShown,

    reset: () => {
      setOpeningHand([]);
      setAllowMulligan(true);
      setRound(0);
      setSelectedIndexes(new Set());
      if (typeof setOpeningHandShown === 'function') setOpeningHandShown(false);
    },

    getHasSelected: () => (selectedIndexes.size > 0)
  }), [openingHandShown, setOpeningHandShown, deriveSideLibraryFromAreas, getAssetForId, round]);

  // Select / deselect an index
  const toggleSelectIndex = useCallback((idx) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Mulligan: advance the round and pick the next block deterministically.
  const handleMulligan = useCallback(() => {
    // disallow mulligan after first keep (allowMulligan toggles to false)
    if (!allowMulligan) return;
    // NOTE: parent may want to keep track - we only manage displayed hand here
    const nextRound = round + 1;
    setRound(nextRound);
    // If we were initialized from `areas`, we cannot reconstruct sideLibrary here
    // unless the caller passed it; assume caller will call updateHandDisplay if needed.
    // For fallback, we will rotate the current openingHand by count so players see different cards.
    const count = openingHand.length || 5;
    // If we have no openingHand items, do nothing
    if (!Array.isArray(openingHand) || openingHand.length === 0) return;
    // Use current openingHand as placeholder deck if no library supplied
    // rotate by count*1 to simulate new pick
    const deckSimulation = []; // build simulated deck from openingHand + placeholders
    // naive: repeat openingHand to simulate larger deck
    for (let i = 0; i < Math.max(10, count * 3); i++) {
      deckSimulation.push(openingHand[i % openingHand.length]);
    }
    const picked = pickOpeningHand(deckSimulation, count, nextRound).map(normalizeCardEntry);
    setOpeningHand(picked);
    setSelectedIndexes(new Set());
    setRound(nextRound);
    // After a mulligan, typical rules prevent further mulligans? We'll keep allowMulligan true for now
  }, [allowMulligan, round, openingHand]);

  // Keep/Finalize: call onFinalize if provided, otherwise try to mutate areas locally
  const handleKeep = useCallback(async () => {
    // Build chosen cards list
    const chosen = [];
    if (selectedIndexes.size === 0) {
      // If nothing selected, default to first N
      for (let i = 0; i < openingHand.length; i++) chosen.push(openingHand[i]);
    } else {
      Array.from(selectedIndexes).sort((a, b) => a - b).forEach((i) => {
        if (openingHand[i]) chosen.push(openingHand[i]);
      });
    }

    // call parent's finalize handler if present
    if (typeof onFinalize === 'function') {
      try {
        await onFinalize({
          side,
          chosenCards: chosen,
          round
        });
      } catch (e) {
        console.warn('[OpeningHand] onFinalize error:', e);
      }
    } else if (typeof setAreas === 'function') {
      // fallback: attempt to move chosen cards from top-of-deck to hand in the UI areas
      try {
        setAreas((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          const sideRoot = next[side];
          if (!sideRoot) return prev;
          // top deck array
          const deck = sideRoot.middle?.deck || [];
          const hand = sideRoot.bottom?.hand || [];
          // Pull chosen by matching id (best-effort)
          const chosenIds = new Set(chosen.map(c => c.cardId || c.id));
          const move = [];
          // find matches in deck up to chosen length
          for (let i = 0; i < deck.length && move.length < chosen.length; i++) {
            const card = deck[i];
            if (chosenIds.has(card?.cardId || card?.id)) {
              move.push(card);
            }
          }
          // Remove moved from deck and push to hand
          if (move.length > 0) {
            next[side].middle.deck = deck.filter(d => !move.includes(d));
            next[side].bottom.hand = [...move, ...hand];
          }
          return next;
        });
      } catch (e) {
        console.warn('[OpeningHand] fallback applying opening hand failed:', e);
      }
    }

    // Close the modal and disable further mulligans
    setOpeningHandShown && setOpeningHandShown(false);
    setAllowMulligan(false);
  }, [selectedIndexes, openingHand, onFinalize, setAreas, side, round, setOpeningHandShown]);

  if (!openingHandShown) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.7)'
      }}
    >
      <Paper sx={{ p: 3, maxWidth: '90vw', width: 900 }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Opening Hand
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose your opening hand. Mulligan rotates to the next block of cards.
          </Typography>

          {/* Card display */}
          <Grid container spacing={2} justifyContent="center" sx={{ pt: 1 }}>
            {openingHand.length === 0 ? (
              <Typography color="text.secondary">No cards available</Typography>
            ) : openingHand.map((card, idx) => {
              const isSelected = selectedIndexes.has(idx);
              const thumb = card?.thumb || card?.full || (card.cardId ? `/api/cards/assets/${card.cardId}.png` : '');
              return (
                <Grid item key={idx}>
                  <Box sx={{ width: CARD_W }}>
                    <img
                      src={thumb}
                      alt={card?.id || card?.cardId || `card-${idx}`}
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        borderRadius: 6,
                        border: isSelected ? '3px solid #4caf50' : '2px solid #ddd'
                      }}
                      onMouseEnter={() => setHovered?.(card)}
                      onMouseLeave={() => setHovered?.(null)}
                    />
                    <FormControlLabel
                      control={<Checkbox checked={isSelected} onChange={() => toggleSelectIndex(idx)} />}
                      label={<Typography variant="caption">{card?.cardId || card?.id || ''}</Typography>}
                    />
                  </Box>
                </Grid>
              );
            })}
          </Grid>

          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => {
              if (allowMulligan) {
                handleMulligan();
              }
            }} disabled={!allowMulligan}>
              Mulligan
            </Button>
            <Button variant="contained" onClick={handleKeep}>
              Keep Hand
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
});

OpeningHand.displayName = 'OpeningHand';
export default OpeningHand;
