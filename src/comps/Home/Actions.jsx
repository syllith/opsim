/**
 * Actions.jsx
 * 
 * UI panel for displaying card information and abilities.
 * This is a placeholder shell - ability activation logic will be
 * implemented via the new engine once it's ready.
 */
import React from 'react';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Stack,
  Divider,
  Chip,
  Alert
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import _ from 'lodash';

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
    case 'whenAttackingOrOnOpponentsAttack': return 'On Attack or Opponents Attack';
    case 'onOpponentsAttack': return 'On Opponents Attack';
    case 'counter': return 'Counter';
    case 'static': return 'Continuous';
    default: return String(t);
  }
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

  // Game State (for future engine integration)
  phase,
  turnSide,
  isYourTurn,
  battle,
}) {
  // Extract card info
  const cardId = card?.id || 'Unknown';
  const cardName = cardMeta?.cardName || cardMeta?.name || cardId;
  const cardPower = cardMeta?.power ?? cardMeta?.stats?.power ?? null;
  const cardCost = cardMeta?.cost ?? cardMeta?.stats?.cost ?? null;
  const cardType = cardMeta?.cardType || cardMeta?.type || 'Unknown';
  const keywords = cardMeta?.keywords || [];
  const abilities = cardMeta?.abilities || [];

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
            {abilities.map((ability, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.25,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'background.paper',
                }}
              >
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                  <Chip
                    label={getAbilityTypeLabel(ability)}
                    size="small"
                    color="primary"
                    sx={{ textTransform: 'capitalize' }}
                  />
                  {ability.frequency && (
                    <Chip
                      label={ability.frequency === 'oncePerTurn' ? 'Once Per Turn' : ability.frequency}
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

                {/* TODO: Engine integration - ability activation button */}
                <Alert severity="info" sx={{ py: 0.5, px: 1 }}>
                  <Typography variant="caption">
                    Ability activation coming soon (engine rewrite in progress)
                  </Typography>
                </Alert>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
