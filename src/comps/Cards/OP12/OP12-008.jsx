// OP12-008 — Shanks
// Ability: [On Your Opponent's Attack][Once Per Turn]
// Cost: Trash 1 from your hand
// Effect: Give up to 1 of your opponent's Leader or Characters -2000 power during this turn.
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Button, Typography } from '@mui/material';

export default function OP12008Action({
  turnSide,
  actionSource,
  startTargeting,
  cancelTargeting,
  confirmTargeting,
  targeting,
  applyPowerMod,
  battle,
}) {
  const ownerSide = actionSource?.side || 'player';
  const isOpponentsTurn = turnSide && turnSide !== ownerSide;
  const isOpponentAttacking = !!battle && battle?.attacker?.side && battle.attacker.side !== ownerSide && (battle.step === 'attack' || battle.step === 'block' || battle.step === 'counter');
  const fromHand = !!(actionSource && ((actionSource.side === 'player' && actionSource.section === 'bottom' && actionSource.keyName === 'hand') || (actionSource.side === 'opponent' && actionSource.section === 'top' && actionSource.keyName === 'hand')));
  const fromField = !!(actionSource && actionSource.section === 'char');
  const [onceUsed, setOnceUsed] = useState(false);

  // Reset Once/Turn at the start of the owner's turn
  useEffect(() => {
    if (turnSide === ownerSide) setOnceUsed(false);
  }, [turnSide, ownerSide]);

  const canActivate = useMemo(() => isOpponentsTurn && isOpponentAttacking && fromField && !onceUsed, [isOpponentsTurn, isOpponentAttacking, fromField, onceUsed]);

  const giveMinus2000ToLeader = () => {
    if (!canActivate) return;
    // Opponent leader lives in middle.leader index 0
    applyPowerMod(ownerSide === 'player' ? 'opponent' : 'player', 'middle', 'leader', 0, -2000);
    setOnceUsed(true);
  };

  const selectOpponentCharacter = () => {
    if (!canActivate) return;
    const targetSide = ownerSide === 'player' ? 'opponent' : 'player';
    startTargeting({ side: targetSide, section: 'char', keyName: 'char', min: 1, max: 1 }, (targets) => {
      (targets || []).forEach(({ index }) => {
        applyPowerMod(targetSide, 'char', 'char', index, -2000);
      });
      setOnceUsed(true);
    });
  };

  // Hide entire section if not actionable now (e.g., in hand or wrong timing)
  if (!canActivate) return null;

  return (
    <Box>
      <Stack spacing={1}>
        <Typography variant="caption" color="text.secondary">
          On your opponent's attack [Once Per Turn]: Trash 1 from hand to give up to 1 opponent Leader/Character -2000 power this turn.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={!canActivate} onClick={giveMinus2000ToLeader}>
            Give -2000 to Opp Leader
          </Button>
          <Button size="small" variant="outlined" disabled={!canActivate} onClick={selectOpponentCharacter}>
            Select Opp Character: -2000
          </Button>
        </Stack>
        {targeting?.active && (
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="text" onClick={confirmTargeting}>Confirm Target</Button>
            <Button size="small" variant="text" onClick={cancelTargeting}>Cancel</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
