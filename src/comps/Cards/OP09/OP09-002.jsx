// OP09-002.jsx — Uta
// UI for [On Play]: Look top 5, reveal up to 1 "Red Haired Pirates" and add to hand; rest bottom.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function OP09002Action() {
  const [revealed, setRevealed] = useState('');
  const [countLook, setCountLook] = useState(5);

  const onResolve = () => {
    // eslint-disable-next-line no-console
    console.log('[OP09-002] On Play: Look top 5, reveal (optional) and add to hand', { revealed });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-002 — Uta</Typography>
      <Typography variant="caption" color="text.secondary">Character • FILM • Cost 1</Typography>
      <Divider sx={{ my: 1 }} />

      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <Chip label="On Play" size="small" color="primary" />
          <Chip label="Look top 5" size="small" />
        </Stack>

        <Typography variant="body2">Reveal up to 1 card with type "Red Haired Pirates" and add it to your hand. Place the rest on bottom in any order.</Typography>
        <TextField size="small" label="Revealed (name/id) — optional" value={revealed} onChange={(e) => setRevealed(e.target.value)} fullWidth />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" onClick={onResolve}>Resolve On Play</Button>
          <Chip label={`Looking at: ${countLook}`} size="small" />
        </Stack>
      </Stack>
    </Box>
  );
}
