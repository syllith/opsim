// OP01-004.jsx
// Action UI mock for OP01-004 (Usopp) when declaring an attack during Main Phase.
import React, { useMemo, useState } from 'react';
import { Box, Typography, Stack, Divider, Button, Chip } from '@mui/material';

const BASE_POWER = 3000; // Usopp's printed power

export default function OP01004Action({ startTargeting, confirmTargeting, targeting, turnSide, phase, areas }) {
  // Local mock state for DON assignment and targeting; in the real app these
  // will be driven by game state and board selection.
  const [availableDon, setAvailableDon] = useState(3); // mock available active DON!!
  const [donGiven, setDonGiven] = useState(0);
  const [targetType, setTargetType] = useState('leader'); // 'leader' | 'character'
  const [oncePerTurnUsed, setOncePerTurnUsed] = useState(false);

  const totalPower = useMemo(() => BASE_POWER + donGiven * 1000, [donGiven]);
  const donConditionMet = donGiven >= 1; // [DON!! x1]

  const incDon = () => setDonGiven((v) => Math.min(v + 1, availableDon));
  const decDon = () => setDonGiven((v) => Math.max(0, v - 1));

  const onAttack = () => {
    // In the full implementation this would transition into Battle (7-1), rest the card,
    // and open target selection if needed.
    const target = targetType === 'leader' ? 'Opponent Leader' : '(use board selection)';
    // eslint-disable-next-line no-console
    console.log('[OP01-004] Declare Attack', { power: totalPower, donGiven, targetType, target });
  };

  const onCancel = () => {
    // eslint-disable-next-line no-console
    console.log('[OP01-004] Cancel attack');
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP01-004 — Usopp</Typography>
      <Typography variant="caption" color="text.secondary">Character • Ranged • Straw Hat Crew • Cost 2 • Power 3000</Typography>

      <Divider sx={{ my: 1 }} />

      <Stack spacing={1.25}>
        <Box>
          <Typography variant="overline">Attack Setup (Main Phase)</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
            <Chip label={`Power: ${totalPower}`} color="primary" size="small" />
            <Chip label={`DON Given: ${donGiven}`} size="small" />
            <Chip label={donConditionMet ? 'DON!! x1 Met' : 'DON!! x1 Not Met'} color={donConditionMet ? 'success' : 'default'} size="small" />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="outlined" size="small" onClick={decDon} disabled={donGiven === 0}>-1 DON</Button>
            <Button variant="outlined" size="small" onClick={incDon} disabled={donGiven >= availableDon}>+1 DON</Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="overline">Choose Target</Typography>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={1}>
              <Button variant={targetType === 'leader' ? 'contained' : 'outlined'} size="small" onClick={() => setTargetType('leader')}>
                Opponent Leader
              </Button>
              <Button variant={targetType === 'character' ? 'contained' : 'outlined'} size="small" onClick={() => setTargetType('character')}>
                Rested Character
              </Button>
            </Stack>
            {targetType === 'character' && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => startTargeting({ side: 'opponent', section: 'char', keyName: 'char', min: 1, max: 1 }, (sel) => {
                  const picked = sel?.[0]?.card?.id;
                  // eslint-disable-next-line no-console
                  console.log('[OP01-004] Picked attack target:', picked);
                })}>
                  Select Character on Board
                </Button>
                <Button size="small" variant="outlined" disabled={!targeting?.active} onClick={confirmTargeting}>Confirm</Button>
              </Stack>
            )}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            onClick={onAttack}
            disabled={false}
          >
            Declare Attack
          </Button>
          <Button variant="text" size="small" onClick={onCancel}>Cancel</Button>
        </Stack>

        <Divider sx={{ my: 0.5 }} />

        <Box>
          <Typography variant="overline">Auto Ability</Typography>
          <Typography variant="body2">
            [DON!! x1] [Your Turn] [Once Per Turn] After your opponent activates an Event, draw 1 card.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" label={donConditionMet ? 'Condition Met' : 'Needs DON!! x1'} color={donConditionMet ? 'success' : 'default'} />
            <Chip size="small" label={oncePerTurnUsed ? 'Used This Turn' : 'Available'} color={oncePerTurnUsed ? 'default' : 'info'} />
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
