// OP08-118.jsx — (Card data missing)
// Placeholder UI noting that card JSON is not present in src/data/cards/OP08.
import React from 'react';
import { Box, Typography, Stack, Divider, Chip } from '@mui/material';

export default function OP08118Placeholder() {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700}>OP08-118 — (Unknown)</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={1.25}>
        <Chip label="Card data not found in src/data/cards/OP08/OP08-118.json" color="warning" size="small" />
        <Typography variant="body2">Please add the JSON for OP08-118 under <code>src/data/cards/OP08/OP08-118.json</code> so we can implement its specific UI/actions accurately.</Typography>
      </Stack>
    </Box>
  );
}
