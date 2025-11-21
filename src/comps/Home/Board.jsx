// Board.jsx
// Board layout and rendering for One Piece TCG Sim play area

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
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
    hasDisabledKeyword,
    applyBlocker,
    getPowerMod,
    getAuraPowerMod,
    getCardCost,
    getAuraCostMod,
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

    const modKey = useCallback((side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`, []);

    // Memoized helper functions
    const isLifeArea = useCallback((label) => /life/i.test(label || ''), []);
    const isDonPile = useCallback((label) => /\bdon\b/i.test(label || '') && !/cost/i.test(label || ''), []);
    const isDeckArea = useCallback((label) => /deck/i.test(label || ''), []);

    // Optimized hover handler
    const handleCardHover = useCallback((card, config) => {
        if (!card || card.id === 'DON' || card.id === 'DON_BACK') return;
        if (isLifeArea(config?.label)) return;
        setHovered(card);
    }, [isLifeArea, setHovered]);

    const handleCardLeave = useCallback(() => setHovered(null), [setHovered]);

    // Helper component for rendering stacked DON cards
    const DonStack = useCallback(({ donArr, cardIndex }) => {
        if (!donArr || donArr.length === 0) return null;
        const offsetX = 8;
        const offsetY = 8;
        const baseOffsetX = 15;
        const baseOffsetY = 15;
        const reversedDonArr = [...donArr].reverse();
        
        return (
            <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                {reversedDonArr.map((don, di) => {
                    const originalIndex = donArr.length - 1 - di;
                    return (
                        <img
                            key={`don-${cardIndex}-${originalIndex}`}
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
    }, [CARD_W]);

    // Helper component for rendering power modifiers and keyword badges
    const PowerBadge = useCallback(({ side, section, keyName, index, cardId }) => {
        const temp = typeof getPowerMod === 'function' ? getPowerMod(side, section, keyName, index) : 0;
        const aura = typeof getAuraPowerMod === 'function' ? getAuraPowerMod(side, section, keyName, index) : 0;
        const delta = (temp || 0) + (aura || 0);
        const hasBlocker = getKeywordsFor(cardId).some(k => /blocker/i.test(k));
        const blockerDisabled = hasDisabledKeyword && hasDisabledKeyword(side, section, keyName, index, 'Blocker');
        const showBlockerDisabled = hasBlocker && blockerDisabled;
        
        if (!delta && !showBlockerDisabled) return null;
        
        return (
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                {delta !== 0 && (
                    <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.85)' }}>
                        <Typography variant="h5" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>
                            {delta > 0 ? `+${delta}` : `${delta}`}
                        </Typography>
                    </Box>
                )}
                {showBlockerDisabled && (
                    <Box sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: 'rgba(239, 83, 80, 0.95)', border: '1px solid #d32f2f' }}>
                        <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                            Can't Block
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }, [getPowerMod, getAuraPowerMod, getKeywordsFor, hasDisabledKeyword]);

    // Render cards based on mode
    const renderCards = useCallback((cardsArr, mode, config) => {
        if (!cardsArr.length) return null;
        const isLife = isLifeArea(config.label);
        const isDon = isDonPile(config.label);
        const onHover = (c) => handleCardHover(c, config);
        const onLeave = handleCardLeave;
        switch (mode) {
            case 'single': {
                const c = cardsArr[cardsArr.length - 1];
                return (
                    <img
                        key={c.id}
                        src={c.thumb}
                        alt={c.id}
                        style={{ width: CARD_W, height: 'auto' }}
                        onMouseEnter={() => onHover(c)}
                        onMouseLeave={onLeave}
                    />
                );
            }
            case 'stacked': {
                // Special handling: for Deck, render a visible stack using back image if provided
                const isDeck = isDeckArea(config.label);
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
                        onMouseEnter={() => (isDon ? undefined : onHover(c))}
                        onMouseLeave={onLeave}
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
                                onMouseEnter={() => onHover(c)}
                                onMouseLeave={onLeave}
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
                                onMouseEnter={() => onHover(c)}
                                onMouseLeave={onLeave}
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
                                src={isLife ? CARD_BACK_URL : c.thumb}
                                alt={c.id}
                                style={{ position: 'absolute', top: i * OVERLAP_OFFSET, left: 0, width: CARD_W }}
                                onMouseEnter={() => onHover(c)}
                                onMouseLeave={onLeave}
                            />
                        ))}
                    </Box>
                );
            }
            default:
                return null;
        }
    }, [CARD_W, CARD_H, OVERLAP_OFFSET, CARD_BACK_URL, isLifeArea, isDonPile, isDeckArea, handleCardHover, handleCardLeave]);

    const AreaBox = ({ side, section, keyName, config }) => {
        const isNested = typeof areaConfigs[side][section].mode !== 'string';
        const cardsArr = isNested ? areas[side][section][keyName] : areas[side][section];
        const mode = config.mode;
        const isPlayerHand = side === 'player' && section === 'bottom' && keyName === 'hand';
        const isOppHand = side === 'opponent' && section === 'top' && keyName === 'hand';
        const isActiveLeader = side === turnSide && section === 'middle' && keyName === 'leader';
        
        // Check if this area can receive DON (leader or character areas)
        const canReceiveDon = (section === 'middle' && keyName === 'leader') || (section === 'char' && keyName === 'char');

        return (
            <Paper
                variant="outlined"
                data-area-box="true"
                onClick={(e) => {
                    if (donGivingMode?.active && !canReceiveDon) {
                        // Cancel DON giving if clicking on areas that can't receive DON
                        e.stopPropagation();
                        cancelDonGiving();
                        return;
                    }
                    if (!gameStarted) {
                        addCardToArea(side, section, keyName);
                    }
                }}
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
                                // Allow interaction during Main Phase on your turn (no active battle), OR during Counter Step if you're defending
                                const isDefendingInCounter = battle && battle.step === 'counter' && battle.target.side === side;
                                const isDefendingInBlock = battle && battle.step === 'block' && battle.target.side === side;
                                const canInteract = (isThisSideTurn && phase?.toLowerCase() === 'main' && !battle) || isDefendingInCounter || isDefendingInBlock;
                                
                                // Check if targeting is active for this hand
                                const isTargetingHere = targeting.active && targeting.side === side && targeting.section === section && targeting.keyName === keyName;
                                const ctx = { side, section, keyName, index: i };
                                const valid = isTargetingHere ? (typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true) : false;
                                const selected = targeting.multi ? targeting.selected.some(s => s.side === side && s.section === section && s.keyName === keyName && s.index === i) : (isTargetingHere && targeting.selectedIdx.includes(i));
                                
                                // Override cursor and opacity for targeting mode
                                const cursor = isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : (canInteract ? 'pointer' : 'not-allowed');
                                const opacity = (isTargetingHere && !valid) ? 0.4 : (canInteract || isTargetingHere ? 1 : 0.6);
                                
                                const onClick = (e) => {
                                    e.stopPropagation();
                                    
                                    // Handle targeting selection
                                    if (isTargetingHere) {
                                        if (targeting.suspended) return;
                                        if (!valid) return;
                                        setTargeting((prev) => {
                                            if (prev.multi) {
                                                const has = prev.selected.some(s => s.side === side && s.section === section && s.keyName === keyName && s.index === i);
                                                let selected = has ? prev.selected.filter((s) => !(s.side === side && s.section === section && s.keyName === keyName && s.index === i)) : [...prev.selected, ctx];
                                                if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                return { ...prev, selected };
                                            } else {
                                                const has = prev.selectedIdx.includes(i);
                                                const selectedIdx = has ? prev.selectedIdx.filter((idx) => idx !== i) : [...prev.selectedIdx, i];
                                                return { ...prev, selectedIdx };
                                            }
                                        });
                                        return;
                                    }
                                    
                                    // Normal card action
                                    if (canInteract) {
                                        openCardAction(c, i, { side, section, keyName, index: i }); 
                                    }
                                };
                                
                                // Calculate cost modification for cards in hand
                                // Compute effective cost difference (base - effective)
                                let costDiff = 0;
                                if (typeof getCardMeta === 'function') {
                                    const meta = getCardMeta(c.id);
                                    const baseCost = meta?.stats?.cost || 0;
                                    if (typeof getCardCost === 'function') {
                                        const effective = getCardCost(c.id, side, section, keyName, i);
                                        costDiff = effective - baseCost; // negative indicates reduction
                                    }
                                }
                                
                                return (
                                    <Box key={c.id + i} sx={{ position: 'absolute', top: 0, left: i * OVERLAP_OFFSET }}>
                                        <img
                                            src={c.thumb}
                                            alt={c.id}
                                            data-cardkey={modKey(side, section, keyName, i)}
                                            style={{ 
                                                width: CARD_W, 
                                                cursor, 
                                                opacity, 
                                                outline: (actionOpen && actionCardIndex === i && canInteract) ? '3px solid #90caf9' : (selected ? '3px solid #ff9800' : 'none'), 
                                                borderRadius: '2px',
                                                filter: (isTargetingHere && !valid) ? 'grayscale(0.9) brightness(0.6)' : 'none'
                                            }}
                                            onClick={onClick}
                                            onMouseEnter={() => handleCardHover(c, config)}
                                            onMouseLeave={handleCardLeave}
                                        />
                                        {costDiff !== 0 && (
                                            <Box sx={{ position: 'absolute', top: 8, right: 8, px: 1, py: 0.5, borderRadius: 1, bgcolor: costDiff < 0 ? 'rgba(76,175,80,0.95)' : 'rgba(239,83,80,0.95)', border: costDiff < 0 ? '1px solid #4caf50' : '1px solid #ef5350', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                                                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                    {costDiff < 0 ? `${costDiff}` : `+${costDiff}`} cost
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
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
                                            onMouseEnter={() => handleCardHover(c, config)}
                                            onMouseLeave={handleCardLeave}
                                        />
                                    );
                                })}
                            </Box>
                        ) : (side === 'player' && section === 'char') ? (
                            <Box display="flex" gap={1}>
                                {cardsArr.map((c, i) => {
                                    const isValidDonTarget = donGivingMode?.active && donGivingMode.side === 'player' && !battle;
                                    const isTargetingHere = targeting.active && targeting.side === 'player' && (((targeting.section === 'char' && targeting.keyName === 'char')) || targeting.multi);
                                    const ctx = { side: 'player', section: 'char', keyName: 'char', index: i };
                                    const valid = isTargetingHere ? (typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true) : false;
                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i) : (isTargetingHere && targeting.selectedIdx.includes(i));
                                    return (
                                    <Box key={c.id + '-' + i} sx={{ position: 'relative' }}>
                                        <DonStack donArr={areas?.player?.charDon?.[i]} cardIndex={i} />
                                        <img
                                            src={c.thumb}
                                            alt={c.id}
                                            data-cardkey={modKey('player', 'char', 'char', i)}
                                            style={{
                                                width: CARD_W,
                                                height: 'auto',
                                                cursor: isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : (isValidDonTarget ? 'pointer' : 'pointer'),
                                                borderRadius: '2px',
                                                transform: c.rested ? 'rotate(90deg)' : 'none',
                                                transformOrigin: 'center center',
                                                filter: isTargetingHere && !valid ? 'grayscale(0.9) brightness(0.6)' : 'none',
                                                outline: (() => {
                                                    // Highlight eligible blockers during Block Step when player is defending (mirror opponent logic)
                                                    if (battle && battle.step === 'block' && battle.target && battle.target.side === 'player' && battle.target.section !== 'char') {
                                                        const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                                        const active = !c.rested;
                                                        const blockerDisabled = hasDisabledKeyword && hasDisabledKeyword('player', 'char', 'char', i, 'Blocker');
                                                        if (hasBlocker && active && !blockerDisabled) return '3px solid #66bb6a';
                                                    }
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
                                                if (isTargetingHere) {
                                                    if (targeting.suspended) return;
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
                                            onMouseEnter={() => handleCardHover(c, config)}
                                            onMouseLeave={handleCardLeave}
                                        />
                                        {battle && battle.step === 'block' && battle.target && battle.target.side === 'player' && battle.target.section !== 'char' && (() => {
                                            const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                            const active = !c.rested;
                                            const blockerDisabled = hasDisabledKeyword && hasDisabledKeyword('player', 'char', 'char', i, 'Blocker');
                                            if (!hasBlocker || !active || blockerDisabled) return null;
                                            return (
                                                <Box sx={{ position: 'absolute', bottom: 4, left: 4, right: 4 }}>
                                                    <Button size="small" fullWidth variant="contained" color="error" onClick={(e) => { e.stopPropagation(); applyBlocker(i); }}>
                                                        Use Blocker
                                                    </Button>
                                                </Box>
                                            );
                                        })()}
                                        <PowerBadge 
                                            side="player" 
                                            section="char" 
                                            keyName="char" 
                                            index={i} 
                                            cardId={c.id} 
                                        />
                                    </Box>
                                    );
                                })}
                            </Box>
                        ) : (side === 'opponent' && section === 'char') ? (
                            <Box display="flex" gap={1}>
                                {cardsArr.map((c, i) => {
                                    const isValidDonTarget = donGivingMode?.active && donGivingMode.side === 'opponent' && !battle;
                                    const isTargetingHere = targeting.active && targeting.side === 'opponent' && (((targeting.section === 'char' && targeting.keyName === 'char')) || targeting.multi);
                                    const ctx = { side: 'opponent', section: 'char', keyName: 'char', index: i };
                                    const valid = isTargetingHere ? (typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true) : false;
                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === 'opponent' && s.section === 'char' && s.keyName === 'char' && s.index === i) : (isTargetingHere && targeting.selectedIdx.includes(i));
                                    return (
                                        <Box key={c.id + '-' + i} sx={{ position: 'relative' }}>
                                            <DonStack donArr={areas?.opponent?.charDon?.[i]} cardIndex={i} />
                                            <img
                                                src={c.thumb}
                                                alt={c.id}
                                                style={{
                                                    width: CARD_W,
                                                    height: 'auto',
                                                    cursor: isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : (isValidDonTarget ? 'pointer' : 'pointer'),
                                                    borderRadius: '2px',
                                                    filter: isTargetingHere && !valid ? 'grayscale(0.9) brightness(0.6)' : 'none',
                                                    transform: c.rested ? 'rotate(90deg)' : 'none',
                                                    transformOrigin: 'center center',
                                                    outline: (() => {
                                                        // Highlight eligible blockers during Block Step
                                                        if (battle && battle.step === 'block' && battle.target && battle.target.section !== 'char') {
                                                            const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                                            const active = !c.rested;
                                                            const blockerDisabled = hasDisabledKeyword && hasDisabledKeyword('opponent', 'char', 'char', i, 'Blocker');
                                                            if (hasBlocker && active && !blockerDisabled) return '3px solid #66bb6a';
                                                        }
                                                        if (selected) return '3px solid #ff9800';
                                                        if (isValidDonTarget) return '3px solid #66bb6a';
                                                        return 'none';
                                                    })(),
                                                    position: 'relative',
                                                    zIndex: 1
                                                }}
                                                data-cardkey={modKey('opponent', 'char', 'char', i)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Handle DON!! giving for opponent side
                                                    if (isValidDonTarget && giveDonToCard) {
                                                        giveDonToCard('opponent', 'char', 'char', i);
                                                        return;
                                                    }
                                                    if (isTargetingHere) {
                                                        if (targeting.suspended) return;
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
                                                onMouseEnter={() => handleCardHover(c, config)}
                                                onMouseLeave={handleCardLeave}
                                            />
                                            {selected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(255,152,0,0.9)' }}>
                                                    <Typography variant="caption" sx={{ color: '#000', fontWeight: 700 }}>Target</Typography>
                                                </Box>
                                            )}
                                            <PowerBadge 
                                                side="opponent" 
                                                section="char" 
                                                keyName="char" 
                                                index={i} 
                                                cardId={c.id} 
                                            />
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
                                    const ctx = { side, section: 'middle', keyName: 'leader', index: idx };
                                    const valid = isTargetingHere ? (typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true) : false;
                                    const onClick = (e) => {
                                        e.stopPropagation();
                                        // Handle DON!! giving
                                        if (isValidDonTarget && giveDonToCard) {
                                            giveDonToCard(side, 'middle', 'leader', idx);
                                            return;
                                        }
                                        // Handle targeting
                                        if (isTargetingHere) {
                                            if (targeting.suspended) return;
                                            if (!valid) return;
                                            setTargeting((prev) => {
                                                if (prev.multi) {
                                                    const has = prev.selected.some(s => s.side === side && s.section === 'middle' && s.keyName === 'leader' && s.index === idx);
                                                    let selected = has ? prev.selected.filter((s) => !(s.side === side && s.section === 'middle' && s.keyName === 'leader' && s.index === idx)) : [...prev.selected, ctx];
                                                    if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                    console.log('[targeting:update] leader selection', { sessionId: prev.sessionId, selected });
                                                    if (selected.length && currentAttack) {
                                                        const defP = getTotalPower(side, 'middle', 'leader', idx, c?.id);
                                                        setBattleArrow({ fromKey: currentAttack.key, toKey: modKey(side, 'middle', 'leader', idx), label: `${currentAttack.power} ▶ ${defP}` });
                                                    }
                                                    return { ...prev, selected };
                                                } else {
                                                    const has = prev.selectedIdx.includes(idx);
                                                    let selectedIdx = has ? prev.selectedIdx.filter((x) => x !== idx) : [...prev.selectedIdx, idx];
                                                    if (selectedIdx.length > prev.max) selectedIdx = selectedIdx.slice(-prev.max);
                                                    console.log('[targeting:update] leader single-selection', { sessionId: prev.sessionId, selectedIdx });
                                                    return { ...prev, selectedIdx };
                                                }
                                            });
                                            return;
                                        }
                                        openCardAction(c, idx, { side, section: 'middle', keyName: 'leader', index: idx });
                                    };
                                    return (
                                        <>
                                            <DonStack 
                                                donArr={(side === 'player' ? areas.player : areas.opponent)?.middle?.leaderDon} 
                                                cardIndex="leader" 
                                            />
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
                                                    filter: isTargetingHere && !valid ? 'grayscale(0.9) brightness(0.6)' : 'none',
                                                    outline: (() => {
                                                        if (selected) return '3px solid #ff9800';
                                                        if (isValidDonTarget) return '3px solid #66bb6a';
                                                        return 'none';
                                                    })(), 
                                                    cursor: isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : (isValidDonTarget ? 'pointer' : 'pointer'),
                                                    boxShadow: isValidDonTarget ? '0 0 12px rgba(102,187,106,0.6)' : 'none',
                                                    position: 'relative',
                                                    zIndex: 1
                                                }}
                                                onClick={onClick}
                                                onMouseEnter={() => c && handleCardHover(c, config)}
                                                onMouseLeave={handleCardLeave}
                                            />
                                            {selected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(255,152,0,0.9)' }}>
                                                    <Typography variant="caption" sx={{ color: '#000', fontWeight: 700 }}>Target</Typography>
                                                </Box>
                                            )}
                                            
                                            <PowerBadge 
                                                side={side} 
                                                section="middle" 
                                                keyName="leader" 
                                                index={idx} 
                                                cardId={c?.id} 
                                            />
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
        <Box 
            ref={boardOuterRef} 
            sx={{ width: '100%', maxWidth: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
            onClick={(e) => {
                // Cancel DON giving mode when clicking on the board background
                if (donGivingMode?.active && e.target === e.currentTarget) {
                    cancelDonGiving();
                }
            }}
        >
            {/* Scaled Playmat Content */}
            <Box
                ref={contentRef}
                sx={{
                    width: 'fit-content',
                    transform: `scale(${boardScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 80ms linear',
                }}
                onClick={(e) => {
                    // Cancel DON giving mode when clicking anywhere in the play area (except DON cards and valid targets)
                    if (donGivingMode?.active) {
                        // Check if clicked element is a card image or area box
                        const target = e.target;
                        const clickedCard = target.tagName === 'IMG';
                        const clickedInsideAreaBox = target.closest('[data-area-box]');
                        
                        // If not clicking a card or clicking an area that's not a valid target, cancel
                        if (!clickedCard && !clickedInsideAreaBox) {
                            cancelDonGiving();
                        }
                    }
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
