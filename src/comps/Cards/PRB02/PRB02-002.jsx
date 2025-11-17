// PRB02-002.jsx — Trafalgar Law
// UI for Replacement Once/Turn: if would be removed by opponent's effect, can give self -2000 instead; and [When Attacking]: give -2000 to an opponent's Character this turn.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function PRB02002Action() {
  const [onceUsed, setOnceUsed] = useState(false);
  const [removeEventPending, setRemoveEventPending] = useState(false);
  const [attackTarget, setAttackTarget] = useState('');

  const applyReplacement = () => {
    if (onceUsed || !removeEventPending) return;
    // eslint-disable-next-line no-console
    console.log('[PRB02-002] Replacement: prevent removal; give self -2000 for this turn');
    setOnceUsed(true);
    setRemoveEventPending(false);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>PRB02-002 — Trafalgar Law</Typography>
      <Typography variant="caption" color="text.secondary">Character • Slash • Punk Hazard/Seven Warlords/Heart Pirates • Cost 6 • Power 7000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="overline">Replacement Effect</Typography>
          <Typography variant="body2">Once Per Turn: If this would be removed by an opponent's effect, you may give this -2000 power during this turn instead.</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label={onceUsed ? 'Used This Turn' : 'Available'} size="small" color={onceUsed ? 'default' : 'success'} />
            <Chip label={removeEventPending ? 'Removal pending' : 'No removal event'} size="small" />
            <Button size="small" variant="outlined" onClick={() => setRemoveEventPending(true)}>Simulate Removal Event</Button>
            <Button size="small" variant="contained" disabled={onceUsed || !removeEventPending} onClick={applyReplacement}>Apply Replacement</Button>
            <Button size="small" variant="text" onClick={() => setOnceUsed(false)}>Reset Once/Turn</Button>
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline">When Attacking</Typography>
          <TextField size="small" label="Opponent Character (name/id)" value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)} fullWidth />
          <Button size="small" variant="contained" disabled={!attackTarget} onClick={() => console.log('[PRB02-002] When Attacking: -2000 to', attackTarget)}>Apply -2000</Button>
        </Box>
      </Stack>
    </Box>
  );
}
