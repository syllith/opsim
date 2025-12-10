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
  currentHandSide, // 'player' or 'opponent' or 'both' - which side is currently selecting
  onHandSelected, // Called when a hand is confirmed - for multi-hand flow
  firstPlayer, // Who goes first (for determining turn start after both hands selected)
  CARD_W = 120,
  isMultiplayer = false, // Is this a multiplayer game?
  isHost = true, // Is this the host in multiplayer?
  onGuestAction, // Callback for guest to send actions to host
  playerHandSelected = false, // Has host selected their hand?
  opponentHandSelected = false, // Has guest selected their hand?
  onLocalHandSelected = null,
  setupPhase = null, // Current setup phase - 'complete' means don't show
  onBroadcastStateRef = null // Ref for host to broadcast state after selecting hand (uses ref to avoid stale closures)
}, ref) => {
  const [allowMulligan, setAllowMulligan] = useState(true);
  const [openingHand, setOpeningHand] = useState([]);
  const [activeSide, setActiveSide] = useState('player'); // Track which side is selecting
  const [hasSelected, setHasSelected] = useState(false); // Track if this player has selected

  //. Resolves an array of ids into card assets
  const resolveAssets = useCallback((ids) => {
    return _.chain(ids)
      .map((id) => getAssetForId(id))
      .filter(Boolean)
      .value();
  }, [getAssetForId]);

  //. Initialize opening hand for a specific side
  //. In multiplayer, this should only be called once per game for each side
  const initialize = useCallback((sideLibrary, side = 'player') => {
    //. Prevent re-initialization if player has already selected their hand
    if (hasSelected) {
      console.log('[OpeningHand] Ignoring initialize - already selected');
      return;
    }
    
    //. Use the passed library directly (it should already be the correct one for the side)
    const lastFiveIds = _.takeRight(sideLibrary, 5);
    const assets = _.take(resolveAssets(lastFiveIds), 5);

    setOpeningHand(assets);
    setOpeningHandShown(true);
    setAllowMulligan(true);
    setActiveSide(side);
    // Don't reset hasSelected here - it should persist to prevent re-init
  }, [resolveAssets, setOpeningHandShown, hasSelected]);

  //. Force reset the component state (only call when starting a new game)
  const reset = useCallback(() => {
    setOpeningHand([]);
    setAllowMulligan(true);
    setActiveSide('player');
    setHasSelected(false);
  }, []);

  //. Update hand display without resetting mulligan state (for syncing after mulligan)
  const updateHandDisplay = useCallback((sideLibrary) => {
    const lastFiveIds = _.takeRight(sideLibrary, 5);
    const assets = _.take(resolveAssets(lastFiveIds), 5);
    setOpeningHand(assets);
  }, [resolveAssets]);

  //. Check if opening hand is currently shown
  const isOpen = useCallback(() => openingHandShown, [openingHandShown]);

  //. Check if player has already selected
  const getHasSelected = useCallback(() => hasSelected, [hasSelected]);

  //. Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      initialize,
      updateHandDisplay,
      isOpen,
      reset,
      getHasSelected
    }),
    [initialize, updateHandDisplay, isOpen]
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

    //. In multiplayer, each player can mulligan their OWN library
    //. Host controls 'player' library, Guest controls 'opponent' library
    //. Guest sends mulligan action to host who applies it and syncs back
    if (isMultiplayer && !isHost) {
      //. Guest can mulligan - send action to host and disable mulligan immediately
      setAllowMulligan(false);
      if (onGuestAction) {
        onGuestAction({ type: 'mulligan', side: 'opponent' });
      }
      //. Don't update locally - wait for host to sync the new state back
      return;
    }

    //. Host or single-player: apply mulligan directly
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
  }, [allowMulligan, setCurrentLibrary, resolveAssets, isMultiplayer, isHost, onGuestAction]);

  //. Handle keep for current side
  const handleKeep = useCallback(() => {
    //. Prevent double-clicks or re-selection
    if (hasSelected) { return; }
    
    const side = currentHandSide === 'both' ? activeSide : (currentHandSide || activeSide);

    //. In multiplayer, guest sends action to host
    if (isMultiplayer && !isHost) {
      if (onGuestAction) {
        //. Send the mulligan state so host knows if guest mulliganed
        onGuestAction({ type: 'handSelected', side: 'opponent', mulliganUsed: !allowMulligan });
      }
      if (typeof onLocalHandSelected === 'function') {
        onLocalHandSelected('opponent');
      }
      //. Mark as selected locally to show waiting state
      setHasSelected(true);
      return;
    }

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

    //. In multiplayer, DON'T close the UI here - parent will handle it when both players are ready
    //. In non-multiplayer, close immediately
    if (!isMultiplayer) {
      setOpeningHandShown(false);
    } else {
      //. Mark that this player has selected
      setHasSelected(true);
      
      //. Host broadcasts updated state so guest can see the hand (as card backs)
      if (isHost && onBroadcastStateRef?.current) {
        setTimeout(() => onBroadcastStateRef.current(), 100);
      }
    }

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
    onHandSelected,
    isMultiplayer,
    isHost,
    onGuestAction,
    onBroadcastStateRef,
    hasSelected,
    allowMulligan
  ]);

  // Don't show if not supposed to be shown
  if (!openingHandShown) { return null; }
  
  // Don't show if setup phase is complete (game has started)
  if (setupPhase === 'complete') { return null; }

  const side = currentHandSide || activeSide;
  
  // For simultaneous selection (multiplayer), each player sees their own side
  // 'both' means both players are selecting at the same time
  const displaySide = (currentHandSide === 'both') ? activeSide : side;

  // In multiplayer simultaneous selection mode
  if (isMultiplayer && currentHandSide === 'both') {
    // Check if this player has already selected (use prop values which are synced)
    const iHaveSelected = isHost ? playerHandSelected : opponentHandSelected;
    const opponentHasSelected = isHost ? opponentHandSelected : playerHandSelected;
    
    // If both have selected, the game should be starting - don't show anything
    if (iHaveSelected && opponentHasSelected) {
      return null;
    }
    
    if (iHaveSelected || hasSelected) {
      // Show waiting message
      return (
        <Paper
          variant='outlined'
          sx={{
            p: 2,
            bgcolor: 'rgba(44,44,44,0.85)',
            color: 'white',
            width: 'fit-content',
            maxWidth: '100%',
            textAlign: 'center'
          }}
        >
          <Typography variant="h6" sx={{ color: '#4caf50', mb: 1 }}>
            ✓ Hand Selected!
          </Typography>
          <Typography variant="body1">
            {opponentHasSelected 
              ? 'Both players ready - game starting...' 
              : 'Waiting for opponent to select their hand...'}
          </Typography>
        </Paper>
      );
    }
  } else if (isMultiplayer && currentHandSide !== 'both') {
    // Sequential selection mode - only show to the player whose turn it is
    const isMyTurnToSelect = isHost ? (side === 'player') : (side === 'opponent');
    if (!isMyTurnToSelect) {
      // Show waiting message instead
      return (
        <Paper
          variant='outlined'
          sx={{
            p: 2,
            bgcolor: 'rgba(44,44,44,0.85)',
            color: 'white',
            width: 'fit-content',
            maxWidth: '100%',
            textAlign: 'center'
          }}
        >
          <Typography variant="h6">
            Waiting for opponent to select their opening hand...
          </Typography>
        </Paper>
      );
    }
  }

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
        borderColor: displaySide === 'player' ? '#90caf9' : '#f48fb1'
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
            Opening Hand {allowMulligan ? '' : '(Mulligan used)'}
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
