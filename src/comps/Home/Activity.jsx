/**
 * Activity - STUB
 * TODO: Replace battle handlers with engine.battle calls
 * 
 * This file previously contained battle step control mechanics.
 * Now contains only the UI components with stub handlers.
 * Real implementation will be in src/engine/core/battle.js
 */
import React from 'react';
import { Box, Paper, Button, Stack, Chip, Divider } from '@mui/material';

export default function Activity({
    battle,
    phase,
    turnSide,
    onSkipBlock,
    onEndCounterStep,
    onResolveDefense,
    areas,
    metaById,
    getTotalPower,
    getAssetForId
}) {
    // ==========================================================================
    // BATTLE ARROW OVERLAY (UI only - shows attack line)
    // ==========================================================================
    const BattleArrowOverlay = () => {
        if (!battle?.attacker || !battle?.defender) return null;

        // Arrow rendering would go here - just a placeholder
        return (
            <Box
                sx={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    zIndex: 1000
                }}
            >
                {/* SVG arrow would render here based on attacker/defender positions */}
            </Box>
        );
    };

    // ==========================================================================
    // BATTLE CONTROL PANEL (UI only)
    // ==========================================================================
    const BattleControlPanel = () => {
        if (!battle) return null;

        const { step, attacker, defender } = battle;

        // STUB handlers - will call engine methods
        const handleSkipBlock = () => {
            console.warn('[Activity.handleSkipBlock] STUB - engine not implemented');
            onSkipBlock?.();
        };

        const handleEndCounter = () => {
            console.warn('[Activity.handleEndCounter] STUB - engine not implemented');
            onEndCounterStep?.();
        };

        const handleResolve = () => {
            console.warn('[Activity.handleResolve] STUB - engine not implemented');
            onResolveDefense?.();
        };

        return (
            <Paper
                elevation={4}
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    p: 2,
                    bgcolor: 'rgba(30,30,30,0.95)',
                    color: 'white',
                    minWidth: 280,
                    zIndex: 1100,
                    borderRadius: 2,
                    border: '2px solid #ff5722'
                }}
            >
                <Stack spacing={1.5}>
                    <Box sx={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}>
                        Battle Phase
                    </Box>

                    <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Step:</span>
                        <Chip
                            label={step || 'unknown'}
                            size="small"
                            color="warning"
                            sx={{ fontWeight: 600 }}
                        />
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Attacker:</span>
                        <span>{attacker?.id || 'none'}</span>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Defender:</span>
                        <span>{defender?.id || 'none'}</span>
                    </Box>

                    <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />

                    <Stack direction="row" spacing={1} justifyContent="center">
                        {step === 'block' && (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleSkipBlock}
                                sx={{ bgcolor: '#666' }}
                            >
                                Skip Block
                            </Button>
                        )}
                        {step === 'counter' && (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleEndCounter}
                                sx={{ bgcolor: '#1976d2' }}
                            >
                                End Counter
                            </Button>
                        )}
                        {(step === 'resolve' || step === 'damage') && (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleResolve}
                                color="error"
                            >
                                Resolve Battle
                            </Button>
                        )}
                    </Stack>

                    <Box sx={{ fontSize: 10, opacity: 0.6, textAlign: 'center' }}>
                        [STUB - Engine not implemented]
                    </Box>
                </Stack>
            </Paper>
        );
    };

    return (
        <>
            <BattleArrowOverlay />
            <BattleControlPanel />
        </>
    );
}
