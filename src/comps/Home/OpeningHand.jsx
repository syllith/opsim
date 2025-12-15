/**
 * OpeningHand - STUB
 * TODO: Replace mechanics with engine.setup calls
 * 
 * This file previously contained opening hand selection mechanics.
 * Now contains only the UI modal with stub handlers.
 * Real implementation will be in src/engine/
 */
import React, {
    useState,
    useCallback,
    forwardRef,
    useImperativeHandle
} from 'react';
import { Box, Paper, Stack, Typography, Button } from '@mui/material';

const OpeningHand = forwardRef(({
    areas,
    setAreas,
    getAssetForId,
    setHovered,
    openingHandShown,
    setOpeningHandShown,
    CARD_W = 120
}, ref) => {
    const [openingHand, setOpeningHand] = useState([]);
    const [allowMulligan, setAllowMulligan] = useState(true);

    // STUB: Initialize opening hand display
    const initialize = useCallback((sideLibrary, side = 'player') => {
        console.warn('[OpeningHand.initialize] STUB - engine not implemented');
        setOpeningHandShown(true);
        setAllowMulligan(true);
        setOpeningHand([]);
    }, [setOpeningHandShown]);

    // STUB: Reset state
    const reset = useCallback(() => {
        setOpeningHand([]);
        setAllowMulligan(true);
    }, []);

    // STUB: Update hand display
    const updateHandDisplay = useCallback((sideLibrary) => {
        console.warn('[OpeningHand.updateHandDisplay] STUB - engine not implemented');
    }, []);

    // Check if shown
    const isOpen = useCallback(() => openingHandShown, [openingHandShown]);

    // Expose methods via ref
    useImperativeHandle(
        ref,
        () => ({
            initialize,
            updateHandDisplay,
            isOpen,
            reset,
            getHasSelected: () => false
        }),
        [initialize, updateHandDisplay, isOpen, reset]
    );

    // STUB: Handle mulligan
    const handleMulligan = useCallback(() => {
        console.warn('[OpeningHand.handleMulligan] STUB - engine not implemented');
        setAllowMulligan(false);
    }, []);

    // STUB: Handle keep
    const handleKeep = useCallback(() => {
        console.warn('[OpeningHand.handleKeep] STUB - engine not implemented');
        setOpeningHandShown(false);
    }, [setOpeningHandShown]);

    // Don't render if not shown
    if (!openingHandShown) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: 'rgba(0,0,0,0.8)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <Paper
                elevation={8}
                sx={{
                    p: 3,
                    bgcolor: 'rgba(40,40,40,0.98)',
                    color: 'white',
                    borderRadius: 2,
                    border: '2px solid #4caf50',
                    maxWidth: '90vw'
                }}
            >
                <Stack spacing={2} alignItems="center">
                    <Typography variant="h6" fontWeight={700}>
                        Opening Hand
                    </Typography>

                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        [STUB - Engine not implemented]
                    </Typography>

                    {/* Card display area */}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1.5,
                            p: 2,
                            bgcolor: 'rgba(0,0,0,0.3)',
                            borderRadius: 1,
                            minHeight: 180
                        }}
                    >
                        {openingHand.length === 0 ? (
                            <Typography sx={{ opacity: 0.5, alignSelf: 'center' }}>
                                No cards to display
                            </Typography>
                        ) : (
                            openingHand.map((card, idx) => (
                                <Box key={idx} sx={{ flexShrink: 0 }}>
                                    <img
                                        src={card?.thumb || card?.full}
                                        alt={card?.id}
                                        style={{
                                            width: CARD_W,
                                            height: 'auto',
                                            borderRadius: 4,
                                            border: '2px solid #666'
                                        }}
                                        onMouseEnter={() => setHovered?.(card)}
                                        onMouseLeave={() => setHovered?.(null)}
                                    />
                                </Box>
                            ))
                        )}
                    </Box>

                    {/* Action buttons */}
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            onClick={handleMulligan}
                            disabled={!allowMulligan}
                            sx={{
                                color: allowMulligan ? '#ff9800' : '#666',
                                borderColor: allowMulligan ? '#ff9800' : '#666'
                            }}
                        >
                            Mulligan
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleKeep}
                            sx={{ bgcolor: '#4caf50' }}
                        >
                            Keep Hand
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Box>
    );
});

OpeningHand.displayName = 'OpeningHand';

export default OpeningHand;
