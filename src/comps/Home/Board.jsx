// Board.jsx
// Board layout and rendering for One Piece TCG Sim play area

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, Chip, Stack } from '@mui/material';
import OpeningHand from './OpeningHand';
import DeckSearch from './DeckSearch';

export default function Board({
    areas,
    setAreas,
    hovered,
    setHovered,
    gameStarted,
    addCardToArea,
    removeCardFromArea,
    openCardAction,
    actionOpen,
    actionCardIndex,
    targeting,
    setTargeting,
    currentAttack,
    setBattleArrow,
    getTotalPower,
    battle,
    getBattleStatus,
    getKeywordsFor,
    applyBlocker,
    getPowerMod,
    turnSide,
    CARD_BACK_URL,
    compact = false,
    giveDonToCard,
    startDonGiving,
    cancelDonGiving,
    donGivingMode,
    phase,
    // Opening Hand props
    openingShown,
    openingHand,
    allowMulligan,
    onMulligan,
    onKeep,
    // Deck Search props
    deckSearchOpen,
    deckSearchConfig,
    setDeckSearchOpen,
    getCardMeta
}) {
    // Sizing constants (match Fyne layout intent)
    const CARD_W = 120;
    const CARD_H = 167;
    const OVERLAP_OFFSET = 22;
    const COST_W = 650; // width of cost area fan
    const SINGLE_W = CARD_W; // deck, trash, don, leader, stage
    const LIFE_W = CARD_W; // life column width
    const CHAR_W = COST_W + SINGLE_W; // character area spans cost + trash widths
    const LIFE_MAX_VISIBLE = 5; // overlapped vertical stack height control

    // Base board dimensions used for scaling calculations (unscaled layout)
    const BASE_BOARD_WIDTH = CHAR_W + LIFE_W + 32; // includes inter-column gap
    // Ref to the inner unscaled content so we can measure actual intrinsic size
    const contentRef = useRef(null);

    // Scale-to-fit state and measurement refs
    const boardOuterRef = useRef(null);
    const [boardScale, setBoardScale] = useState(1);
    const compactMode = boardScale < 0.9 || compact;

    // Recompute scale on resize and when layout mounts
    useEffect(() => {
        let raf = 0;
        const measure = () => {
            const el = boardOuterRef.current;
            const content = contentRef.current;
            if (!el || !content) return;
            const availableWidth = el.clientWidth || BASE_BOARD_WIDTH;
            const rect = el.getBoundingClientRect();
            const availableHeight = Math.max(200, window.innerHeight - rect.top - 12); // keep a small bottom margin
            const baseW = content.scrollWidth || BASE_BOARD_WIDTH;
            const baseH = content.scrollHeight || (CARD_H * 4 + 200);
            const sW = availableWidth / baseW;
            const sH = availableHeight / baseH;
            const next = Math.max(0.2, Math.min(1.4, Math.min(sW, sH)));
            setBoardScale(next);
        };
        const onResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        };
        onResize();
        window.addEventListener('resize', onResize);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, [BASE_BOARD_WIDTH]);

    // Each area keeps an array of cards; config carries layout + fixed pixel width/height
    const areaConfigs = useMemo(() => ({
        opponent: {
            top: {
                hand: { label: 'Opp Hand', mode: 'overlap-right', max: 999, width: COST_W, height: CARD_H + 40 },
                trash: { label: 'Trash', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 },
                cost: { label: 'Opp Cost Area', mode: 'overlap-right', max: 10, width: COST_W, height: CARD_H + 40 },
                don: { label: 'Don', mode: 'stacked', max: 10, width: SINGLE_W, height: CARD_H + 40 }
            },
            middle: {
                deck: { label: 'Deck', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 },
                stage: { label: 'Stage', mode: 'single', max: 1, width: SINGLE_W, height: CARD_H + 40 },
                leader: { label: 'Leader', mode: 'single', max: 1, width: SINGLE_W, height: CARD_H + 40 }
            },
            char: { label: 'Opp Character Area (5 cards)', mode: 'side-by-side', max: 5, width: CHAR_W, height: CARD_H + 40 },
            life: { label: 'Life', mode: 'overlap-vertical', max: 5, width: LIFE_W, height: CARD_H + 40 + (LIFE_MAX_VISIBLE - 1) * OVERLAP_OFFSET }
        },
        player: {
            life: { label: 'Life', mode: 'overlap-vertical', max: 5, width: LIFE_W, height: CARD_H + 40 + (LIFE_MAX_VISIBLE - 1) * OVERLAP_OFFSET },
            char: { label: 'Character Area (5 cards)', mode: 'side-by-side', max: 5, width: CHAR_W, height: CARD_H + 40 },
            middle: {
                leader: { label: 'Leader', mode: 'single', max: 1, width: SINGLE_W, height: CARD_H + 40 },
                stage: { label: 'Stage', mode: 'single', max: 1, width: SINGLE_W, height: CARD_H + 40 },
                deck: { label: 'Deck', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 }
            },
            bottom: {
                hand: { label: 'Hand', mode: 'overlap-right', max: 999, width: COST_W, height: CARD_H + 40 },
                don: { label: 'Don', mode: 'stacked', max: 10, width: SINGLE_W, height: CARD_H + 40 },
                cost: { label: 'Cost Area', mode: 'overlap-right', max: 10, width: COST_W, height: CARD_H + 40 },
                trash: { label: 'Trash', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 }
            }
        }
    }), []);

    const modKey = (side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`;

    // Render cards based on mode
    const renderCards = (cardsArr, mode, config) => {
        if (!cardsArr.length) return null;
        switch (mode) {
            case 'single': {
                const c = cardsArr[cardsArr.length - 1];
                return (
                    <img
                        key={c.id}
                        src={c.thumb}
                        alt={c.id}
                        style={{ width: CARD_W, height: 'auto' }}
                        onMouseEnter={() => setHovered(c)}
                        onMouseLeave={() => setHovered(null)}
                    />
                );
            }
            case 'stacked': {
                // Special handling: for Deck, render a visible stack using back image if provided
                const isDeck = /deck/i.test(config.label || '');
                if (isDeck) {
                    // Visual cap: render roughly half the stack, up to 30
                    const visualHalf = Math.ceil(cardsArr.length * 0.5);
                    const toShow = Math.max(1, Math.min(visualHalf, 30));
                    const offset = 0.8; // tighter offset to avoid tall stacks
                    return (
                        <Box position="relative" width={CARD_W} height={CARD_H} sx={{ pointerEvents: 'none' }}>
                            {Array.from({ length: toShow }, (_, i) => i).map((i) => {
                                const idx = cardsArr.length - 1 - i;
                                const c = cardsArr[idx];
                                return (
                                    <img
                                        key={idx}
                                        src={c?.thumb || CARD_BACK_URL}
                                        alt={c?.id || 'BACK'}
                                        style={{ position: 'absolute', top: i * -offset, left: i * -offset, width: CARD_W, height: 'auto', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                                    />
                                );
                            })}
                        </Box>
                    );
                }
                const c = cardsArr[cardsArr.length - 1];
                return (
                    <img
                        key={c.id}
                        src={c.thumb}
                        alt={c.id}
                        style={{ width: CARD_W, height: 'auto' }}
                        onMouseEnter={() => setHovered(c)}
                        onMouseLeave={() => setHovered(null)}
                    />
                );
            }
            case 'side-by-side': {
                return (
                    <Box display="flex" gap={1}>
                        {cardsArr.map(c => (
                            <img
                                key={c.id + Math.random()}
                                src={c.thumb}
                                alt={c.id}
                                style={{ width: CARD_W, height: 'auto' }}
                                onMouseEnter={() => setHovered(c)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        ))}
                    </Box>
                );
            }
            case 'overlap-right': {
                return (
                    <Box position="relative" width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET} height={CARD_H}>
                        {cardsArr.map((c, i) => (
                            <img
                                key={c.id + i}
                                src={c.thumb}
                                alt={c.id}
                                style={{ position: 'absolute', top: 0, left: i * OVERLAP_OFFSET, width: CARD_W }}
                                onMouseEnter={() => setHovered(c)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        ))}
                    </Box>
                );
            }
            case 'overlap-vertical': {
                return (
                    <Box position="relative" width={CARD_W} height={CARD_H + (cardsArr.length - 1) * OVERLAP_OFFSET}>
                        {cardsArr.map((c, i) => (
                            <img
                                key={c.id + i}
                                src={/life/i.test(config.label || '') ? CARD_BACK_URL : c.thumb}
                                alt={c.id}
                                style={{ position: 'absolute', top: i * OVERLAP_OFFSET, left: 0, width: CARD_W }}
                                onMouseEnter={() => setHovered(c)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        ))}
                    </Box>
                );
            }
            default:
                return null;
        }
    };

    const AreaBox = ({ side, section, keyName, config }) => {
        const isNested = typeof areaConfigs[side][section].mode !== 'string';
        const cardsArr = isNested ? areas[side][section][keyName] : areas[side][section];
        const mode = config.mode;
        const isPlayerHand = side === 'player' && section === 'bottom' && keyName === 'hand';
        const isOppHand = side === 'opponent' && section === 'top' && keyName === 'hand';
        const isActiveLeader = side === turnSide && section === 'middle' && keyName === 'leader';

        return (
            <Paper
                variant="outlined"
                onClick={!gameStarted ? () => addCardToArea(side, section, keyName) : undefined}
                onContextMenu={(e) => { if (gameStarted) { e.preventDefault(); return; } e.preventDefault(); removeCardFromArea(side, section, keyName); }}
                sx={{ p: 0, bgcolor: '#3c3c3c', color: 'white', width: config.width, height: config.height, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: gameStarted ? 'default' : 'pointer', userSelect: 'none', borderWidth: isActiveLeader ? 2 : 1, borderColor: isActiveLeader ? '#ffc107' : 'divider' }}
            >
                <Box flexGrow={1} display="flex" alignItems={mode === 'side-by-side' ? 'center' : 'flex-start'} justifyContent="flex-start" position="relative" sx={{ pt: 4 }}>
                    {/* Overlay label on top of cards */}
                    <Box sx={{ position: 'absolute', top: 4, left: 6, right: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2, pointerEvents: 'none' }}>
                        <Typography variant="caption" fontWeight={700} sx={{ fontSize: compactMode ? 13 : 15, lineHeight: 1.1, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{config.label}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.9, fontSize: compactMode ? 13 : 15, lineHeight: 1.1, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>({cardsArr.length})</Typography>
                    </Box>
                    {(isPlayerHand || isOppHand) && mode === 'overlap-right' ? (
                        <Box position="relative" width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET} height={CARD_H}>
                            {cardsArr.map((c, i) => {
                                // RULE ENFORCEMENT: Only allow interaction with cards when it's that side's turn
                                // Rule 6-5-3: Only the turn player can play cards during their Main Phase
                                const isThisSideTurn = side === turnSide;
                                // Allow interaction during Main Phase on your turn, OR during Counter Step if you're defending
                                const isDefendingInCounter = battle && battle.step === 'counter' && battle.target.side === side;
                                const canInteract = (isThisSideTurn && phase?.toLowerCase() === 'main') || isDefendingInCounter;
                                const cursor = canInteract ? 'pointer' : 'not-allowed';
                                const opacity = canInteract ? 1 : 0.6;
                                return (
                                    <img
                                        key={c.id + i}
                                        src={c.thumb}
                                        alt={c.id}
                                        data-cardkey={modKey(side, section, keyName, i)}
                                        style={{ position: 'absolute', top: 0, left: i * OVERLAP_OFFSET, width: CARD_W, cursor, opacity, outline: actionOpen && actionCardIndex === i && canInteract ? '3px solid #90caf9' : 'none', borderRadius: '2px' }}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            if (canInteract) {
                                                openCardAction(c, i, { side, section, keyName, index: i }); 
                                            }
                                        }}
                                        onMouseEnter={() => setHovered(c)}
                                        onMouseLeave={() => setHovered(null)}
                                    />
                                );
                            })}
                        </Box>
                    ) : (
                        ((side === 'player' && section === 'bottom' && keyName === 'cost') || (side === 'opponent' && section === 'top' && keyName === 'cost')) ? (
                            <Box position="relative" width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET} height={CARD_H}>
                                {cardsArr.map((c, i) => {
                                    const isDon = c.id === 'DON';
                                    const isActive = isDon && !c.rested;
                                    const isSelected = donGivingMode?.active && donGivingMode.selectedDonIndex === i && donGivingMode.side === side;
                                    const canSelect = isDon && isActive && !donGivingMode?.active && phase?.toLowerCase() === 'main' && turnSide === side && !battle;
                                    return (
                                        <img
                                            key={(c.id || 'card') + '-' + i}
                                            src={c.thumb}
                                            alt={c.id}
                                            style={{ 
                                                position: 'absolute', 
                                                top: 0, 
                                                left: i * OVERLAP_OFFSET, 
                                                width: CARD_W, 
                                                borderRadius: '2px',
                                                transform: c.id === 'DON' && c.rested ? 'rotate(90deg)' : 'none', 
                                                transformOrigin: 'center center',
                                                cursor: canSelect ? 'pointer' : 'default',
                                                outline: isSelected ? '3px solid #ffc107' : 'none',
                                                boxShadow: canSelect ? '0 0 8px rgba(255,193,7,0.5)' : 'none'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (canSelect && startDonGiving) {
                                                    startDonGiving(side, i);
                                                }
                                            }}
                                            onMouseEnter={() => setHovered(c)}
                                            onMouseLeave={() => setHovered(null)}
                                        />
                                    );
                                })}
                            </Box>
                        ) : (side === 'player' && section === 'char') ? (
                            <Box display="flex" gap={1}>
                                {cardsArr.map((c, i) => {
                                    const isValidDonTarget = donGivingMode?.active && donGivingMode.side === 'player' && !battle;
                                    return (
                                    <Box key={c.id + '-' + i} sx={{ position: 'relative' }}>
                                        {/* Physical DON!! cards underneath - stacked upright below and left */}
                                        {(() => {
                                            const donArr = areas?.player?.charDon?.[i] || [];
                                            if (donArr.length === 0) return null;
                                            const offsetX = 8; // Horizontal offset (left)
                                            const offsetY = 8; // Vertical offset (down)
                                            const baseOffsetX = 15; // Base offset for first DON!!
                                            const baseOffsetY = 15; // Base offset for first DON!!
                                            // Reverse the array so first DON!! renders last (on top)
                                            const reversedDonArr = [...donArr].reverse();
                                            return (
                                                <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                                                    {reversedDonArr.map((don, di) => {
                                                        // Use original index for positioning
                                                        const originalIndex = donArr.length - 1 - di;
                                                        return (
                                                            <img
                                                                key={`don-${i}-${originalIndex}`}
                                                                src={don.thumb}
                                                                alt="DON"
                                                                style={{ 
                                                                    position: 'absolute',
                                                                    top: baseOffsetY + (originalIndex * offsetY),
                                                                    left: -(baseOffsetX + (originalIndex * offsetX)),
                                                                    width: CARD_W, 
                                                                    height: 'auto',
                                                                    borderRadius: '2px',
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                                                    border: '1px solid #ffc107',
                                                                    zIndex: di
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </Box>
                                            );
                                        })()}
                                        <img
                                            src={c.thumb}
                                            alt={c.id}
                                            data-cardkey={modKey('player', 'char', 'char', i)}
                                            style={{
                                                width: CARD_W, height: 'auto', cursor: (targeting.active && targeting.side === 'player' && ((targeting.section === 'char' && targeting.keyName === 'char') || targeting.multi)) ? 'crosshair' : (isValidDonTarget ? 'pointer' : 'pointer'), borderRadius: '2px', transform: c.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', outline: (() => {
                                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i) : (targeting.active && targeting.side === 'player' && targeting.section === 'char' && targeting.keyName === 'char' && targeting.selectedIdx.includes(i));
                                                    if (selected) return '3px solid #ff9800';
                                                    if (isValidDonTarget) return '3px solid #66bb6a';
                                                    return 'none';
                                                })(),
                                                boxShadow: isValidDonTarget ? '0 0 12px rgba(102,187,106,0.6)' : 'none',
                                                position: 'relative',
                                                zIndex: 1
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Handle DON!! giving
                                                if (isValidDonTarget && giveDonToCard) {
                                                    giveDonToCard('player', 'char', 'char', i);
                                                    return;
                                                }
                                                // Handle targeting for other purposes
                                                if (targeting.active && targeting.side === 'player' && ((targeting.section === 'char' && targeting.keyName === 'char') || targeting.multi)) {
                                                    const ctx = { side: 'player', section: 'char', keyName: 'char', index: i };
                                                    const valid = typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true;
                                                    if (!valid) return;
                                                    setTargeting((prev) => {
                                                        if (prev.multi) {
                                                            const has = prev.selected.some(s => s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i);
                                                            let selected = has ? prev.selected.filter((s) => !(s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i)) : [...prev.selected, ctx];
                                                            if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                            return { ...prev, selected };
                                                        } else {
                                                            const has = prev.selectedIdx.includes(i);
                                                            let selectedIdx = has ? prev.selectedIdx.filter((x) => x !== i) : [...prev.selectedIdx, i];
                                                            if (selectedIdx.length > prev.max) selectedIdx = selectedIdx.slice(-prev.max);
                                                            return { ...prev, selectedIdx };
                                                        }
                                                    });
                                                    return;
                                                }
                                                openCardAction(c, i, { side: 'player', section: 'char', keyName: 'char', index: i });
                                            }}
                                            onMouseEnter={() => setHovered(c)}
                                            onMouseLeave={() => setHovered(null)}
                                        />
                                        {/* Power modifier badge */}
                                        {(() => {
                                            const delta = getPowerMod('player', 'char', 'char', i);
                                            if (delta === 0) return null;
                                            return (
                                                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                                                    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.85)' }}>
                                                        <Typography variant="h5" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
                                                    </Box>
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                    );
                                })}
                            </Box>
                        ) : (side === 'opponent' && section === 'char') ? (
                            <Box display="flex" gap={1}>
                                {cardsArr.map((c, i) => {
                                    const isTargetingHere = targeting.active && targeting.side === 'opponent' && (((targeting.section === 'char' && targeting.keyName === 'char')) || targeting.multi);
                                    const ctx = { side: 'opponent', section: 'char', keyName: 'char', index: i };
                                    const valid = isTargetingHere ? (typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true) : false;
                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === 'opponent' && s.section === 'char' && s.keyName === 'char' && s.index === i) : (isTargetingHere && targeting.selectedIdx.includes(i));
                                    return (
                                        <Box key={c.id + '-' + i} sx={{ position: 'relative' }}>
                                            {/* Physical DON!! cards underneath - stacked upright below and left */}
                                            {(() => {
                                                const donArr = areas?.opponent?.charDon?.[i] || [];
                                                if (donArr.length === 0) return null;
                                                const offsetX = 8; // Horizontal offset (left)
                                                const offsetY = 8; // Vertical offset (down)
                                                const baseOffsetX = 15; // Base offset for first DON!!
                                                const baseOffsetY = 15; // Base offset for first DON!!
                                                // Reverse the array so first DON!! renders last (on top)
                                                const reversedDonArr = [...donArr].reverse();
                                                return (
                                                    <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                                                        {reversedDonArr.map((don, di) => {
                                                            // Use original index for positioning
                                                            const originalIndex = donArr.length - 1 - di;
                                                            return (
                                                                <img
                                                                    key={`don-${i}-${originalIndex}`}
                                                                    src={don.thumb}
                                                                    alt="DON"
                                                                    style={{ 
                                                                        position: 'absolute',
                                                                        top: baseOffsetY + (originalIndex * offsetY),
                                                                        left: -(baseOffsetX + (originalIndex * offsetX)),
                                                                        width: CARD_W, 
                                                                        height: 'auto',
                                                                        borderRadius: '2px',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                                                        border: '1px solid #ffc107',
                                                                        zIndex: di
                                                                    }}
                                                                />
                                                            );
                                                        })}
                                                    </Box>
                                                );
                                            })()}
                                            <img
                                                src={c.thumb}
                                                alt={c.id}
                                                style={{
                                                    width: CARD_W, height: 'auto', cursor: isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : 'pointer', borderRadius: '2px', filter: isTargetingHere && !valid ? 'grayscale(0.9) brightness(0.6)' : 'none', transform: c.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', outline: (() => {
                                                        // Highlight eligible blockers during Block Step
                                                        if (battle && battle.step === 'block' && battle.target && battle.target.section !== 'char') {
                                                            const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                                            const active = !c.rested;
                                                            if (hasBlocker && active) return '3px solid #66bb6a';
                                                        }
                                                        return selected ? '3px solid #ff9800' : 'none';
                                                    })(),
                                                    position: 'relative',
                                                    zIndex: 1
                                                }}
                                                data-cardkey={modKey('opponent', 'char', 'char', i)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isTargetingHere) {
                                                        if (!valid) return;
                                                        setTargeting((prev) => {
                                                            if (prev.multi) {
                                                                const has = prev.selected.some(s => s.side === 'opponent' && s.section === 'char' && s.keyName === 'char' && s.index === i);
                                                                let selected = has ? prev.selected.filter((s) => !(s.side === 'opponent' && s.section === 'char' && s.keyName === 'char' && s.index === i)) : [...prev.selected, ctx];
                                                                if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                                // Update arrow preview with live power snapshot
                                                                if (selected.length && currentAttack) {
                                                                    const si = selected[selected.length - 1].index;
                                                                    const defP = getTotalPower('opponent', 'char', 'char', si, (areas?.opponent?.char || [])[si]?.id);
                                                                    setBattleArrow({ fromKey: currentAttack.key, toKey: modKey('opponent', 'char', 'char', si), label: `${currentAttack.power} ▶ ${defP}` });
                                                                }
                                                                return { ...prev, selected };
                                                            } else {
                                                                const has = prev.selectedIdx.includes(i);
                                                                let selectedIdx = has ? prev.selectedIdx.filter((x) => x !== i) : [...prev.selectedIdx, i];
                                                                if (selectedIdx.length > prev.max) selectedIdx = selectedIdx.slice(-prev.max);
                                                                return { ...prev, selectedIdx };
                                                            }
                                                        });
                                                        return;
                                                    }
                                                    openCardAction(c, i, { side: 'opponent', section: 'char', keyName: 'char', index: i });
                                                }}
                                                onMouseEnter={() => setHovered(c)}
                                                onMouseLeave={() => setHovered(null)}
                                            />
                                            {selected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(255,152,0,0.9)' }}>
                                                    <Typography variant="caption" sx={{ color: '#000', fontWeight: 700 }}>Target</Typography>
                                                </Box>
                                            )}
                                            {battle && battle.step === 'block' && battle.target && battle.target.section !== 'char' && (() => {
                                                const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                                const active = !c.rested;
                                                if (!hasBlocker || !active) return null;
                                                return (
                                                    <Box sx={{ position: 'absolute', bottom: 4, left: 4, right: 4 }}>
                                                        <Button size="small" fullWidth variant="contained" color="error" onClick={(e) => { e.stopPropagation(); applyBlocker(i); }}>
                                                            Use Blocker
                                                        </Button>
                                                    </Box>
                                                );
                                            })()}
                                            
                                            {/* Power modifier badge */}
                                            {(() => {
                                                const delta = getPowerMod('opponent', 'char', 'char', i);
                                                if (delta === 0) return null;
                                                return (
                                                    <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                                                        <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.85)' }}>
                                                            <Typography variant="h5" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
                                                        </Box>
                                                    </Box>
                                                );
                                            })()}
                                        </Box>
                                    );
                                })}
                            </Box>
                        ) : (section === 'middle' && keyName === 'leader') ? (
                            <Box position="relative" sx={{ width: CARD_W }}>
                                {(() => {
                                    const c = cardsArr[cardsArr.length - 1];
                                    const idx = 0;
                                    const isTargetingHere = targeting.active && targeting.side === side && (((targeting.section === 'middle' && targeting.keyName === 'leader')) || targeting.multi);
                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === side && s.section === 'middle' && s.keyName === 'leader' && s.index === idx) : (isTargetingHere && targeting.selectedIdx.includes(idx));
                                    const isValidDonTarget = donGivingMode?.active && donGivingMode.side === side && !battle;
                                    const onClick = (e) => {
                                        e.stopPropagation();
                                        // Handle DON!! giving
                                        if (isValidDonTarget && giveDonToCard) {
                                            giveDonToCard(side, 'middle', 'leader', idx);
                                            return;
                                        }
                                        // Handle targeting
                                        if (isTargetingHere) {
                                            const ctx = { side, section: 'middle', keyName: 'leader', index: idx };
                                            setTargeting((prev) => {
                                                if (prev.multi) {
                                                    const has = prev.selected.some(s => s.side === side && s.section === 'middle' && s.keyName === 'leader' && s.index === idx);
                                                    let selected = has ? prev.selected.filter((s) => !(s.side === side && s.section === 'middle' && s.keyName === 'leader' && s.index === idx)) : [...prev.selected, ctx];
                                                    if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                    if (selected.length && currentAttack) {
                                                        const defP = getTotalPower(side, 'middle', 'leader', idx, c?.id);
                                                        setBattleArrow({ fromKey: currentAttack.key, toKey: modKey(side, 'middle', 'leader', idx), label: `${currentAttack.power} ▶ ${defP}` });
                                                    }
                                                    return { ...prev, selected };
                                                } else {
                                                    const has = prev.selectedIdx.includes(idx);
                                                    let selectedIdx = has ? prev.selectedIdx.filter((x) => x !== idx) : [...prev.selectedIdx, idx];
                                                    if (selectedIdx.length > prev.max) selectedIdx = selectedIdx.slice(-prev.max);
                                                    return { ...prev, selectedIdx };
                                                }
                                            });
                                            return;
                                        }
                                        openCardAction(c, idx, { side, section: 'middle', keyName: 'leader', index: idx });
                                    };
                                    return (
                                        <>
                                            {/* Physical DON!! cards underneath - stacked upright below and left */}
                                            {(() => {
                                                const sideLoc = side === 'player' ? areas.player : areas.opponent;
                                                const donArr = sideLoc?.middle?.leaderDon || [];
                                                if (donArr.length === 0) return null;
                                                const offsetX = 8; // Horizontal offset (left)
                                                const offsetY = 8; // Vertical offset (down)
                                                const baseOffsetX = 15; // Base offset for first DON!!
                                                const baseOffsetY = 15; // Base offset for first DON!!
                                                // Reverse the array so first DON!! renders last (on top)
                                                const reversedDonArr = [...donArr].reverse();
                                                return (
                                                    <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                                                        {reversedDonArr.map((don, di) => {
                                                            // Use original index for positioning
                                                            const originalIndex = donArr.length - 1 - di;
                                                            return (
                                                                <img
                                                                    key={`leader-don-${originalIndex}`}
                                                                    src={don.thumb}
                                                                    alt="DON"
                                                                    style={{ 
                                                                        position: 'absolute',
                                                                        top: baseOffsetY + (originalIndex * offsetY),
                                                                        left: -(baseOffsetX + (originalIndex * offsetX)),
                                                                        width: CARD_W, 
                                                                        height: 'auto',
                                                                        borderRadius: '2px',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                                                        border: '1px solid #ffc107',
                                                                        zIndex: di
                                                                    }}
                                                                />
                                                            );
                                                        })}
                                                    </Box>
                                                );
                                            })()}
                                            <img
                                                src={c?.thumb}
                                                alt={c?.id}
                                                data-cardkey={modKey(side, 'middle', 'leader', idx)}
                                                style={{ 
                                                    width: CARD_W, 
                                                    height: 'auto', 
                                                    borderRadius: '2px', 
                                                    transform: c?.rested ? 'rotate(90deg)' : 'none', 
                                                    transformOrigin: 'center center', 
                                                    outline: (() => {
                                                        if (selected) return '3px solid #ff9800';
                                                        if (isValidDonTarget) return '3px solid #66bb6a';
                                                        return 'none';
                                                    })(), 
                                                    cursor: isTargetingHere || isValidDonTarget ? 'crosshair' : 'pointer',
                                                    boxShadow: isValidDonTarget ? '0 0 12px rgba(102,187,106,0.6)' : 'none',
                                                    position: 'relative',
                                                    zIndex: 1
                                                }}
                                                onClick={onClick}
                                                onMouseEnter={() => c && setHovered(c)}
                                                onMouseLeave={() => setHovered(null)}
                                            />
                                            {selected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(255,152,0,0.9)' }}>
                                                    <Typography variant="caption" sx={{ color: '#000', fontWeight: 700 }}>Target</Typography>
                                                </Box>
                                            )}
                                            
                                            {/* Power modifier badge */}
                                            {(() => {
                                                const delta = getPowerMod(side, 'middle', 'leader', idx);
                                                if (delta === 0) return null;
                                                return (
                                                    <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                                                        <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.85)' }}>
                                                            <Typography variant="h5" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
                                                        </Box>
                                                    </Box>
                                                );
                                            })()}
                                        </>
                                    );
                                })()}
                            </Box>
                        ) : (
                            renderCards(cardsArr, mode, config)
                        )
                    )}
                </Box>
            </Paper>
        );
    };

    return (
        <Box ref={boardOuterRef} sx={{ width: '100%', maxWidth: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            {/* Scaled Playmat Content */}
            <Box
                ref={contentRef}
                sx={{
                    width: 'fit-content',
                    transform: `scale(${boardScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 80ms linear',
                }}
            >
                {/* Opponent Side */}
                <Box>
                    <Stack direction="row" spacing={compactMode ? 0.5 : 1} sx={{ mb: compactMode ? 0.5 : 1 }}>
                        <AreaBox side="opponent" section="top" keyName="hand" config={areaConfigs.opponent.top.hand} />
                        <AreaBox side="opponent" section="top" keyName="trash" config={areaConfigs.opponent.top.trash} />
                        <AreaBox side="opponent" section="top" keyName="cost" config={areaConfigs.opponent.top.cost} />
                        <AreaBox side="opponent" section="top" keyName="don" config={areaConfigs.opponent.top.don} />
                    </Stack>
                    <Stack direction="row" spacing={compactMode ? 0.5 : 1} sx={{ mb: compactMode ? 0.5 : 1 }}>
                        <Box sx={{ width: COST_W }} />
                        <AreaBox side="opponent" section="middle" keyName="deck" config={areaConfigs.opponent.middle.deck} />
                        <AreaBox side="opponent" section="middle" keyName="stage" config={areaConfigs.opponent.middle.stage} />
                        <AreaBox side="opponent" section="middle" keyName="leader" config={areaConfigs.opponent.middle.leader} />
                    </Stack>
                    <Stack direction="row" spacing={compactMode ? 0.5 : 1} sx={{ mb: compactMode ? 0.5 : 1 }}>
                        <Box sx={{ width: COST_W }} />
                        <AreaBox side="opponent" section="char" keyName="char" config={areaConfigs.opponent.char} />
                        <AreaBox side="opponent" section="life" keyName="life" config={areaConfigs.opponent.life} />
                    </Stack>
                </Box>
                {/* Player Side */}
                <Box>
                    {/* Player top row: constrain row height to character area while letting life overflow without shifting horizontally */}
                    <Box sx={{ display: 'flex', position: 'relative', height: areaConfigs.player.char.height, mb: compactMode ? 0.5 : 1 }}>
                        <Box sx={{ width: COST_W, flexShrink: 0 }} />
                        <Box sx={{ width: LIFE_W, flexShrink: 0, overflow: 'visible', ml: compactMode ? 0.5 : 1 }}>
                            <AreaBox side="player" section="life" keyName="life" config={areaConfigs.player.life} />
                        </Box>
                        <Box sx={{ ml: compactMode ? 0.5 : 1 }}>
                            <AreaBox side="player" section="char" keyName="char" config={areaConfigs.player.char} />
                        </Box>
                    </Box>
                    {/* Player middle row: add left spacer to shift leader/stage right; deck aligned above trash */}
                    <Stack direction="row" spacing={compactMode ? 0.5 : 1} sx={{ mb: compactMode ? 0.5 : 1 }}>
                        <Box sx={{ width: COST_W + SINGLE_W + (compactMode ? 4 : 8) }} />
                        <Box sx={{ width: COST_W }}>
                            <Stack direction="row" spacing={compactMode ? 0.5 : 1} justifyContent="flex-end">
                                <AreaBox side="player" section="middle" keyName="leader" config={areaConfigs.player.middle.leader} />
                                <AreaBox side="player" section="middle" keyName="stage" config={areaConfigs.player.middle.stage} />
                            </Stack>
                        </Box>
                        <Box sx={{ width: SINGLE_W }}>
                            <AreaBox side="player" section="middle" keyName="deck" config={areaConfigs.player.middle.deck} />
                        </Box>
                    </Stack>
                    
                    {/* Player bottom row - Hand, DON, Cost, Trash - with relative positioning for overlays */}
                    <Box sx={{ position: 'relative' }}>
                        {/* Opening Hand and Deck Search slots - positioned absolutely above the hand */}
                        {(openingShown || deckSearchOpen) && (
                            <Box sx={{ 
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                mb: compactMode ? 0.5 : 1,
                                zIndex: 10
                            }}>
                                {openingShown && (
                                    <Box sx={{ mb: compactMode ? 0.5 : 1 }}>
                                        <OpeningHand
                                            open={openingShown}
                                            hand={openingHand}
                                            allowMulligan={allowMulligan}
                                            onMulligan={onMulligan}
                                            onKeep={onKeep}
                                            setHovered={setHovered}
                                            CARD_W={CARD_W}
                                        />
                                    </Box>
                                )}
                                {deckSearchOpen && (
                                    <DeckSearch
                                        open={deckSearchOpen}
                                        cards={deckSearchConfig.cards}
                                        quantity={deckSearchConfig.quantity}
                                        filter={deckSearchConfig.filter}
                                        minSelect={deckSearchConfig.minSelect}
                                        maxSelect={deckSearchConfig.maxSelect}
                                        returnLocation={deckSearchConfig.returnLocation}
                                        canReorder={deckSearchConfig.canReorder}
                                        effectDescription={deckSearchConfig.effectDescription}
                                        onConfirm={deckSearchConfig.onComplete}
                                        onCancel={() => setDeckSearchOpen(false)}
                                        getCardMeta={getCardMeta}
                                        setHovered={setHovered}
                                        CARD_W={CARD_W}
                                    />
                                )}
                            </Box>
                        )}
                        
                        <Stack direction="row" spacing={compactMode ? 0.5 : 1}>
                            <AreaBox side="player" section="bottom" keyName="hand" config={areaConfigs.player.bottom.hand} />
                            <AreaBox side="player" section="bottom" keyName="don" config={areaConfigs.player.bottom.don} />
                            <AreaBox side="player" section="bottom" keyName="cost" config={areaConfigs.player.bottom.cost} />
                            <AreaBox side="player" section="bottom" keyName="trash" config={areaConfigs.player.bottom.trash} />
                        </Stack>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
