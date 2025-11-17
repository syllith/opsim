// OP09-014.jsx — Limejuice
// UI for [On Play]: target opp Character (<=4000) cannot activate Blocker for rest of this turn.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function OP09014Action() {
  const [target, setTarget] = useState('');
  const [targetPower, setTargetPower] = useState('');

  const legal = () => {
    const p = parseInt(targetPower, 10);
    return target && !Number.isNaN(p) && p <= 4000;
  };

  const onResolve = () => {
    // eslint-disable-next-line no-console
    console.log('[OP09-014] On Play: target cannot Block this turn', { target, targetPower });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-014 — Limejuice</Typography>
      <Typography variant="caption" color="text.secondary">Character • Strike • Red Hair Pirates • Cost 3 • Power 3000 • Blocker</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}><Chip label="On Play" size="small" color="primary" /><Chip label="Deny Blocker (rest of turn)" size="small" /></Stack>
        <TextField size="small" label="Opponent Character (name/id)" value={target} onChange={(e) => setTarget(e.target.value)} fullWidth />
        <TextField size="small" label="Target Power" value={targetPower} onChange={(e) => setTargetPower(e.target.value)} />
        <Button size="small" variant="contained" disabled={!legal()} onClick={onResolve}>Resolve On Play</Button>
      </Stack>
    </Box>
  );
}
