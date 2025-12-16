/**
 * Actions.jsx
 * 
 * UI panel for displaying card information and abilities with engine integration.
 * Abilities can be activated during the appropriate game phase via engine.executeAction.
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
  Alert,
  Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import _ from 'lodash';
import engine from '../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas, getInstanceIdFromAreas } from './hooks/engineAdapter.js';

// Helper to determine chip color for keywords
const getKeywordColor = (keyword) => {
  const lower = _.toLower(keyword || '');
  if (lower.includes('rush')) return 'warning';
  if (lower.includes('blocker')) return 'info';
  if (lower.includes('double attack')) return 'error';
  return 'default';
};

// Map timing to display label
const getAbilityTypeLabel = (ability) => {
  const t = _.get(ability, 'timing');
  if (!t) return String(_.get(ability, 'type', 'Unknown'));
  switch (t) {
    case 'onPlay': return 'On Play';
    case 'activateMain':
    case 'main': return 'Activate Main';
    case 'whenAttacking': return 'On Attack';
    case 'whenAttackingOrOnOpponentsAttack': return 'On Attack / Opp Attack';
    case 'onOpponentsAttack': return 'On Opp Attack';
    case 'counter': return 'Counter';
    case 'static': return 'Continuous';
    case 'trigger': return 'Trigger';
    case 'onKO': return 'On K.O.';
    default: return String(t);
  }
};

// Check if ability can be manually activated (vs triggered automatically)
const isActivatable = (ability) => {
  const timing = ability?.timing;
  return timing === 'activateMain' || timing === 'main';
};

// Check if ability timing matches current phase
const timingMatchesPhase = (ability, phase) => {
  const timing = ability?.timing;
  const phaseLower = (phase || '').toLowerCase();
  
  if (timing === 'activateMain' || timing === 'main') {
    return phaseLower === 'main';
  }
  if (timing === 'counter') {
    return phaseLower === 'counter';
  }
  return false;
};

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

  // Check DON requirement for ability
  const checkDonRequirement = useCallback((ability) => {
    if (!ability?.condition?.don) return true;
    const requiredDon = ability.condition.don;
    
    // Get attached DON count from the card
    if (!areas || !cardLocation) return false;
    
    try {
      const gameState = convertAreasToGameState(areas, { turnSide, turnNumber, phase });
      const loc = engine.getCardMeta ? null : null; // We need to check attached DON on the instance
      
      // For now, check if the card has givenDon >= required
      const cardData = card || {};
      const attachedDon = cardData.givenDon || cardData.don || 0;
      return attachedDon >= requiredDon;
    } catch {
      return false;
    }
  }, [areas, cardLocation, card, turnSide, turnNumber, phase]);

  // Activate an ability
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

    if (!checkDonRequirement(ability)) {
      appendLog?.(`[Ability] Cannot activate: insufficient DON attached (need ${ability.condition?.don})`);
      return;
    }

    try {
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      // Execute ability actions through engine
      // The ability should have an 'actions' array describing what it does
      const actions = ability.actions || [];
      
      if (actions.length === 0) {
        appendLog?.(`[Ability] Activated: ${ability.description || 'Unknown ability'}`);
        // Even without specific actions, mark the ability as used
        onAbilityActivated?.(instanceId, abilityIndex);
        return;
      }

      let allSuccess = true;
      for (const action of actions) {
        // Add context to action
        const actionWithContext = {
          ...action,
          sourceInstanceId: instanceId,
          owner: cardLocation?.side || turnSide
        };

        const result = engine.executeAction(gameState, actionWithContext, {
          activePlayer: turnSide,
          source: instanceId,
          abilityIndex
        });

        if (!result.success) {
          appendLog?.(`[Ability] Action failed: ${result.error}`);
          allSuccess = false;
          break;
        }
      }

      if (allSuccess) {
        // Update UI with new state
        const newAreas = convertGameStateToAreas(gameState);
        setAreas?.(newAreas);
        appendLog?.(`[Ability] Activated: ${ability.description || ability.name || 'ability'}`);
        onAbilityActivated?.(instanceId, abilityIndex);
      }
    } catch (e) {
      appendLog?.(`[Ability] Error: ${e.message}`);
    }
  }, [instanceId, isOnField, isYourTurn, phase, areas, setAreas, turnSide, turnNumber, cardLocation, checkDonRequirement, appendLog, onAbilityActivated]);

  // Determine if an ability can be activated right now
  const canActivateAbility = useCallback((ability) => {
    if (!isActivatable(ability)) return false;
    if (!isOnField) return false;
    if (!isYourTurn) return false;
    if (!timingMatchesPhase(ability, phase)) return false;
    if (!checkDonRequirement(ability)) return false;
    if (battle) return false; // Can't activate during battle
    return true;
  }, [isOnField, isYourTurn, phase, checkDonRequirement, battle]);

  // Get reason why ability can't be activated
  const getActivationBlockReason = useCallback((ability) => {
    if (!isActivatable(ability)) return 'This ability triggers automatically';
    if (!isOnField) return 'Card must be on the field';
    if (!isYourTurn) return 'Not your turn';
    if (!timingMatchesPhase(ability, phase)) return 'Can only activate during Main phase';
    if (!checkDonRequirement(ability)) return `Requires ${ability.condition?.don} DON attached`;
    if (battle) return 'Cannot activate during battle';
    return null;
  }, [isOnField, isYourTurn, phase, checkDonRequirement, battle]);

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
                  color={getKeywordColor(kw)}
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
                      label={getAbilityTypeLabel(ability)}
                      size="small"
                      color={activatable ? 'success' : 'primary'}
                      sx={{ textTransform: 'capitalize' }}
                    />
                    {ability.frequency && (
                      <Chip
                        label={ability.frequency === 'oncePerTurn' ? 'Once/Turn' : ability.frequency}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {ability.condition?.don > 0 && (
                      <Chip
                        label={`DON!! x${ability.condition.don}`}
                        size="small"
                        color="secondary"
                      />
                    )}
                  </Stack>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {ability.description || ability.text || 'No description available'}
                  </Typography>

                  {/* Activation Button for activatable abilities */}
                  {activatable ? (
                    <Tooltip title={blockReason || 'Activate this ability'} arrow>
                      <span>
                        <Button
                          variant={canActivate ? 'contained' : 'outlined'}
                          size="small"
                          color={canActivate ? 'success' : 'inherit'}
                          disabled={!canActivate}
                          onClick={() => activateAbility(ability, idx)}
                          startIcon={<PlayArrowIcon />}
                          fullWidth
                        >
                          {canActivate ? 'Activate' : blockReason || 'Cannot Activate'}
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <Alert severity="info" sx={{ py: 0.25, px: 1 }}>
                      <Typography variant="caption">
                        {ability.timing === 'onPlay' && 'Triggers when played'}
                        {ability.timing === 'whenAttacking' && 'Triggers when attacking'}
                        {ability.timing === 'counter' && 'Use during Counter step'}
                        {ability.timing === 'trigger' && 'Life trigger ability'}
                        {ability.timing === 'static' && 'Always active'}
                        {ability.timing === 'onKO' && 'Triggers when K.O.\'d'}
                        {!['onPlay', 'whenAttacking', 'counter', 'trigger', 'static', 'onKO'].includes(ability.timing) && 'Automatic trigger'}
                      </Typography>
                    </Alert>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
