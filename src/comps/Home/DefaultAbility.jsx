import React from 'react';
import { Box, Stack, Chip, Typography, Button, Alert } from '@mui/material';
import { getAbilityTypeLabel } from './actionMechanics';

export default function DefaultAbility({
  ability,
  index,
  canActivate,
  reason,
  frequency,
  condition,
  isSelected,
  targeting,
  currentActionStep,
  onActivate,
  TargetSelectionUI,
  areas,
  getCardMeta,
  confirmTargeting,
  cancelTargeting,
  setSelectedAbilityIndex,
  getAbilityDescription,
  attackLocked
}) {
  const showActivateButton =
    canActivate && !(isSelected && targeting?.active);

  const alertSeverity = (() => {
    if (!reason) return 'info';
    const lower = reason.toLowerCase();
    if (lower.includes('resolving')) return 'warning';
    if (lower.includes('already')) return 'info';
    return 'info';
  })();

  return (
    <Box
      sx={{
        p: 1.25,
        border: '1px solid',
        borderColor: canActivate ? 'primary.main' : 'divider',
        borderRadius: 1,
        bgcolor: canActivate ? 'action.hover' : 'transparent'
      }}
    >
      <Stack
        direction='row'
        spacing={0.5}
        sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}
      >
        <Chip
          label={getAbilityTypeLabel(ability)}
          size='small'
          color='primary'
          sx={{ textTransform: 'capitalize' }}
        />

        {frequency && (
          <Chip
            label={frequency}
            size='small'
            variant='outlined'
          />
        )}

        {condition?.don > 0 && (
          <Chip
            label={`DON!! x${condition.don}`}
            size='small'
            color='secondary'
          />
        )}
      </Stack>

      <Typography variant='body2' sx={{ mb: 1 }}>
        {(() => {
          const desc = getAbilityDescription(ability, index);
          return desc && desc.length > 0 ? desc : 'No description';
        })()}
      </Typography>

      {showActivateButton ? (
        <Button
          size='small'
          variant='contained'
          onClick={onActivate}
        >
          Activate
        </Button>
      ) : !canActivate ? (
        <Alert
          severity={alertSeverity}
          sx={{
            py: 0.5,
            px: 1.5,
            alignItems: 'center',
            '& .MuiAlert-message': {
              py: 0,
              width: '100%'
            }
          }}
        >
          {reason || 'Cannot activate now'}
        </Alert>
      ) : null}

      {isSelected && targeting?.active && (
        <>
          {currentActionStep && (
            <Alert
              severity='info'
              sx={{
                mb: 1,
                py: 0.5,
                px: 1.5,
                display: 'flex',
                alignItems: 'center',
                '& .MuiAlert-message': {
                  py: 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center'
                }
              }}
            >
              <Stack
                direction='row'
                spacing={1}
                alignItems='center'
                sx={{ width: '100%' }}
              >
                <Chip
                  label={`Step ${currentActionStep.step}/${currentActionStep.total}`}
                  size='small'
                  color='info'
                />
                <Typography
                  variant='caption'
                  sx={{ flex: 1, lineHeight: 1.4 }}
                >
                  {currentActionStep.description}
                </Typography>
              </Stack>
            </Alert>
          )}

          <TargetSelectionUI
            targeting={targeting}
            areas={areas}
            getCardMeta={getCardMeta}
            confirmTargeting={confirmTargeting}
            cancelTargeting={cancelTargeting}
            onCancel={() => setSelectedAbilityIndex(null)}
            attackLocked={attackLocked}
          />
        </>
      )}
    </Box>
  );
}
