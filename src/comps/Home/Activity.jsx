// Activity.jsx
// Battle control panel and battle arrow overlay for One Piece TCG Sim
import React, { useState, useEffect, useMemo } from 'react';
import _ from 'lodash';
import {
    Box,
    Paper,
    Button,
    Stack,
    Chip,
    Divider
} from '@mui/material';

export default function Activity({
    battle,
    battleArrow,
    getBattleStatus,
    skipBlock,
    endCounterStep,
    resolveDefense,
    //. Multiplayer props for determining if current player is the defender
    isMultiplayer = false,
    myMultiplayerSide = 'player', //. Which side this player controls: 'player' (host) or 'opponent' (guest)
    multiplayer,
    broadcastStateToOpponent,
    //. Legacy props (host-authoritative; kept temporarily for backward compatibility)
    isHost = true,
    sendGuestAction = null,
    broadcastState = null
}) {
    //. Force re-render on window resize to update arrow positions
    const [, setResizeTick] = useState(0);

    //. Determine if the current player is the defender in battle
    //. Only the defending player should see the "No Block" and "End Counter Step" buttons
    const isDefender = useMemo(() => {
        if (!battle || !battle.target) return false;
        if (!isMultiplayer) return true; //. In single-player modes, show controls always
        //. In multiplayer, only show controls if this player's side is the target (defender)
        return battle.target.side === myMultiplayerSide;
    }, [battle, isMultiplayer, myMultiplayerSide]);

    const syncIfMultiplayer = () => {
        if (!isMultiplayer) return;
        
        // Use new unified action system if available
        if (multiplayer?.syncState) {
            // syncState handles debouncing internally
            return;
        }
        
        // Legacy fallback
        const syncFn = broadcastStateToOpponent || broadcastState;
        if (typeof syncFn === 'function') {
            setTimeout(() => syncFn(), 100);
        }
    };

    //. Unified handler for resolving defense: execute locally then sync
    const handleResolveDefense = () => {
        // Send action via unified multiplayer system if available
        if (isMultiplayer && multiplayer?.actions?.resolveDefense) {
            multiplayer.actions.resolveDefense(battle?.battleId);
        }
        
        if (typeof resolveDefense === 'function') {
            resolveDefense();
        } else {
            // Backward-compatible fallback: move through block -> counter -> damage
            if (battle?.step === 'block') {
                skipBlock?.();
                // endCounterStep only works once the battle step becomes 'counter'
                setTimeout(() => endCounterStep?.(), 0);
            } else {
                endCounterStep?.();
            }
        }
        syncIfMultiplayer();
    };

    //. Throttled resize handler (avoids spamming re-renders)
    useEffect(() => {
        if (!battleArrow) { return; }
        if (typeof window === 'undefined') { return; }

        const handleResize = _.throttle(() => {
            setResizeTick((t) => t + 1);
        }, 100);

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            handleResize.cancel?.();
        };
    }, [battleArrow]);

    //. Derived battle status for control panel
    const status = useMemo(() => {
        if (!battle) { return null; }
        return getBattleStatus();
    }, [battle, getBattleStatus]);

    if (!battle && !battleArrow) { return null; }

    //. Battle arrow rendering helper
    const renderArrowOverlay = () => {
        const fromKey = _.get(battleArrow, 'fromKey');
        const toKey = _.get(battleArrow, 'toKey');
        if (!fromKey || !toKey) { return null; }

        if (typeof document === 'undefined') { return null; }

        const fromEl = document.querySelector(`[data-cardkey="${fromKey}"]`);
        const toEl = document.querySelector(`[data-cardkey="${toKey}"]`);
        if (!fromEl || !toEl) { return null; }

        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();

        const from = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
        const to = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
        const label = battleArrow.label || '';
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

        const id = 'arrowHead';
        const stroke = '#ff6b6b';
        const strokeWidth = 4;

        //. Approximate label width based on character count (no DOM measuring)
        const textWidth = Math.max(48, Math.min(260, (label.length || 0) * 7 + 16));
        const textHeight = 24;

        return (
            <svg
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    pointerEvents: 'none',
                    zIndex: 1300
                }}
            >
                <defs>
                    <marker
                        id={id}
                        markerWidth='10'
                        markerHeight='10'
                        refX='5'
                        refY='3'
                        orient='auto'
                        markerUnits='strokeWidth'
                    >
                        <path d='M0,0 L0,6 L9,3 z' fill={stroke} />
                    </marker>
                </defs>

                {/* Attack line */}
                <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap='round'
                    markerEnd={`url(#${id})`}
                />

                {/* Label bubble */}
                {label && (
                    <g>
                        <rect
                            x={mid.x - textWidth / 2}
                            y={mid.y - textHeight / 2}
                            width={textWidth}
                            height={textHeight}
                            rx='4'
                            ry='4'
                            fill='rgba(0,0,0,0.8)'
                        />
                        <text
                            x={mid.x}
                            y={mid.y}
                            fill='#fff'
                            fontSize='13'
                            fontWeight='600'
                            textAnchor='middle'
                            dominantBaseline='middle'
                        >
                            {label}
                        </text>
                    </g>
                )}
            </svg>
        );
    };

    return (
        <>
            {/* Battle Control Panel */}
            {battle && battle.target && (battle.step === 'attack' || battle.step === 'block' || battle.step === 'counter') && (
                <Box
                    sx={{
                        position: 'fixed',
                        top: 56,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        zIndex: 1550,
                        pointerEvents: 'none'
                    }}
                >
                    <Paper
                        elevation={3}
                        sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 6,
                            bgcolor: 'rgba(30,30,30,0.9)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            pointerEvents: 'auto'
                        }}
                    >
                        {/* Status chips */}
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Chip
                                size='small'
                                label={`ATK ${status?.atk ?? 0}`}
                                color='error'
                            />
                            <Chip
                                size='small'
                                label={`DEF ${status?.def ?? 0}`}
                                color={status?.safe ? 'success' : 'default'}
                                variant={status?.safe ? 'filled' : 'outlined'}
                            />
                            {status && (
                                status.safe ? (
                                    <Chip
                                        size='small'
                                        label='Safe'
                                        color='success'
                                    />
                                ) : (
                                    <Chip
                                        size='small'
                                        label={`Need +${status.needed}`}
                                        color='warning'
                                    />
                                )
                            )}
                        </Stack>

                        {/* Only show divider if an action button is visible */}
                        {(battle.step === 'block' && isDefender) || (battle.step === 'counter' && isDefender) ? (
                            <>
                                <Divider
                                    orientation='vertical'
                                    flexItem
                                    sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                                />
                                <Button
                                    size='small'
                                    variant='contained'
                                    color='primary'
                                    onClick={handleResolveDefense}
                                >
                                    Resolve
                                </Button>
                            </>
                        ) : null}
                    </Paper>
                </Box>
            )}

            {/* Battle Arrow Overlay */}
            {renderArrowOverlay()}
        </>
    );
}
