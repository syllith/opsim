// src/comps/Home/Actions.jsx
/**
 * Actions.jsx
 *
 * UI panel for displaying card information and abilities with engine integration.
 * This component uses ActionHelpers.activateAbilityCore to perform ability activation.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Stack,
  Divider,
  Chip,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import _ from 'lodash';
import engine from '../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas, getInstanceIdFromAreas } from './hooks/engineAdapter.js';

import {
  isActivatable,
  timingMatchesPhase,
  checkDonRequirement,
  activateAbilityCore,
  getCardFromAreas
} from './ActionHelpers.js'; // pure JS helpers

export default function Actions({
  // UI Props
  title = 'Actions',
  onClose,
  width = 420,
  maxHeight = 'calc(100vh - 32px)',

  // Card Data
  card,
  cardMeta,
  cardLocation, // { side, section, keyName, index }

  // Game State
  areas,
  setAreas,
  phase,
  turnSide,
  turnNumber = 1,
  isYourTurn,
  battle,
  appendLog,

  // New optional prop: central dispatchAction (from Home) that handles multiplayer forwarding/host execution
  dispatchAction = null,

  // Callbacks
  onAbilityActivated,
}) {
  // Extract card info
  const cardId = card?.id || card?.cardId || 'Unknown';
  const cardName = cardMeta?.cardName || cardMeta?.name || cardId;
  const cardPower = cardMeta?.power ?? cardMeta?.stats?.power ?? null;
  const cardCost = cardMeta?.cost ?? cardMeta?.stats?.cost ?? null;
  const cardType = cardMeta?.cardType || cardMeta?.type || 'Unknown';
  const keywords = cardMeta?.keywords || [];
  const abilities = cardMeta?.abilities || [];
  const printedText = cardMeta?.printedText || cardMeta?.text || '';

  // Get instance ID for this card
  const instanceId = useMemo(() => {
    if (card?.instanceId) return card.instanceId;
    if (!cardLocation || !areas) return null;
    return getInstanceIdFromAreas(
      areas,
      cardLocation.side,
      cardLocation.section,
      cardLocation.keyName,
      cardLocation.index
    );
  }, [card, cardLocation, areas]);

  // Check if card is on the field (can activate abilities)
  const isOnField = useMemo(() => {
    if (!cardLocation) return false;
    const { section, keyName } = cardLocation;
    return section === 'char' ||
      (section === 'middle' && (keyName === 'leader' || keyName === 'stage'));
  }, [cardLocation]);

  // Check DON requirement
  const checkDonRequirementLocal = useCallback((ability) => {
    return checkDonRequirement(ability, areas, cardLocation);
  }, [areas, cardLocation]);

  // Activate ability (delegates to helper)
  const activateAbility = useCallback(async (ability, abilityIndex) => {
    if (!instanceId) {
      appendLog?.('[Ability] Cannot activate: card instance not found');
      return;
    }
    if (!isOnField) {
      appendLog?.('[Ability] Cannot activate: card is not on field');
      return;
    }
    if (!isYourTurn) {
      appendLog?.('[Ability] Cannot activate: not your turn');
      return;
    }
    if (!timingMatchesPhase(ability, phase)) {
      appendLog?.(`[Ability] Cannot activate: wrong phase (need Main phase)`);
      return;
    }
    if (!checkDonRequirementLocal(ability)) {
      appendLog?.(`[Ability] Cannot activate: insufficient DON attached (need ${ability.condition?.don})`);
      return;
    }

    // Compose params and call helper
    const params = {
      ability,
      abilityIndex,
      instanceId,
      isOnField,
      isYourTurn,
      phase,
      areas,
      setAreas,
      turnSide,
      turnNumber,
      cardLocation,
      appendLog,
      dispatchAction,
      engine
    };

    const res = await activateAbilityCore(params);
    if (res && res.success) {
      // If helper returned newAreas (engine fallback path we applied), ensure UI updated
      if (res.newAreas && typeof setAreas === 'function') {
        setAreas(res.newAreas);
      }
      onAbilityActivated?.(instanceId, abilityIndex);
    }
    // If activation failed, the helper already appended logs
  }, [instanceId, isOnField, isYourTurn, phase, checkDonRequirementLocal, areas, setAreas, turnSide, turnNumber, cardLocation, appendLog, dispatchAction, onAbilityActivated]);

  // Determine if an ability can be activated right now
  const canActivateAbility = useCallback((ability) => {
    if (!isActivatable(ability)) return false;
    if (!isOnField) return false;
    if (!isYourTurn) return false;
    if (!timingMatchesPhase(ability, phase)) return false;
    if (!checkDonRequirementLocal(ability)) return false;
    if (battle) return false; // Can't activate during battle
    return true;
  }, [isOnField, isYourTurn, phase, checkDonRequirementLocal, battle]);

  const getActivationBlockReason = useCallback((ability) => {
    if (!isActivatable(ability)) return 'This ability triggers automatically';
    if (!isOnField) return 'Card must be on the field';
    if (!isYourTurn) return 'Not your turn';
    if (!timingMatchesPhase(ability, phase)) return 'Can only activate during Main phase';
    if (!checkDonRequirementLocal(ability)) return `Requires ${ability.condition?.don} DON attached`;
    if (battle) return 'Cannot activate during battle';
    return null;
  }, [isOnField, isYourTurn, phase, checkDonRequirementLocal, battle]);

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width,
        maxHeight,
        overflow: 'auto',
        zIndex: 1300,
        borderRadius: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle1" fontWeight="bold">
          {title}
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: 'inherit' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Card Info */}
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          {cardName}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
          <Chip label={cardType} size="small" variant="outlined" />
          {cardPower !== null && (
            <Chip label={`Power: ${cardPower}`} size="small" color="primary" />
          )}
          {cardCost !== null && (
            <Chip label={`Cost: ${cardCost}`} size="small" color="secondary" />
          )}
        </Stack>

        {/* Keywords */}
        {keywords.length > 0 && (
          <>
            <Typography variant="overline" display="block" sx={{ mb: 0.5 }}>
              Keywords
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
              {keywords.map((kw, i) => (
                <Chip
                  key={i}
                  label={kw}
                  size="small"
                />
              ))}
            </Stack>
          </>
        )}

        {/* Printed Text (if no structured abilities) */}
        {printedText && abilities.length === 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
              {printedText}
            </Typography>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* Abilities */}
        <Typography variant="overline" display="block" sx={{ mb: 0.5 }}>
          Abilities
        </Typography>

        {abilities.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No special abilities
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {abilities.map((ability, idx) => {
              const canActivate = canActivateAbility(ability);
              const blockReason = getActivationBlockReason(ability);
              const activatable = isActivatable(ability);

              return (
                <Box
                  key={idx}
                  sx={{
                    p: 1.25,
                    border: '1px solid',
                    borderColor: canActivate ? 'success.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: canActivate ? 'success.lighter' : 'background.paper',
                    transition: 'all 0.2s',
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                    <Chip
                      label={activatable ? 'Activate Main' : 'Auto'}
                      size="small"
                      color={activatable ? 'success' : 'primary'}
                      sx={{ textTransform: 'capitalize' }}
                    />
                    {ability.frequency && (
                      <Chip
                        label={ability.frequency === 'oncePerTurn' ? 'Once/Turn' : ability.frequency}
                        size="small"
                      />
                    )}
                  </Stack>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {ability.description || ability.name || 'No description'}
                  </Typography>

                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {canActivate ? (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => activateAbility(ability, idx)}
                      >
                        Activate
                      </Button>
                    ) : (
                      <Button size="small" variant="outlined" disabled>
                        {blockReason || 'Unavailable'}
                      </Button>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
