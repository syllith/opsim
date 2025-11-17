// OP01-006.jsx — Otama
// Action UI for OP01-006 (Otama) [On Play] effect and playability
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip } from '@mui/material';

export default function OP01006Action({ 
  phase, 
  actionSource, 
  areas, 
  startTargeting, 
  confirmTargeting, 
  cancelTargeting, 
  targeting,
  applyPowerMod,
  getCardMeta 
}) {
  // Track if On Play has been used (once per play)
  const [onPlayUsed, setOnPlayUsed] = useState(false);

  // Card stats
  const COST = 1;
  const POWER = 0;
  const COUNTER = 2000;

  // Determine context
  const isMain = String(phase).toLowerCase() === 'main';
  const isInHand = actionSource && 
    ((actionSource.side === 'player' && actionSource.section === 'bottom' && actionSource.keyName === 'hand') ||
     (actionSource.side === 'opponent' && actionSource.section === 'top' && actionSource.keyName === 'hand'));
  const isOnField = actionSource && actionSource.section === 'char';

  // Check if opponent has characters to target
  const oppChars = useMemo(() => (areas?.opponent?.char || []), [areas]);
  const hasTargets = oppChars.length > 0;

  // Handler for On Play ability
  const activateOnPlay = () => {
    if (!isOnField || !isMain || onPlayUsed) return;
    
    startTargeting(
      { side: 'opponent', section: 'char', keyName: 'char', min: 0, max: 1 }, 
      (selected) => {
        const first = Array.isArray(selected) && selected[0]?.card ? selected[0].card : null;
        if (first) {
          // Apply -2000 power modification to the selected character
          applyPowerMod('opponent', 'char', 'char', selected[0].index, -2000);
          // eslint-disable-next-line no-console
          console.log('[OP01-006 Otama] On Play: -2000 power applied to', first.id);
        } else {
          // eslint-disable-next-line no-console
          console.log('[OP01-006 Otama] On Play: resolved with no target');
        }
        setOnPlayUsed(true);
      }
    );
  };

  // Handler to resolve with no target
  const resolveNoTarget = () => {
    if (!isOnField || !isMain || onPlayUsed) return;
    // eslint-disable-next-line no-console
    console.log('[OP01-006 Otama] On Play: resolved with no target (chosen)');
    setOnPlayUsed(true);
  };

  return (
    <Box>
      {/* Card Header */}
      <Typography variant="subtitle2" fontWeight={700}>
        OP01-006 — Otama
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Character • Special • Wano Country • Cost {COST} • Power {POWER}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Counter: +{COUNTER}
      </Typography>
      <Divider sx={{ my: 1 }} />

      <Stack spacing={1.5}>
        {/* When card is in hand */}
        {isInHand && (
          <Box>
            <Typography variant="overline" color="info.main">In Hand</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              You can play this card during your Main Phase if you have {COST} available DON!!.
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Once played to the Character Area, you can immediately activate the [On Play] ability.
            </Typography>
          </Box>
        )}

        {/* On Play Ability Section */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Chip label="On Play" size="small" color="primary" />
            {isOnField && (
              <Chip 
                label={onPlayUsed ? 'Used' : 'Ready'} 
                size="small" 
                color={onPlayUsed ? 'default' : 'success'} 
              />
            )}
          </Stack>

          <Typography variant="body2" sx={{ mb: 1 }}>
            Give up to 1 of your opponent's Characters -2000 power during this turn.
          </Typography>

          {/* Action buttons - only show when card is on field */}
          {isOnField && (
            <>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button 
                  size="small" 
                  variant="contained" 
                  disabled={!isMain || onPlayUsed || !hasTargets}
                  onClick={activateOnPlay}
                >
                  {targeting?.active ? 'Targeting…' : 'Select Target (-2000 power)'}
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  disabled={!targeting?.active} 
                  onClick={confirmTargeting}
                >
                  Confirm Selection
                </Button>
                <Button 
                  size="small" 
                  variant="text" 
                  disabled={!isMain || onPlayUsed}
                  onClick={resolveNoTarget}
                >
                  Resolve (no target)
                </Button>
              </Stack>

              {/* Status messages */}
              {!isMain && (
                <Typography variant="caption" color="error.main" display="block" sx={{ mt: 1 }}>
                  Can only activate during Main Phase
                </Typography>
              )}
              {isMain && !hasTargets && !onPlayUsed && (
                <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 1 }}>
                  No opponent Characters available. Click "Resolve (no target)" to continue.
                </Typography>
              )}
              {onPlayUsed && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  On Play ability has been resolved.
                </Typography>
              )}
            </>
          )}

          {/* Guidance when in hand */}
          {isInHand && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, fontStyle: 'italic' }}>
              💡 After playing this card, you'll be able to select an opponent's Character to give -2000 power.
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Additional Card Information */}
        <Box>
          <Typography variant="overline">Card Details</Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            <Typography variant="caption">
              • <strong>Colors:</strong> Red
            </Typography>
            <Typography variant="caption">
              • <strong>Rarity:</strong> Uncommon (UC)
            </Typography>
            <Typography variant="caption">
              • <strong>Type:</strong> Wano Country
            </Typography>
          </Stack>
        </Box>

        {/* Tactical Tips */}
        <Box>
          <Typography variant="overline">Strategy Tips</Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            <Typography variant="caption">
              • Low cost (1) makes Otama easy to play early game
            </Typography>
            <Typography variant="caption">
              • The -2000 power can help KO weak Characters or make attacks safer
            </Typography>
            <Typography variant="caption">
              • Counter value of +2000 provides defensive utility from hand
            </Typography>
            <Typography variant="caption">
              • Can be played even if no valid targets exist
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
