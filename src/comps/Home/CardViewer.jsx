// CardViewer.jsx
// Card viewer with log display for the One Piece TCG Sim
import React, { useRef, useEffect } from 'react';
import { Box, Typography, Alert, CircularProgress, Stack, Chip, Divider } from '@mui/material';

export default function CardViewer({
    hovered,
    selectedCard,
    cardError,
    loadingCards,
    log = [],
    compact = false,
    showLog = true,
    sx: sxOverride = null,
    frame = true,
    contentPadding = 1
}) {
    const logRef = useRef(null);

    // Auto-scroll log to bottom when new entries are added
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [log]);

    // Display hovered card if hovering, otherwise show selected card if one exists
    // But ignore DON and DON_BACK entirely in the viewer
    const rawCard = hovered || selectedCard;
    const isIgnoredDon = rawCard && (rawCard.id === 'DON' || rawCard.id === 'DON_BACK');
    const displayCard = isIgnoredDon ? null : rawCard;

    const baseSx = {
        width: { xs: '100%', md: compact ? 380 : 440 },
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%'
    };
    const rootSx = sxOverride ? { ...baseSx, ...sxOverride } : baseSx;

    return (
        <Box sx={rootSx}>
            <Typography
                variant={compact ? 'h6' : 'h5'}
                gutterBottom
                sx={{ mb: compact ? 1 : 2, flexShrink: 0 }}
            >
                Card Viewer
            </Typography>

            {cardError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {cardError}
                </Alert>
            )}

            {loadingCards ? (
                <CircularProgress size={28} />
            ) : (
                <Box
                    sx={{
                        border: frame ? '1px solid' : 'none',
                        borderColor: frame ? 'divider' : 'transparent',
                        borderRadius: frame ? 1 : 0,
                        p: contentPadding,
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: frame ? 'background.paper' : 'transparent',
                        overflow: 'hidden'
                    }}
                >
                    {displayCard ? (
                        <img
                            src={displayCard.full}
                            alt={displayCard.id}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain'
                            }}
                        />
                    ) : (
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            textAlign="center"
                        >
                            Hover over a card to view its effects
                        </Typography>
                    )}
                </Box>
            )}

            {displayCard && (
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mt: 1 }}
                >
                    <Typography variant="caption" display="block">
                        {displayCard.id}
                    </Typography>
                    {selectedCard && !hovered && (
                        <Chip
                            label="Selected"
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    )}
                </Stack>
            )}

            {showLog && (
                <>
                    <Divider sx={{ my: 1 }} />
                    <Box
                        ref={logRef}
                        sx={{
                            border: '1px dashed',
                            borderColor: 'divider',
                            p: 1,
                            borderRadius: 1,
                            height: 120,
                            overflow: 'auto',
                            bgcolor: 'background.default'
                        }}
                    >
                        {log.map((entry, i) => (
                            <Typography
                                key={i}
                                variant="caption"
                                display="block"
                            >
                                {entry}
                            </Typography>
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}
