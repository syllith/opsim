// OP09-008.jsx — Building Snake
// UI for [Activate: Main]: Bottom-deck this character → give up to one opponent Character -3000 this turn.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function OP09008Action() {
  const [onField, setOnField] = useState(true);
  const [target, setTarget] = useState('');

  const canActivate = onField;
  const onActivate = () => {
    // eslint-disable-next-line no-console
    console.log('[OP09-008] Activated: bottom-deck self, apply -3000 to', target || '(none)');
    setOnField(false);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-008 — Building Snake</Typography>
      <Typography variant="caption" color="text.secondary">Character • Slash • Red Hair Pirates • Cost 1 • Power 2000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <Chip label="Activate: Main" size="small" color="primary" />
          <Chip label={onField ? 'On Field' : 'Bottom of Deck'} color={onField ? 'success' : 'default'} size="small" />
        </Stack>
        <TextField size="small" label="Opponent Character (name/id)" value={target} onChange={(e) => setTarget(e.target.value)} fullWidth />
        <Button size="small" variant="contained" disabled={!canActivate || !target} onClick={onActivate}>Place self bottom; give -3000</Button>
      </Stack>
    </Box>
  );
}
