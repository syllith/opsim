import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { resolveAbilityRenderer } from './abilityRenderer';

export default function AbilityList({
  abilities,
  activatableAbilities,
  selectedAbilityIndex,
  currentActionStep,
  targeting,
  activateAbility,
  TargetSelectionUI,
  areas,
  getCardMeta,
  confirmTargeting,
  cancelTargeting,
  setSelectedAbilityIndex,
  getAbilityDescription,
  attackLocked
}) {
  if (!abilities || abilities.length === 0) {
    return (
      <Typography variant='body2' color='text.secondary'>
        No special abilities
      </Typography>
    );
  }

  return (
    <Box>
      <Typography
        variant='overline'
        sx={{ display: 'block', mb: 0.5 }}
      >
        Abilities
      </Typography>

      <Stack spacing={1.5}>
        {activatableAbilities.map((enhancedAbility, idx) => {
          const baseAbility = abilities[idx];
          const Renderer = resolveAbilityRenderer(baseAbility);

          return (
            <Renderer
              key={idx}
              ability={baseAbility}
              index={idx}
              canActivate={enhancedAbility.canActivate}
              reason={enhancedAbility.reason}
              frequency={enhancedAbility.frequency}
              condition={enhancedAbility.condition}
              isSelected={selectedAbilityIndex === idx}
              targeting={targeting}
              currentActionStep={currentActionStep}
              onActivate={() => activateAbility(idx)}
              TargetSelectionUI={TargetSelectionUI}
              areas={areas}
              getCardMeta={getCardMeta}
              confirmTargeting={confirmTargeting}
              cancelTargeting={cancelTargeting}
              setSelectedAbilityIndex={setSelectedAbilityIndex}
              getAbilityDescription={getAbilityDescription}
              attackLocked={attackLocked}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
