/**
 * DeckSearch - STUB
 * TODO: Replace mechanics with engine.abilities.executeDeckSearch()
 * 
 * This file previously contained deck search mechanics.
 * Now contains only the UI modal component with stub logic.
 * Real implementation will be in src/engine/actions/
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Box, Paper, Typography } from '@mui/material';

const CARD_W = 80;

/**
 * useDeckSearch - Stub hook for deck search UI
 * Returns stub functions and a UI component
 */
export function useDeckSearch({ setAreas, setHovered }) {
    const [active, setActive] = useState(false);
    const [config, setConfig] = useState(null);
    const [cards, setCards] = useState([]);
    const [selected, setSelected] = useState([]);

    // STUB: Engine will handle deck search initiation
    const start = useCallback((searchConfig) => {
        console.warn('[useDeckSearch.start] STUB - engine not implemented');
        // For UI testing, we could show the modal with dummy data
        setActive(false);
    }, []);

    // STUB: Cancel search
    const handleCancel = useCallback(() => {
        setActive(false);
        setConfig(null);
        setCards([]);
        setSelected([]);
    }, []);

    // UI Component (kept for layout reference)
    const Component = useMemo(
        () =>
            function DeckSearchModal() {
                if (!active || !config) return null;

                return (
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 1,
                            bgcolor: 'rgba(44,44,44,0.85)',
                            color: 'white',
                            minWidth: 340,
                            maxWidth: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            userSelect: 'none',
                            borderWidth: 2,
                            borderColor: '#ff9800'
                        }}
                    >
                        <Box sx={{ mb: 1, px: 1 }}>
                            <Typography
                                variant="caption"
                                fontWeight={700}
                                sx={{ fontSize: 15, lineHeight: 1.1 }}
                            >
                                Deck Search
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ fontSize: 11, opacity: 0.8, display: 'block', mt: 0.5 }}
                            >
                                [STUB - Engine not implemented]
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, px: 1, pb: 1, overflowX: 'auto' }}>
                            {cards.map((card, idx) => (
                                <Box
                                    key={`${card?.id || 'card'}-${idx}`}
                                    sx={{ position: 'relative', flexShrink: 0, opacity: 0.5 }}
                                >
                                    <img
                                        src={card?.thumb || card?.full}
                                        alt={card?.id}
                                        style={{
                                            width: CARD_W,
                                            height: 'auto',
                                            borderRadius: 4,
                                            display: 'block',
                                            border: '2px solid #666'
                                        }}
                                        onMouseEnter={() => setHovered?.(card)}
                                        onMouseLeave={() => setHovered?.(null)}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                );
            },
        [active, config, cards, setHovered]
    );

    return { start, active, Component, handleCancel };
}

export default useDeckSearch;
