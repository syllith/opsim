// OP09-009.jsx — Benn Beckman
// UI for [On Play]: Trash up to 1 opponent Character with power <= 6000.
import React, { useMemo } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip } from '@mui/material';

export default function OP09009Action({ areas, startTargeting, confirmTargeting, targeting, getCardMeta, phase }) {
  const oppChars = useMemo(() => (areas?.opponent?.char || []), [areas]);
  const validExists = useMemo(() => oppChars.some(c => (getCardMeta?.(c.id)?.stats?.power || 0) <= 6000), [oppChars, getCardMeta]);
  const isMain = String(phase).toLowerCase() === 'main';

  const begin = () => {
    startTargeting({
      side: 'opponent', section: 'char', keyName: 'char', min: 1, max: 1,
      validator: (card) => ((getCardMeta?.(card.id)?.stats?.power || 0) <= 6000)
    }, (selected) => {
      const first = Array.isArray(selected) && selected[0]?.card ? selected[0].card : null;
      // eslint-disable-next-line no-console
      console.log('[OP09-009] On Play resolved: Trash target', first?.id || '(none)');
    });
  };
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-009 — Benn Beckman</Typography>
      <Typography variant="caption" color="text.secondary">Character • Ranged • Red Hair Pirates • Cost 7 • Power 7000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}><Chip label="On Play" size="small" color="primary" /><Chip label="Trash target <= 6000" size="small" /></Stack>
        <Typography variant="body2">Select 1 opponent Character with power ≤ 6000.</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={!isMain || !validExists} onClick={begin}>
            {targeting?.active ? 'Targeting…' : 'Use On Play'}
          </Button>
          <Button size="small" variant="outlined" disabled={!targeting?.active} onClick={confirmTargeting}>Confirm Selection</Button>
        </Stack>
        {!validExists && (
          <Typography variant="caption" color="text.secondary">No valid targets (≤ 6000 power) on opponent's field.</Typography>
        )}
      </Stack>
    </Box>
  );
}
