// OP09-004.jsx — Shanks
// UI to reflect Rush keyword and continuous debuff to opponent Characters (-1000) as a card presence effect.
import React from 'react';
import { Box, Typography, Stack, Divider, Chip } from '@mui/material';

export default function OP09004Action() {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-004 — Shanks</Typography>
      <Typography variant="caption" color="text.secondary">Character • Slash • The Four Emperors/Red Hair Pirates • Cost 10 • Power 12000 • Rush</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <Chip label="Rush" size="small" color="warning" />
          <Chip label="All opponent Characters: -1000 power (while present)" size="small" color="info" />
        </Stack>
        <Typography variant="body2">This UI reflects a continuous debuff to all opponent Characters while this card is on the field. No action needed to toggle.</Typography>
      </Stack>
    </Box>
  );
}
