import React, { useCallback, useMemo } from 'react';
import _ from 'lodash';
import { Box, Stack, Typography, Button, Chip } from '@mui/material';

const TargetSelectionUI = React.memo(({
  targeting,
  areas,
  getCardMeta,
  confirmTargeting,
  cancelTargeting,
  onCancel,
  attackLocked
}) => {
  const selectionCount = _.get(targeting, 'selected.length', 0);
  const optionalMode = targeting.min === 0;
  const isAttackTargeting = targeting.type === 'attack';
  const confirmLabel = optionalMode
    ? (selectionCount > 0 ? 'Confirm' : 'Skip')
    : 'Confirm';
  const confirmDisabled = !optionalMode && selectionCount < targeting.min;
  const confirmVariant = optionalMode && selectionCount > 0 ? 'contained' : 'outlined';

  const getTargetName = useCallback((target) => {
    if (target.section === 'middle' && target.keyName === 'leader') {
      return `${target.side === 'player' ? 'Your' : 'Opponent'} Leader`;
    }

    if (target.section === 'char' && target.keyName === 'char') {
      const targetSide = target.side === 'player'
        ? _.get(areas, 'player')
        : _.get(areas, 'opponent');
      const targetCard = _.get(targetSide, ['char', target.index]);
      const targetMeta = targetCard ? getCardMeta(targetCard.id) : null;
      return targetMeta?.name || targetCard?.id || 'Character';
    }

    return 'Unknown';
  }, [areas, getCardMeta]);

  const helpText = useMemo(() => {
    if (optionalMode) {
      return targeting.max > 1
        ? `Select up to ${targeting.max} targets (${selectionCount}/${targeting.max})`
        : 'Select a target or choose Skip to pass';
    }
    return selectionCount > 0
      ? 'Select more or confirm'
      : 'Select target(s) on board...';
  }, [optionalMode, targeting.max, selectionCount]);

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {Array.isArray(targeting.selected) && targeting.selected.length > 0 && (
        <Box>
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mb: 0.5 }}
          >
            Selected Target{targeting.selected.length > 1 ? 's' : ''}:
          </Typography>
          {targeting.selected.map((target, tidx) => (
            <Chip
              key={tidx}
              label={getTargetName(target)}
              size='small'
              color='warning'
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))}
        </Box>
      )}

      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ flex: 1 }}
        >
          {helpText}
        </Typography>

        <Button
          size='small'
          variant={confirmVariant}
          onClick={confirmTargeting}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>

        {(isAttackTargeting || !optionalMode) && (
          <Button
            size='small'
            variant='text'
            onClick={() => {
              cancelTargeting();
              onCancel();
            }}
            disabled={isAttackTargeting && attackLocked}
          >
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );
});

export default TargetSelectionUI;
