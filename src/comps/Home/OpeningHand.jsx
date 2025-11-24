import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Paper, Stack, Typography, Button } from '@mui/material';

const OpeningHand = forwardRef(({ 
  library,
  setLibrary,
  oppLibrary,
  setOppLibrary,
  areas,
  setAreas,
  getAssetForId,
  createCardBacks,
  setTurnSide,
  setTurnNumber,
  executeRefreshPhase,
  setPhase,
  setHovered,
  openingHandShown,
  setOpeningHandShown,
  CARD_W = 120 
}, ref) => {
  const [allowMulligan, setAllowMulligan] = useState(true);
  const [openingHand, setOpeningHand] = useState([]);

  // Initialize opening hand (called from parent when game is ready)
  const initialize = useCallback((playerLibrary) => {
    const p5 = playerLibrary.slice(-5);
    setOpeningHand(p5.map((id) => getAssetForId(id)).filter(Boolean).slice(0, 5));
    setOpeningHandShown(true);
    setAllowMulligan(true);
  }, [getAssetForId, setOpeningHandShown]);

  // Check if opening hand is currently shown
  const isOpen = useCallback(() => openingHandShown, [openingHandShown]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    initialize,
    isOpen
  }), [initialize, isOpen]);

  // Handle mulligan
  const handleMulligan = useCallback(() => {
    if (!allowMulligan) return;
    // Put current 5 to bottom, draw new 5, must keep
    setLibrary((prev) => {
      const lib = prev.slice();
      const cur5 = lib.splice(-5, 5);
      lib.unshift(...cur5); // bottom is front of array (we treat top as end)
      const draw5 = lib.slice(-5);
      const newHand = draw5.map((id) => getAssetForId(id)).filter(Boolean).slice(0, 5);
      setOpeningHand(newHand);
      setAllowMulligan(false);
      return lib;
    });
  }, [allowMulligan, setLibrary, getAssetForId]);

  // Handle keep
  const handleKeep = useCallback(() => {
    // Close opening hand immediately to allow game actions
    setOpeningHandShown(false);
    
    // Move openingHand to player's hand area; set Life (5) for both players; shrink deck stacks accordingly
    setAreas((prev) => {
      const next = structuredClone(prev);
      // Player hand gets opening 5
      next.player.bottom.hand = openingHand.slice(0, 5);
      // Compute top 5 (life) for each side from current libraries
      // Rule 5-2-1-7: "the card at the top of their deck is at the bottom in their Life area"
      // Opening hand are the last 5; life should be the next 5 below that
      const pLifeIds = library.slice(-10, -5);
      const oLifeIds = oppLibrary.slice(-5);
      // Reverse the order so top of deck (last element) becomes bottom of life area (first element)
      const pLife = pLifeIds.map((id) => getAssetForId(id)).filter(Boolean).reverse();
      const oLife = oLifeIds.map((id) => getAssetForId(id)).filter(Boolean).reverse();
      next.player.life = pLife;
      next.opponent.life = oLife;
      // Shrink deck visuals: player's deck -10 (5 hand, 5 life); opponent deck already -5 (hand), so -5 more (life)
      const pRemain = Math.max(0, (next.player.middle.deck || []).length - 10);
      next.player.middle.deck = createCardBacks(pRemain);
      const oRemain = Math.max(0, (next.opponent.middle.deck || []).length - 5);
      next.opponent.middle.deck = createCardBacks(oRemain);
      return next;
    });
    // Remove 10 from player's library (5 to hand, 5 to life), and 5 from opponent's (life)
    setLibrary((prev) => prev.slice(0, -10));
    setOppLibrary((prev) => prev.slice(0, -5));
    // Initialize turn state
    setTurnSide('player');
    setTurnNumber(1);

    // Execute Refresh Phase for first turn (rule 6-2)
    executeRefreshPhase('player');

    setPhase('Draw');
  }, [openingHand, library, oppLibrary, setAreas, setLibrary, setOppLibrary, getAssetForId, createCardBacks, setTurnSide, setTurnNumber, executeRefreshPhase, setPhase, setOpeningHandShown]);

  if (!openingHandShown) return null;
  
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        bgcolor: 'rgba(44,44,44,0.85)',
        color: 'white',
        width: 'fit-content',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        borderWidth: 2,
        borderColor: '#90caf9'
      }}
    >
      {/* Header with title and buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, px: 1 }}>
        <Box>
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: 15, lineHeight: 1.1 }}>
            Opening Hand {allowMulligan ? '' : '(Mulligan used)'}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
            Keep this hand or mulligan (return 5, draw 5 new)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={handleMulligan} disabled={!allowMulligan}>
            Mulligan
          </Button>
          <Button size="small" variant="contained" onClick={handleKeep}>
            Keep
          </Button>
        </Stack>
      </Box>

      {/* Card display area */}
      <Box sx={{ display: 'flex', gap: 1, px: 1, pb: 1, overflowX: 'auto' }}>
        {openingHand.slice(0, 5).map((c, idx) => (
          <img
            key={`${c?.id || 'card'}-${idx}`}
            src={c?.thumb || c?.full}
            alt={c?.id}
            style={{
              width: CARD_W,
              height: 'auto',
              borderRadius: 4,
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHovered && setHovered(c)}
            onMouseLeave={() => setHovered && setHovered(null)}
          />
        ))}
      </Box>
    </Paper>
  );
});

OpeningHand.displayName = 'OpeningHand';

export default OpeningHand;
