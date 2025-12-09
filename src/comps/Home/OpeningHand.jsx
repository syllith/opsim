import React, {
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle
} from 'react';
import _ from 'lodash';
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
  currentHandSide, // 'player' or 'opponent' - which side is currently selecting
  onHandSelected, // Called when a hand is confirmed - for multi-hand flow
  firstPlayer, // Who goes first (for determining turn start after both hands selected)
  CARD_W = 120
}, ref) => {
  const [allowMulligan, setAllowMulligan] = useState(true);
  const [openingHand, setOpeningHand] = useState([]);
  const [activeSide, setActiveSide] = useState('player'); // Track which side is selecting

  //. Resolves an array of ids into card assets
  const resolveAssets = useCallback((ids) => {
    return _.chain(ids)
      .map((id) => getAssetForId(id))
      .filter(Boolean)
      .value();
  }, [getAssetForId]);

  //. Initialize opening hand for a specific side
  const initialize = useCallback((sideLibrary, side = 'player') => {
    //. Use the passed library directly (it should already be the correct one for the side)
    const lastFiveIds = _.takeRight(sideLibrary, 5);
    const assets = _.take(resolveAssets(lastFiveIds), 5);

    setOpeningHand(assets);
    setOpeningHandShown(true);
    setAllowMulligan(true);
    setActiveSide(side);
  }, [resolveAssets, setOpeningHandShown]);

  //. Check if opening hand is currently shown
  const isOpen = useCallback(() => openingHandShown, [openingHandShown]);

  //. Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      initialize,
      isOpen
    }),
    [initialize, isOpen]
  );

  //. Get the current library based on active side
  const getCurrentLibrary = useCallback(() => {
    return activeSide === 'player' ? library : oppLibrary;
  }, [activeSide, library, oppLibrary]);

  //. Get the set library function based on active side
  const setCurrentLibrary = useCallback((updater) => {
    if (activeSide === 'player') {
      setLibrary(updater);
    } else {
      setOppLibrary(updater);
    }
  }, [activeSide, setLibrary, setOppLibrary]);

  //. Handle mulligan
  const handleMulligan = useCallback(() => {
    if (!allowMulligan) { return; }

    //. Put current 5 to bottom, draw new 5, must keep
    setCurrentLibrary((prev) => {
      const cur5 = _.takeRight(prev, 5);
      const rest = _.dropRight(prev, 5);
      const lib = [...cur5, ...rest]; //. bottom is front, top is end

      const draw5Ids = _.takeRight(lib, 5);
      const newHand = _.take(resolveAssets(draw5Ids), 5);

      setOpeningHand(newHand);
      setAllowMulligan(false);

      return lib;
    });
  }, [allowMulligan, setCurrentLibrary, resolveAssets]);

  //. Handle keep for current side
  const handleKeep = useCallback(() => {
    const side = currentHandSide || activeSide;
    const currentLib = getCurrentLibrary();

    //. Move openingHand to this side's hand and set up life
    setAreas((prev) => {
      const next = _.cloneDeep(prev);

      if (side === 'player') {
        //. Player hand gets opening 5
        next.player.bottom.hand = _.take(openingHand, 5);

        //. Life is next 5 cards below hand (positions -10 to -5)
        const lifeIds = currentLib.slice(-10, -5);
        const life = _.chain(lifeIds)
          .map((id) => getAssetForId(id))
          .filter(Boolean)
          .reverse()
          .value();
        next.player.life = life;

        //. Shrink deck visual: -10 (5 hand, 5 life)
        const remain = Math.max(0, (next.player.middle.deck || []).length - 10);
        next.player.middle.deck = createCardBacks(remain);
      } else {
        //. Opponent hand gets opening 5
        next.opponent.top.hand = _.take(openingHand, 5);

        //. Life is next 5 cards below hand
        const lifeIds = currentLib.slice(-10, -5);
        const life = _.chain(lifeIds)
          .map((id) => getAssetForId(id))
          .filter(Boolean)
          .reverse()
          .value();
        next.opponent.life = life;

        //. Shrink deck visual: -10 (5 hand, 5 life)
        const remain = Math.max(0, (next.opponent.middle.deck || []).length - 10);
        next.opponent.middle.deck = createCardBacks(remain);
      }

      return next;
    });

    //. Remove 10 from this side's library (5 to hand, 5 to life)
    setCurrentLibrary((prev) => prev.slice(0, -10));

    //. Close the opening hand UI
    setOpeningHandShown(false);

    //. Notify parent that this hand selection is complete
    if (onHandSelected) {
      onHandSelected(side);
    }
  }, [
    currentHandSide,
    activeSide,
    openingHand,
    getCurrentLibrary,
    setAreas,
    setCurrentLibrary,
    getAssetForId,
    createCardBacks,
    setOpeningHandShown,
    onHandSelected
  ]);

  if (!openingHandShown) { return null; }

  const side = currentHandSide || activeSide;
  const sideLabel = side === 'player' ? 'Bottom Player' : 'Top Player';

  return (
    <Paper
      variant='outlined'
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
        borderColor: side === 'player' ? '#90caf9' : '#f48fb1'
      }}
    >
      {/* Header with title and buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, px: 1 }}>
        <Box>
          <Typography
            variant='caption'
            fontWeight={700}
            sx={{ fontSize: 15, lineHeight: 1.1 }}
          >
            {sideLabel} - Opening Hand {allowMulligan ? '' : '(Mulligan used)'}
          </Typography>
          <Typography
            variant='caption'
            sx={{ fontSize: 11, opacity: 0.8, display: 'block' }}
          >
            Keep this hand or mulligan (return 5, draw 5 new)
          </Typography>
        </Box>
        <Stack direction='row' spacing={1}>
          <Button
            size='small'
            variant='outlined'
            onClick={handleMulligan}
            disabled={!allowMulligan}
          >
            Mulligan
          </Button>
          <Button
            size='small'
            variant='contained'
            onClick={handleKeep}
          >
            Keep
          </Button>
        </Stack>
      </Box>

      {/* Card display area */}
      <Box sx={{ display: 'flex', gap: 1, px: 1, pb: 1, overflowX: 'auto' }}>
        {_.take(openingHand, 5).map((c, idx) => (
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
