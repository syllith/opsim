// ST15-002.jsx — Edward Newgate
// UI for [On Play]: Give up to one rested DON!! to your Leader or a Character; [Activate: Main]: Rest this → KO up to one opponent Character with 5000 or less power.
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip, TextField } from '@mui/material';

export default function ST15002Action() {
  const [onFieldActive, setOnFieldActive] = useState(true);
  const [donInCostArea, setDonInCostArea] = useState(2);
  const [givenDon, setGivenDon] = useState(0);
  const [giveTarget, setGiveTarget] = useState('leader'); // 'leader' | 'character'
  const [giveChar, setGiveChar] = useState('');
  const [koTarget, setKoTarget] = useState('');
  const [koPower, setKoPower] = useState('');

  const canGiveDon = useMemo(() => donInCostArea > 0 && givenDon < 1, [donInCostArea, givenDon]);
  const canKO = useMemo(() => !onFieldActive, [onFieldActive]);

  const giveOneDon = () => {
    if (!canGiveDon) return;
    setDonInCostArea((n) => Math.max(0, n - 1));
    setGivenDon((n) => n + 1);
    // eslint-disable-next-line no-console
    console.log('[ST15-002] On Play: Give 1 rested DON!! to', giveTarget === 'leader' ? 'Leader' : giveChar);
  };

  const koLegal = () => {
    if (!koTarget) return false;
    const p = parseInt(koPower, 10);
    return !Number.isNaN(p) && p <= 5000;
  };

  const doKO = () => {
    // eslint-disable-next-line no-console
    console.log('[ST15-002] Activate: Rest self; KO target', { koTarget, koPower });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>ST15-002 — Edward Newgate</Typography>
      <Typography variant="caption" color="text.secondary">Character • Special • Four Emperors/Whitebeard Pirates • Cost 7 • Power 8000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="overline">On Play — Give DON!!</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={`DON in Cost: ${donInCostArea}`} size="small" />
            <Chip label={`Given: ${givenDon}/1`} size="small" />
            <Button size="small" variant={giveTarget === 'leader' ? 'contained' : 'outlined'} onClick={() => setGiveTarget('leader')}>Leader</Button>
            <Button size="small" variant={giveTarget === 'character' ? 'contained' : 'outlined'} onClick={() => setGiveTarget('character')}>Character</Button>
          </Stack>
          {giveTarget === 'character' && (
            <TextField size="small" label="Ally Character (name/id)" value={giveChar} onChange={(e) => setGiveChar(e.target.value)} fullWidth sx={{ mt: 1 }} />
          )}
          <Button size="small" variant="contained" disabled={!canGiveDon || (giveTarget === 'character' && !giveChar)} onClick={giveOneDon}>Give 1 rested DON!!</Button>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline">Activate: Main — K.O.</Typography>
          <Stack direction="row" spacing={1}>
            <Chip label={onFieldActive ? 'Active' : 'Rested'} size="small" color={onFieldActive ? 'success' : 'default'} />
            <Button size="small" variant="text" onClick={() => setOnFieldActive(true)}>Set Active</Button>
            <Button size="small" variant="text" onClick={() => setOnFieldActive(false)}>Rest this Character</Button>
          </Stack>
          <TextField size="small" label="Opponent Character (name/id)" value={koTarget} onChange={(e) => setKoTarget(e.target.value)} fullWidth sx={{ mt: 1 }} />
          <TextField size="small" label="Target Power" value={koPower} onChange={(e) => setKoPower(e.target.value)} />
          <Button size="small" variant="contained" disabled={!canKO || !koLegal()} onClick={doKO}>KO target ≤ 5000</Button>
        </Box>
      </Stack>
    </Box>
  );
}
