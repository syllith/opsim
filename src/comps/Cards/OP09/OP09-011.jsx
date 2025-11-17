// OP09-011.jsx — Hongo
// UI for [Activate: Main]: Rest this Character; if Leader has type "Red Haired Pirates", give -2000 to up to 1 opponent Character for this turn.
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function OP09011Action() {
  const [isActive, setIsActive] = useState(true);
  const [leaderHasType, setLeaderHasType] = useState(true);
  const [target, setTarget] = useState('');

  const canActivate = useMemo(() => isActive && leaderHasType, [isActive, leaderHasType]);

  const onActivate = () => {
    // eslint-disable-next-line no-console
    console.log('[OP09-011] Rest self; apply -2000 to', target || '(none)');
    setIsActive(false);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-011 — Hongo</Typography>
      <Typography variant="caption" color="text.secondary">Character • Strike • Red Hair Pirates • Cost 3 • Power 3000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <Chip label={isActive ? 'Active' : 'Rested'} size="small" color={isActive ? 'success' : 'default'} />
          <Chip label={leaderHasType ? 'Leader: Red Hair Pirates' : 'Leader: other'} size="small" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="text" onClick={() => setIsActive(true)}>Set Active</Button>
          <Button size="small" variant="text" onClick={() => setIsActive(false)}>Set Rested</Button>
          <Button size="small" variant="text" onClick={() => setLeaderHasType((v) => !v)}>
            {leaderHasType ? 'Unset Leader Type' : 'Set Leader Type'}
          </Button>
        </Stack>
        <TextField size="small" label="Opponent Character (name/id)" value={target} onChange={(e) => setTarget(e.target.value)} fullWidth />
        <Button size="small" variant="contained" disabled={!canActivate || !target} onClick={onActivate}>Rest self; give -2000</Button>
      </Stack>
    </Box>
  );
}
