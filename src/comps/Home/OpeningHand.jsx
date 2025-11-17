import React from 'react';
import { Box, Paper, Stack, Typography, Button } from '@mui/material';

export default function OpeningHand({ open, hand = [], allowMulligan, onMulligan, onKeep }) {
  if (!open) return null;
  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)' }}>
      <Paper sx={{ p: 2, width: 600, maxWidth: '95vw' }}>
        <Typography variant="h6">Opening Hand {allowMulligan ? '' : '(Mulligan used)'}</Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
          {hand.slice(0, 5).map((c, idx) => (
            <img key={`${c?.id || 'card'}-${idx}`} src={c?.thumb} alt={c?.id} style={{ width: 120, height: 'auto', borderRadius: 4 }} />
          ))}
        </Stack>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Choose Keep to keep this hand. Mulligan puts these 5 at the bottom and draws 5 new cards; you must keep the redraw.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={onMulligan} disabled={!allowMulligan}>Mulligan</Button>
          <Button variant="contained" onClick={onKeep}>Keep</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
