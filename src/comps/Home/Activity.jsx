// Activity.jsx
// Battle control panel and battle arrow overlay for One Piece TCG Sim
import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, Button, Stack, Chip, Divider } from '@mui/material';

export default function Activity({
    battle,
    battleArrow,
    getBattleStatus,
    skipBlock,
    endCounterStep
}) {
    // Force re-render on window resize to update arrow positions
    const [, setResizeTick] = useState(0);
    
    useEffect(() => {
        if (!battleArrow) return;
        
        const handleResize = () => {
            setResizeTick(t => t + 1);
        };
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [battleArrow]);
    
    if (!battle && !battleArrow) return null;

    return (
        <>
            {/* Battle Control Panel */}
            {battle && (
                <Box sx={{ position: 'fixed', top: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 1550, pointerEvents: 'none' }}>
                    <Paper elevation={3} sx={{ px: 1.5, py: 0.5, borderRadius: 6, bgcolor: 'rgba(30,30,30,0.9)', color: '#fff', display: 'flex', alignItems: 'center', gap: 1, pointerEvents: 'auto' }}>
                        {battle.step === 'block' && (
                            <>
                                <Typography variant="caption">Opponent's Block Step: click a Blocker or choose no block.</Typography>
                                <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
                                <Button size="small" variant="outlined" color="warning" onClick={skipBlock}>No Block</Button>
                            </>
                        )}
                        {battle.step === 'counter' && (
                            <>
                                {(() => {
                                    const s = getBattleStatus();
                                    return (
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Chip size="small" label={`ATK ${s?.atk ?? 0}`} color="error" />
                                            <Chip size="small" label={`DEF ${s?.def ?? 0}`} color={s?.safe ? 'success' : 'default'} variant={s?.safe ? 'filled' : 'outlined'} />
                                            {s && (s.safe ? (
                                                <Chip size="small" label="Safe" color="success" />
                                            ) : (
                                                <Chip size="small" label={`Need +${s.needed}`} color="warning" />
                                            ))}
                                        </Stack>
                                    );
                                })()}
                                <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
                                <Button size="small" variant="contained" color="primary" onClick={endCounterStep}>End Counter Step</Button>
                            </>
                        )}
                    </Paper>
                </Box>
            )}

            {/* Battle Arrow Overlay */}
            {(() => {
                if (!battleArrow || !battleArrow.fromKey || !battleArrow.toKey) return null;
                const fromEl = typeof document !== 'undefined' ? document.querySelector(`[data-cardkey="${battleArrow.fromKey}"]`) : null;
                const toEl = typeof document !== 'undefined' ? document.querySelector(`[data-cardkey="${battleArrow.toKey}"]`) : null;
                if (!fromEl || !toEl) return null;
                const fr = fromEl.getBoundingClientRect();
                const tr = toEl.getBoundingClientRect();
                const from = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
                const to = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
                const label = battleArrow.label || '';
                const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                const id = 'arrowHead';
                // Use a lighter red for the attack arrow
                const stroke = '#ff6b6b';
                const strokeWidth = 4;
                
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
                            <marker id={id} markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
                            </marker>
                        </defs>
                        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#${id})`} />
                        {label ? (
                            <g>
                                <text x={mid.x} y={mid.y} fill="#fff" fontSize="13" fontWeight="600" textAnchor="middle" dominantBaseline="middle" style={{ visibility: 'hidden' }}>{label}</text>
                                <rect x={mid.x} y={mid.y} width="1" height="1" rx="4" ry="4" fill="rgba(0,0,0,0.8)" style={{ transform: 'translate(-50%, -50%)' }}>
                                    <animate attributeName="width" from="1" to="auto" dur="0.01s" fill="freeze" />
                                    <animate attributeName="height" from="1" to="24" dur="0.01s" fill="freeze" />
                                </rect>
                                {(() => {
                                    // Measure text width dynamically
                                    const textEl = typeof document !== 'undefined' ? document.createElementNS('http://www.w3.org/2000/svg', 'text') : null;
                                    let textWidth = 136; // default
                                    if (textEl) {
                                        textEl.setAttribute('font-size', '13');
                                        textEl.setAttribute('font-weight', '600');
                                        textEl.textContent = label;
                                        const svg = document.querySelector('svg');
                                        if (svg) {
                                            svg.appendChild(textEl);
                                            const bbox = textEl.getBBox();
                                            textWidth = bbox.width + 16; // padding
                                            svg.removeChild(textEl);
                                        }
                                    }
                                    return (
                                        <>
                                            <rect x={mid.x - textWidth/2} y={mid.y - 12} width={textWidth} height="24" rx="4" ry="4" fill="rgba(0,0,0,0.8)" />
                                            <text x={mid.x} y={mid.y} fill="#fff" fontSize="13" fontWeight="600" textAnchor="middle" dominantBaseline="middle">{label}</text>
                                        </>
                                    );
                                })()}
                            </g>
                        ) : null}
                    </svg>
                );
            })()}
        </>
    );
}
