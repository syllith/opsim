// OP09-013.jsx — Yasopp
// UI for [On Play]: buff Leader +1000 until end of opponent's next turn; [When Attacking][DON!! x1]: give up to 1 opp Character -1000 this turn.
import React, { useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip } from '@mui/material';

export default function OP09013Action({ phase, actionSource, applyPowerMod, startTargeting, confirmTargeting, targeting, areas }) {
  const [donGiven, setDonGiven] = useState(0);
  const [availableDon, setAvailableDon] = useState(2);
  const [leaderBuffApplied, setLeaderBuffApplied] = useState(false);

  const donCondition = donGiven >= 1; // DON!! x1
  const canAttackEffect = donCondition;
  const isMain = String(phase).toLowerCase() === 'main';
  const isOnField = actionSource && actionSource.section === 'char';

  const incDon = () => setDonGiven((v) => Math.min(v + 1, availableDon));
  const decDon = () => setDonGiven((v) => Math.max(0, v - 1));

  const onPlayBuff = () => {
    if (!isOnField || !isMain) return;
    const side = actionSource.side || 'player';
    applyPowerMod(side, 'middle', 'leader', 0, +1000);
    setLeaderBuffApplied(true);
  };

  const onAttackEffect = () => {
    if (!donCondition) return;
    startTargeting({ side: 'opponent', section: 'char', keyName: 'char', min: 0, max: 1 }, (selected) => {
      const first = Array.isArray(selected) && selected[0]?.card ? selected[0].card : null;
      if (first) {
        applyPowerMod('opponent', 'char', 'char', selected[0].index, -1000);
      }
    });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP09-013 — Yasopp</Typography>
      <Typography variant="caption" color="text.secondary">Character • Ranged • Red Hair Pirates • Cost 5 • Power 6000</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="overline">On Play</Typography>
          <Stack direction="row" spacing={1}>
            <Chip label={leaderBuffApplied ? 'Buff Applied' : 'Buff Available'} size="small" color={leaderBuffApplied ? 'success' : 'default'} />
            <Button size="small" variant="contained" onClick={onPlayBuff} disabled={!isOnField || !isMain || leaderBuffApplied}>Buff Leader +1000</Button>
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline">When Attacking</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Chip label={`DON Given: ${donGiven}`} size="small" />
            <Chip label={donCondition ? 'DON!! x1 Met' : 'Needs DON!! x1'} size="small" color={donCondition ? 'success' : 'default'} />
            <Button size="small" variant="outlined" onClick={decDon} disabled={donGiven === 0}>-1 DON</Button>
            <Button size="small" variant="outlined" onClick={incDon} disabled={donGiven >= availableDon}>+1 DON</Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant="contained" disabled={!canAttackEffect} onClick={onAttackEffect}>{targeting?.active ? 'Targeting…' : 'Apply -1000 (pick target)'}</Button>
            <Button size="small" variant="outlined" disabled={!targeting?.active} onClick={confirmTargeting}>Confirm</Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
