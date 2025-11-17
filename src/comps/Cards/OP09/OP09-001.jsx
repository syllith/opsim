// OP09-001.jsx — Shanks (Leader)
// Action UI for Once Per Turn reduction on opponent's attack.
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

const BASE_POWER = 5000;

export default function OP09001Action() {
  const [onceUsed, setOnceUsed] = useState(false);
  const [targetType, setTargetType] = useState('leader'); // 'leader' | 'character'
  const [targetChar, setTargetChar] = useState('');
  const [duringOppAttack, setDuringOppAttack] = useState(true);

  const canActivate = useMemo(() => duringOppAttack && !onceUsed, [duringOppAttack, onceUsed]);

  const onActivate = () => {
    const target = targetType === 'leader' ? 'Opponent Leader' : `Opp. Character: ${targetChar || '(select one)'}`;
    // eslint-disable-next-line no-console
    console.log('[OP09-001] Activated ability', { target, powerDelta: -1000 });
    setOnceUsed(true);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-001 — Shanks (Leader)</Typography>
      <Typography variant="caption" color="text.secondary">Leader • Slash • The Four Emperors/Red Hair Pirates • Life 5 • Power 5000</Typography>
      <Divider sx={{ my: 1 }} />

      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Chip label={`Power: ${BASE_POWER}`} color="primary" size="small" />
          <Chip label={duringOppAttack ? "Opponent's Attack Window" : 'Not attack window'} color={duringOppAttack ? 'info' : 'default'} size="small" />
          <Chip label={onceUsed ? 'Used This Turn' : 'Available'} color={onceUsed ? 'default' : 'success'} size="small" />
        </Stack>

        <Box>
          <Typography variant="overline">Activation (On Opponent's Attack)</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Button variant={targetType === 'leader' ? 'contained' : 'outlined'} size="small" onClick={() => setTargetType('leader')}>Opponent Leader</Button>
            <Button variant={targetType === 'character' ? 'contained' : 'outlined'} size="small" onClick={() => setTargetType('character')}>Opponent Character</Button>
          </Stack>
          {targetType === 'character' && (
            <TextField size="small" label="Target Character (name/id)" value={targetChar} onChange={(e) => setTargetChar(e.target.value)} sx={{ mt: 1 }} fullWidth />
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" size="small" disabled={!canActivate || (targetType === 'character' && !targetChar)} onClick={onActivate}>Give -1000 for the turn</Button>
            <Button variant="text" size="small" onClick={() => setDuringOppAttack((v) => !v)}>{duringOppAttack ? 'Leave Attack Window' : 'Enter Attack Window'}</Button>
            <Button variant="text" size="small" onClick={() => setOnceUsed(false)}>Reset Once/Turn</Button>
          </Stack>
        </Box>

        <Divider sx={{ my: 0.5 }} />
        <Typography variant="body2">Once Per Turn: When your opponent attacks, give up to 1 of their Leader/Characters -1000 power for the turn.</Typography>
      </Stack>
    </Box>
  );
}
