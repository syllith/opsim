import React from 'react';
import { Box, Paper, Stack, Typography, Button } from '@mui/material';

export default function OpeningHand({ open, hand = [], allowMulligan, onMulligan, onKeep, setHovered, CARD_W = 120 }) {
  if (!open) return null;
  
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        bgcolor: 'rgba(44,44,44,0.85)',
        color: 'white',
        width: 'fit-content',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        borderWidth: 2,
        borderColor: '#90caf9'
      }}
    >
      {/* Header with title and buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, px: 1 }}>
        <Box>
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: 15, lineHeight: 1.1 }}>
            Opening Hand {allowMulligan ? '' : '(Mulligan used)'}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: 11, opacity: 0.8, display: 'block' }}>
            Keep this hand or mulligan (return 5, draw 5 new)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={onMulligan} disabled={!allowMulligan}>
            Mulligan
          </Button>
          <Button size="small" variant="contained" onClick={onKeep}>
            Keep
          </Button>
        </Stack>
      </Box>

      {/* Card display area */}
      <Box sx={{ display: 'flex', gap: 1, px: 1, pb: 1, overflowX: 'auto' }}>
        {hand.slice(0, 5).map((c, idx) => (
          <img
            key={`${c?.id || 'card'}-${idx}`}
            src={c?.thumb || c?.full}
            alt={c?.id}
            style={{
              width: CARD_W,
              height: 'auto',
              borderRadius: 4,
              cursor: 'pointer'
            }}
            onMouseEnter={() => setHovered && setHovered(c)}
            onMouseLeave={() => setHovered && setHovered(null)}
          />
        ))}
      </Box>
    </Paper>
  );
}
