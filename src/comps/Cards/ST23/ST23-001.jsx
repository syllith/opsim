// ST23-001.jsx — Uta
// UI for static cost reduction condition and Blocker keyword.
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Chip, Button, TextField } from '@mui/material';

const BASE_COST = 6;

export default function ST23001Action() {
  const [allyHas10000, setAllyHas10000] = useState(false);
  const effectiveCost = useMemo(() => (allyHas10000 ? Math.max(0, BASE_COST - 4) : BASE_COST), [allyHas10000]);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>ST23-001 — Uta</Typography>
      <Typography variant="caption" color="text.secondary">Character • FILM • Cost 6 • Power 4000 • Blocker</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <Chip label={`Effective Cost: ${effectiveCost}`} size="small" color="primary" />
          <Chip label={allyHas10000 ? '>=10000 Power Ally Present' : 'No 10000+ Ally'} size="small" color={allyHas10000 ? 'success' : 'default'} />
          <Button size="small" variant="text" onClick={() => setAllyHas10000((v) => !v)}>{allyHas10000 ? 'Unset' : 'Set'} Condition</Button>
        </Stack>
        <Typography variant="body2">If you have a Character with 10000 power or more, this card in hand costs 4 less.</Typography>
        <Typography variant="body2">[Blocker] When your opponent declares an attack, you may rest this to become the new target.</Typography>
      </Stack>
    </Box>
  );
}
