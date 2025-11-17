// OP06-007.jsx — Shanks
// UI for [On Play]: KO up to 1 opponent Character with power <= 10000.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function OP06007Action() {
  const [target, setTarget] = useState('');
  const [power, setPower] = useState('');
  const legal = () => {
    if (!target) return false;
    const p = parseInt(power, 10);
    return !Number.isNaN(p) && p <= 10000;
  };
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP06-007 — Shanks</Typography>
      <Typography variant="caption" color="text.secondary">Character • Slash • FILM/Four Emperors/Red Hair Pirates • Cost 10 • Power 12000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}><Chip label="On Play" size="small" color="primary" /><Chip label="KO target ≤ 10000" size="small" /></Stack>
        <TextField size="small" label="Opponent Character (name/id)" value={target} onChange={(e) => setTarget(e.target.value)} fullWidth />
        <TextField size="small" label="Target Power" value={power} onChange={(e) => setPower(e.target.value)} />
        <Button size="small" variant="contained" disabled={!legal()} onClick={() => console.log('[OP06-007] On Play: KO', { target, power })}>Resolve On Play</Button>
      </Stack>
    </Box>
  );
}
