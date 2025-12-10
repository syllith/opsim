// Board.jsx
// Board layout and rendering for One Piece TCG Sim play area

import React, {
    useMemo,
    useRef,
    useEffect,
    useLayoutEffect,
    useState,
    useCallback
} from 'react';
import _ from 'lodash';
import { Box, Paper, Typography, Button, Chip, Stack, Alert } from '@mui/material';
import OpeningHand from './OpeningHand';
import { useDeckSearch } from './DeckSearch';
import CardViewer from './CardViewer';

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
    //. Opening Hand props
    openingHandRef,
    openingHandShown,
    setOpeningHandShown,
    currentHandSide,
    onHandSelected,
    firstPlayer,
    playerHandSelected = false,
    opponentHandSelected = false,
    setupPhase = null,
    //. Deck Search props
    deckSearchRef,
    library,
    oppLibrary,
    setLibrary,
    setOppLibrary,
    getAssetForId,
    createCardBacks,
    appendLog,
    getCardMeta,
    //. Card Viewer props
    selectedCard,
    cardError,
    loadingCards,
    log,
    //. Turn management
    setTurnSide,
    setTurnNumber,
    executeRefreshPhase,
    setPhase,
    //. Multiplayer props
    isMultiplayer = false,
    isMyTurn = true,
    multiplayerRole = null,
    isHost = true,
    onGuestAction = null,
    markHandSelectedLocally = null,
    onBroadcastStateRef = null
}) {
    //. Sizing constants (match Fyne layout intent)
    const CARD_W = 120;
    const CARD_H = 167;

    //. In multiplayer, guest needs to see the board flipped (their cards at bottom)
    //. This maps visual position to data side
    //. Host: top='opponent', bottom='player' (normal)
    //. Guest: top='player', bottom='opponent' (flipped - guest's data is in 'opponent')
    const shouldFlipBoard = isMultiplayer && multiplayerRole === 'opponent';
    
    //. The side shown at top of screen (enemy from viewer's perspective)
    const topSide = shouldFlipBoard ? 'player' : 'opponent';
    //. The side shown at bottom of screen (viewer's own side)  
    const bottomSide = shouldFlipBoard ? 'opponent' : 'player';

    //. Determine if player can interact with a specific side
    //. This checks if the current player controls that side and can act on it
    const canInteractWithSide = useCallback((side, options = {}) => {
        const { allowDefending = false } = options;
        
        if (!isMultiplayer) return true; // Not multiplayer, all interactions allowed
        
        // In multiplayer, you can only interact with your own side
        // 'player' role controls 'player' side, 'opponent' role controls 'opponent' side
        const controlsSide = multiplayerRole === side;
        
        // If you don't control this side, no interaction allowed
        if (!controlsSide) return false;
        
        // During your own turn, you can act on your side
        if (isMyTurn) return true;
        
        // During opponent's turn, you can only defend (block, counter)
        // This is controlled by the allowDefending option
        if (allowDefending) return true;
        
        return false;
    }, [isMultiplayer, isMyTurn, multiplayerRole]);

    //. Check if we're in a defending situation (opponent attacking our side)
    const isDefendingPhase = useCallback((side) => {
        if (!battle) return false;
        // We're defending if the battle target is on our side
        return battle.target?.side === side && (battle.step === 'block' || battle.step === 'counter');
    }, [battle]);

    //. Initialize DeckSearch hooks for player and opponent
    const playerDeckSearch = useDeckSearch({
        side: 'player',
        library,
        setLibrary,
        getAssetForId,
        getCardMeta,
        createCardBacks,
        setAreas,
        appendLog,
        setHovered,
        CARD_W
    });

    const opponentDeckSearch = useDeckSearch({
        side: 'opponent',
        library: oppLibrary,
        setLibrary: setOppLibrary,
        getAssetForId,
        getCardMeta,
        createCardBacks,
        setAreas,
        appendLog,
        setHovered,
        CARD_W
    });

    //. Expose the start functions via ref for Home.jsx to call
    useEffect(() => {
        if (deckSearchRef) {
            deckSearchRef.current = {
                start: (config) => {
                    console.log('[Board] deckSearchRef.start called with config:', config);
                    const { side } = config;
                    if (side === 'player') {
                        console.log('[Board] Delegating to playerDeckSearch.start');
                        playerDeckSearch.start(config);
                    } else {
                        console.log('[Board] Delegating to opponentDeckSearch.start');
                        opponentDeckSearch.start(config);
                    }
                },
                active: playerDeckSearch.active || opponentDeckSearch.active
            };
        }
    }, [deckSearchRef, playerDeckSearch, opponentDeckSearch]);

    const OVERLAP_OFFSET = 22;
    const COST_W = 650;      //. width of cost area fan
    const SINGLE_W = CARD_W; //. deck, trash, don, leader, stage
    const LIFE_W = CARD_W;   //. life column width
    const CHAR_W = COST_W + SINGLE_W; //. character area spans cost + trash widths
    const LIFE_MAX_VISIBLE = 5;       //. overlapped vertical stack height control

    //. Base board dimensions used for scaling calculations (unscaled layout)
    const BASE_BOARD_WIDTH = CHAR_W + LIFE_W + 32; //. includes inter-column gap

    //. Ref to the inner unscaled content so we can measure actual intrinsic size
    const contentRef = useRef(null);

    //. Scale-to-fit state and measurement refs
    const boardOuterRef = useRef(null);
    const [boardScale, setBoardScale] = useState(1);
    const compactMode = boardScale < 0.9 || compact;
    const topHandRef = useRef(null);
    const bottomHandRef = useRef(null);
    const [viewerBounds, setViewerBounds] = useState(null);
    const [handOverlayPos, setHandOverlayPos] = useState(null);

    //. Viewer / overlay measurement (must be defined before callbacks that reference it)
    const measureViewer = useCallback(() => {
        const topEl = topHandRef.current;
        const bottomEl = bottomHandRef.current;
        const containerEl = contentRef.current;
        const scale = boardScale || 1;

        if (!topEl || !bottomEl || !containerEl || !scale) {
            setViewerBounds(null);
            setHandOverlayPos(null);
            return;
        }

        const topRect = topEl.getBoundingClientRect();
        const bottomRect = bottomEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        const rawLeft = topRect.left - containerRect.left;
        const rawTop = topRect.bottom - containerRect.top;
        const rawBottom = bottomRect.top - containerRect.top;

        //. Add spacing around viewer so it doesn't touch slots
        const vPad = compactMode ? 24 : 32;
        const hPad = compactMode ? 16 : 24;

        const heightRaw = rawBottom - rawTop;
        if (heightRaw <= 0 || topRect.width <= 0) {
            setViewerBounds(null);
            setHandOverlayPos(null);
            return;
        }

        setViewerBounds({
            left: (rawLeft + hPad) / scale,
            top: (rawTop + vPad) / scale,
            width: Math.max(0, (topRect.width - hPad * 2) / scale),
            height: Math.max(0, (heightRaw - vPad * 2) / scale)
        });

        //. Position OpeningHand / DeckSearch overlay above player's hand
        const handLeft = bottomRect.left - containerRect.left;
        const handTop = bottomRect.top - containerRect.top;

        setHandOverlayPos({
            left: handLeft / scale,
            top: handTop / scale,
            width: bottomRect.width / scale
        });
    }, [boardScale, compactMode]);

    //. Unified measurement utilities (scale + overlay bounds) to better handle maximize/fullscreen/orientation
    const performScaleMeasure = useCallback(() => {
        const el = boardOuterRef.current;
        const content = contentRef.current;
        if (!el || !content) { return; }

        const availableWidth = el.clientWidth || BASE_BOARD_WIDTH;
        const rect = el.getBoundingClientRect();

        //. Use visual viewport height if available (accounts for browser UI changes)
        const viewportH =
            (window.visualViewport && window.visualViewport.height) ||
            window.innerHeight;

        const availableHeight = Math.max(200, viewportH - rect.top - 12);
        const baseW = content.scrollWidth || BASE_BOARD_WIDTH;
        const baseH = content.scrollHeight || (CARD_H * 4 + 200);

        const sW = availableWidth / baseW;
        const sH = availableHeight / baseH;

        const next = _.clamp(Math.min(sW, sH), 0.2, 1.4);
        setBoardScale(next);
    }, [BASE_BOARD_WIDTH, CARD_H]);

    const triggerAllMeasures = useCallback(() => {
        //. Run scale measure then viewer measure in successive frames to allow layout stabilization
        performScaleMeasure();
        requestAnimationFrame(() => {
            performScaleMeasure(); // second pass for cases like maximize where scroll dims change after repaint
            measureViewer();
            requestAnimationFrame(measureViewer); // third pass ensures accurate after transform scale change
        });
    }, [performScaleMeasure, measureViewer]);

    //. Initial mount & window resize/orientation/fullscreen listeners
    useLayoutEffect(() => {
        let resizeRaf = 0;
        const onResize = () => {
            if (resizeRaf) { cancelAnimationFrame(resizeRaf); }
            resizeRaf = requestAnimationFrame(triggerAllMeasures);
        };
        onResize();
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        document.addEventListener('fullscreenchange', onResize);
        return () => {
            if (resizeRaf) { cancelAnimationFrame(resizeRaf); }
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
            document.removeEventListener('fullscreenchange', onResize);
        };
    }, [triggerAllMeasures]);

    //. Observe element size changes (e.g., dynamic content) using ResizeObserver
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') { return; }
        const observers = [];
        const createObserver = (target) => {
            if (!target) { return; }
            const ro = new ResizeObserver(() => triggerAllMeasures());
            ro.observe(target);
            observers.push(ro);
        };
        createObserver(boardOuterRef.current);
        createObserver(contentRef.current);
        return () => observers.forEach(o => o.disconnect());
    }, [triggerAllMeasures]);

    //. Recalculate after fonts load (affects intrinsic scrollWidth/scrollHeight)
    useEffect(() => {
        if (document?.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => triggerAllMeasures());
        }
    }, [triggerAllMeasures]);

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            measureViewer();
        });
        return () => cancelAnimationFrame(raf);
    }, [measureViewer, areas, boardScale, compactMode, deckSearchRef]);

    useEffect(() => {
        window.addEventListener('resize', measureViewer);
        return () => window.removeEventListener('resize', measureViewer);
    }, [measureViewer]);

    //. Each area keeps an array of cards; config carries layout + fixed pixel width/height
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
            bottom: {
                hand: { label: 'Opp Hand', mode: 'overlap-right', max: 999, width: COST_W, height: CARD_H + 40 },
                don: { label: 'Don', mode: 'stacked', max: 10, width: SINGLE_W, height: CARD_H + 40 },
                cost: { label: 'Opp Cost Area', mode: 'overlap-right', max: 10, width: COST_W, height: CARD_H + 40 },
                trash: { label: 'Trash', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 }
            },
            char: { label: 'Opp Character Area (5 cards)', mode: 'side-by-side', max: 5, width: CHAR_W, height: CARD_H + 40 },
            life: { label: 'Life', mode: 'overlap-vertical', max: 5, width: LIFE_W, height: CARD_H + 40 + (LIFE_MAX_VISIBLE - 1) * OVERLAP_OFFSET }
        },
        player: {
            top: {
                hand: { label: 'Hand', mode: 'overlap-right', max: 999, width: COST_W, height: CARD_H + 40 },
                trash: { label: 'Trash', mode: 'stacked', max: 999, width: SINGLE_W, height: CARD_H + 40 },
                cost: { label: 'Cost Area', mode: 'overlap-right', max: 10, width: COST_W, height: CARD_H + 40 },
                don: { label: 'Don', mode: 'stacked', max: 10, width: SINGLE_W, height: CARD_H + 40 }
            },
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
    }), [CARD_W, CARD_H, COST_W, SINGLE_W, CHAR_W, LIFE_W, OVERLAP_OFFSET, LIFE_MAX_VISIBLE]);

    const modKey = useCallback(
        (side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`,
        []
    );

    //. Memoized helper functions
    const isLifeArea = useCallback((label) => /life/i.test(label || ''), []);
    const isDonPile = useCallback(
        (label) => /\bdon\b/i.test(label || '') && !/cost/i.test(label || ''),
        []
    );
    const isDeckArea = useCallback((label) => /deck/i.test(label || ''), []);

    //. Optimized hover handler
    const handleCardHover = useCallback((card, config) => {
        if (!card || card.id === 'DON' || card.id === 'DON_BACK') { return; }
        if (isLifeArea(config?.label)) { return; }
        setHovered(card);
    }, [isLifeArea, setHovered]);

    const handleCardLeave = useCallback(
        () => setHovered(null),
        [setHovered]
    );

    //. Helper component for rendering stacked DON cards
    const DonStack = useCallback(({ donArr, cardIndex }) => {
        if (_.isEmpty(donArr)) { return null; }

        const offsetX = 8;
        const offsetY = 8;
        const baseOffsetX = 15;
        const baseOffsetY = 15;

        const reversedDonArr = [...donArr].reverse();
        //. If cardIndex is 'leader', set zIndex to 0.5 so DONs appear above cost area but below leader card
        const leaderZ = cardIndex === 'leader' ? 0.5 : 0;

        return (
            <Box sx={{ position: 'absolute', top: 0, left: 0, zIndex: leaderZ }}>
                {reversedDonArr.map((don, di) => {
                    const originalIndex = donArr.length - 1 - di;
                    const borderStyle = don.selected ? '1px solid #ffc107' : 'none';

                    return (
                        <img
                            key={`don-${cardIndex}-${originalIndex}`}
                            src={don.thumb}
                            alt='DON'
                            style={{
                                position: 'absolute',
                                top: baseOffsetY + (originalIndex * offsetY),
                                left: -(baseOffsetX + (originalIndex * offsetX)),
                                width: CARD_W,
                                height: 'auto',
                                borderRadius: '2px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                border: borderStyle,
                                zIndex: di
                            }}
                        />
                    );
                })}
            </Box>
        );
    }, [CARD_W]);

    //. Helper component for rendering power modifiers and keyword badges
    const PowerBadge = useCallback(({
        side,
        section,
        keyName,
        index,
        cardId
    }) => {
        const temp = typeof getPowerMod === 'function'
            ? getPowerMod(side, section, keyName, index)
            : 0;
        const aura = typeof getAuraPowerMod === 'function'
            ? getAuraPowerMod(side, section, keyName, index)
            : 0;

        const delta = (temp || 0) + (aura || 0);

        const hasBlocker = getKeywordsFor(cardId).some(k => /blocker/i.test(k));
        const blockerDisabled = hasDisabledKeyword &&
            hasDisabledKeyword(side, section, keyName, index, 'Blocker');
        const showBlockerDisabled = hasBlocker && blockerDisabled;

        if (!delta && !showBlockerDisabled) { return null; }

        return (
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0.5
                }}
            >
                {delta !== 0 && (
                    <Box
                        sx={{
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 1,
                            bgcolor: 'rgba(0,0,0,0.85)'
                        }}
                    >
                        <Typography
                            variant='h5'
                            sx={{
                                color: delta > 0 ? '#4caf50' : '#ef5350',
                                fontWeight: 700
                            }}
                        >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                        </Typography>
                    </Box>
                )}
                {showBlockerDisabled && (
                    <Box
                        sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: 'rgba(239, 83, 80, 0.95)',
                            border: '1px solid #d32f2f'
                        }}
                    >
                        <Typography
                            variant='caption'
                            sx={{
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Can't Block
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }, [getPowerMod, getAuraPowerMod, getKeywordsFor, hasDisabledKeyword]);

    //. Render cards based on mode
    const renderCards = useCallback((cardsArr, mode, config) => {
        if (_.isEmpty(cardsArr)) { return null; }

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
                //. Special handling: for Deck, render a visible stack using back image if provided
                const isDeck = isDeckArea(config.label);
                if (isDeck) {
                    //. Visual cap: render roughly half the stack, up to 30
                    const visualHalf = Math.ceil(cardsArr.length * 0.5);
                    const toShow = Math.max(1, Math.min(visualHalf, 30));
                    const offset = 0.8; // tighter offset to avoid tall stacks

                    return (
                        <Box
                            position='relative'
                            width={CARD_W}
                            height={CARD_H}
                            sx={{ pointerEvents: 'none' }}
                        >
                            {_.range(toShow).map((i) => {
                                const idx = cardsArr.length - 1 - i;
                                const c = cardsArr[idx];

                                return (
                                    <img
                                        key={idx}
                                        src={c?.thumb || CARD_BACK_URL}
                                        alt={c?.id || 'BACK'}
                                        style={{
                                            position: 'absolute',
                                            top: i * -offset,
                                            left: i * -offset,
                                            width: CARD_W,
                                            height: 'auto',
                                            borderRadius: '2px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.35)'
                                        }}
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
                    <Box display='flex' gap={1}>
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
                    <Box
                        position='relative'
                        width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET}
                        height={CARD_H}
                    >
                        {cardsArr.map((c, i) => (
                            <img
                                key={c.id + i}
                                src={c.thumb}
                                alt={c.id}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: i * OVERLAP_OFFSET,
                                    width: CARD_W
                                }}
                                onMouseEnter={() => onHover(c)}
                                onMouseLeave={onLeave}
                            />
                        ))}
                    </Box>
                );
            }
            case 'overlap-vertical': {
                return (
                    <Box
                        position='relative'
                        width={CARD_W}
                        height={CARD_H + (cardsArr.length - 1) * OVERLAP_OFFSET}
                    >
                        {cardsArr.map((c, i) => (
                            <img
                                key={c.id + i}
                                src={isLife ? CARD_BACK_URL : c.thumb}
                                alt={c.id}
                                style={{
                                    position: 'absolute',
                                    top: i * OVERLAP_OFFSET,
                                    left: 0,
                                    width: CARD_W
                                }}
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
    }, [
        CARD_W,
        CARD_H,
        OVERLAP_OFFSET,
        CARD_BACK_URL,
        isLifeArea,
        isDonPile,
        isDeckArea,
        handleCardHover,
        handleCardLeave
    ]);

    const AreaBox = ({ side, section, keyName, config, areaRef }) => {
        const nodeConfig = areaConfigs[side][section];
        const isNested = typeof nodeConfig.mode !== 'string';

        //. Map visual section to data section based on side
        //. Data is stored canonically: player uses 'bottom', opponent uses 'top'
        //. But the board can flip, so we need to map visual sections to data sections
        const getDataSection = (visualSide, visualSection) => {
            //. For nested sections (top/bottom), map to where data is actually stored
            if (visualSection === 'top' || visualSection === 'bottom') {
                //. Player's hand/don/cost/trash data is always in player.bottom
                //. Opponent's hand/don/cost/trash data is always in opponent.top
                if (visualSide === 'player') return 'bottom';
                if (visualSide === 'opponent') return 'top';
            }
            //. For non-nested sections (middle, char, life), use as-is
            return visualSection;
        };
        
        const dataSection = getDataSection(side, section);
        
        const cardsArr = isNested
            ? _.get(areas, [side, dataSection, keyName], [])
            : _.get(areas, [side, dataSection], []);

        const mode = config.mode;
        //. In the flipped view system:
        //. - section='bottom' + keyName='hand' = viewer's own hand (always visible)
        //. - section='top' + keyName='hand' = opponent's hand (show card backs in multiplayer)
        const isBottomHand = section === 'bottom' && keyName === 'hand';
        const isTopHand = section === 'top' && keyName === 'hand';
        const isActiveLeader = side === turnSide && section === 'middle' && keyName === 'leader';

        //. Check if this area can receive DON (leader or character areas)
        const canReceiveDon =
            (section === 'middle' && keyName === 'leader') ||
            (section === 'char' && keyName === 'char');

        //. Background colors (base vs active turn) for visual turn indication
        //. Use bottomSide to determine which color scheme (viewer's side is always the "player" color)
        const isViewerSide = side === bottomSide;
        const areaBgColor = isViewerSide ? '#455a64' : '#8d4343';

        return (
            <Paper
                variant='outlined'
                data-area-box='true'
                ref={areaRef}
                onClick={(e) => {
                    if (donGivingMode?.active && !canReceiveDon) {
                        //. Cancel DON giving if clicking on areas that can't receive DON
                        e.stopPropagation();
                        cancelDonGiving();
                        return;
                    }
                    if (!gameStarted) {
                        addCardToArea(side, section, keyName);
                    }
                }}
                onContextMenu={(e) => {
                    if (gameStarted) {
                        e.preventDefault();
                        return;
                    }
                    e.preventDefault();
                    removeCardFromArea(side, section, keyName);
                }}
                sx={{
                    p: 0,
                    bgcolor: areaBgColor,
                    transition: 'filter 600ms ease, background-color 600ms ease',
                    color: 'white',
                    width: config.width,
                    height: config.height,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: gameStarted ? 'default' : 'pointer',
                    userSelect: 'none',
                    borderWidth: isActiveLeader ? 2 : 1,
                    borderColor: isActiveLeader ? '#ffc107' : 'divider'
                }}
            >
                <Box
                    flexGrow={1}
                    display='flex'
                    alignItems={mode === 'side-by-side' ? 'center' : 'flex-start'}
                    justifyContent='flex-start'
                    position='relative'
                    sx={{ pt: 4 }}
                >
                    {/* Overlay label on top of cards */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 4,
                            left: 6,
                            right: 6,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            zIndex: 2,
                            pointerEvents: 'none'
                        }}
                    >
                        <Typography
                            variant='caption'
                            fontWeight={700}
                            sx={{
                                fontSize: compactMode ? 13 : 15,
                                lineHeight: 1.1,
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                            }}
                        >
                            {config.label}
                        </Typography>
                        <Typography
                            variant='caption'
                            sx={{
                                opacity: 0.9,
                                fontSize: compactMode ? 13 : 15,
                                lineHeight: 1.1,
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                            }}
                        >
                            ({cardsArr.length})
                        </Typography>
                    </Box>

                    {(isBottomHand || isTopHand) && mode === 'overlap-right' ? (
                        <Box
                            position='relative'
                            width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET}
                            height={CARD_H}
                        >
                            {cardsArr.map((c, i) => {
                                //. In multiplayer, hide opponent's hand from player (show card backs)
                                //. With the flipped view system:
                                //. - isTopHand = always the opponent's hand (top of screen)
                                //. - isBottomHand = always the viewer's own hand (bottom of screen)
                                //. So we show card backs for isTopHand in multiplayer
                                const isOpponentHand = isMultiplayer && isTopHand;
                                
                                //. RULE ENFORCEMENT: Only allow interaction with cards when it's that side's turn
                                //. Rule 6-5-3: Only the turn player can play cards during their Main Phase
                                const isThisSideTurn = side === turnSide;
                                const isDefendingInCounter =
                                    battle &&
                                    battle.step === 'counter' &&
                                    battle.target.side === side;
                                const isDefendingInBlock =
                                    battle &&
                                    battle.step === 'block' &&
                                    battle.target.side === side;
                                
                                //. In multiplayer, also check if this player controls this side
                                const controlsThisSide = canInteractWithSide(side, { 
                                    allowDefending: isDefendingInCounter || isDefendingInBlock 
                                });
                                
                                const canInteract =
                                    controlsThisSide && (
                                        (isThisSideTurn &&
                                            phase?.toLowerCase() === 'main' &&
                                            !battle) ||
                                        isDefendingInCounter ||
                                        isDefendingInBlock
                                    );

                                //. Check if targeting is active for this hand
                                const isTargetingHere =
                                    targeting.active &&
                                    targeting.side === side &&
                                    targeting.section === section &&
                                    targeting.keyName === keyName;

                                const ctx = { side, section, keyName, index: i };
                                const valid = isTargetingHere
                                    ? (typeof targeting.validator === 'function'
                                        ? targeting.validator(c, ctx)
                                        : true)
                                    : false;

                                const selected = targeting.multi
                                    ? targeting.selected.some(s =>
                                        s.side === side &&
                                        s.section === section &&
                                        s.keyName === 'hand' &&
                                        s.index === i
                                    )
                                    : (isTargetingHere &&
                                        targeting.selectedIdx.includes(i));

                                //. Override cursor and opacity for targeting mode
                                const cursor = isTargetingHere
                                    ? (valid ? 'crosshair' : 'not-allowed')
                                    : (canInteract ? 'pointer' : 'not-allowed');

                                const opacity =
                                    (isTargetingHere && !valid)
                                        ? 0.4
                                        : (canInteract || isTargetingHere ? 1 : 0.6);

                                const onClick = (e) => {
                                    e.stopPropagation();

                                    //. If a DON is selected from cost area, deselect it when selecting a card in hand
                                    if (donGivingMode?.active &&
                                        donGivingMode.side === side &&
                                        donGivingMode.selectedDonIndex != null) {
                                        cancelDonGiving();
                                    }

                                    //. Handle targeting selection
                                    if (isTargetingHere) {
                                        if (targeting.suspended) { return; }
                                        if (!valid) { return; }

                                        setTargeting((prev) => {
                                            if (prev.multi) {
                                                const has = prev.selected.some(
                                                    s =>
                                                        s.side === side &&
                                                        s.section === section &&
                                                        s.keyName === 'hand' &&
                                                        s.index === i
                                                );

                                                let selected = has
                                                    ? prev.selected.filter(
                                                        s =>
                                                            !(
                                                                s.side === side &&
                                                                s.section === section &&
                                                                s.keyName === 'hand' &&
                                                                s.index === i
                                                            )
                                                    )
                                                    : [...prev.selected, ctx];

                                                if (selected.length > prev.max) {
                                                    selected = selected.slice(-prev.max);
                                                }

                                                return { ...prev, selected };
                                            } else {
                                                const has = prev.selectedIdx.includes(i);
                                                const selectedIdx = has
                                                    ? prev.selectedIdx.filter(idx => idx !== i)
                                                    : [...prev.selectedIdx, i];

                                                return { ...prev, selectedIdx };
                                            }
                                        });
                                        return;
                                    }

                                    //. Normal card action
                                    if (canInteract) {
                                        openCardAction(c, i, { side, section, keyName, index: i });
                                    }
                                };

                                //. Calculate cost modification for cards in hand
                                let costDiff = 0;
                                if (typeof getCardMeta === 'function') {
                                    const meta = getCardMeta(c.id);
                                    const baseCost = meta?.stats?.cost || 0;
                                    if (typeof getCardCost === 'function') {
                                        const effective = getCardCost(
                                            c.id,
                                            side,
                                            section,
                                            keyName,
                                            i
                                        );
                                        costDiff = effective - baseCost; // negative indicates reduction
                                    }
                                }

                                return (
                                    <Box
                                        key={c.id + i}
                                        sx={{
                                            position: 'absolute',
                                            top: 0,
                                            left: i * OVERLAP_OFFSET
                                        }}
                                    >
                                        <img
                                            src={isOpponentHand ? CARD_BACK_URL : c.thumb}
                                            alt={isOpponentHand ? 'Card Back' : c.id}
                                            data-cardkey={modKey(side, section, keyName, i)}
                                            style={{
                                                width: CARD_W,
                                                cursor: isOpponentHand ? 'default' : cursor,
                                                opacity: isOpponentHand ? 1 : opacity,
                                                outline:
                                                    (!isOpponentHand && actionOpen &&
                                                        actionCardIndex === i &&
                                                        canInteract)
                                                        ? '3px solid #90caf9'
                                                        : (selected
                                                            ? '3px solid #ff9800'
                                                            : 'none'),
                                                borderRadius: '2px',
                                                filter:
                                                    (isTargetingHere && !valid && !isOpponentHand)
                                                        ? 'grayscale(0.9) brightness(0.6)'
                                                        : 'none'
                                            }}
                                            onClick={isOpponentHand ? undefined : onClick}
                                            onMouseEnter={isOpponentHand ? undefined : () => handleCardHover(c, config)}
                                            onMouseLeave={isOpponentHand ? undefined : handleCardLeave}
                                        />
                                        {/* Cost badge for hand cards removed; card art already shows cost */}
                                    </Box>
                                );
                            })}
                        </Box>
                    ) : (
                        (section === 'bottom' && keyName === 'cost')
                            ? (
                                <Box
                                    position='relative'
                                    width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET}
                                    height={CARD_H}
                                >
                                    {cardsArr.map((c, i) => {
                                        const isDon = c.id === 'DON';
                                        const isActive = isDon && !c.rested;
                                        const isSelected = donGivingMode?.active &&
                                            donGivingMode.selectedDonIndex === i &&
                                            donGivingMode.side === side;

                                        //. In multiplayer, check if this player controls this side
                                        const controlsThisSide = canInteractWithSide(side);
                                        
                                        const canSelect =
                                            isDon &&
                                            isActive &&
                                            !donGivingMode?.active &&
                                            phase?.toLowerCase() === 'main' &&
                                            turnSide === side &&
                                            !battle &&
                                            controlsThisSide;

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
                                                    transform:
                                                        c.id === 'DON' && c.rested
                                                            ? 'rotate(90deg)'
                                                            : 'none',
                                                    transformOrigin: 'center center',
                                                    cursor: canSelect ? 'pointer' : 'default',
                                                    outline: isSelected
                                                        ? '3px solid #ffc107'
                                                        : 'none'
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (canSelect && startDonGiving) {
                                                        //. In multiplayer as guest, send action to host
                                                        if (isMultiplayer && !isHost && onGuestAction) {
                                                            onGuestAction({ 
                                                                type: 'startDonGiving', 
                                                                payload: { side, donIndex: i } 
                                                            });
                                                        } else {
                                                            startDonGiving(side, i);
                                                        }
                                                    }
                                                }}
                                                onMouseEnter={() => handleCardHover(c, config)}
                                                onMouseLeave={handleCardLeave}
                                            />
                                        );
                                    })}
                                </Box>
                            )
                            : (section === 'char')
                                ? (
                                    <Box display='flex' gap={1}>
                                        {cardsArr.map((c, i) => {
                                            //. In multiplayer, check if this player controls this side for DON giving
                                            const controlsThisSide = canInteractWithSide(side);
                                            
                                            const isValidDonTarget =
                                                donGivingMode?.active &&
                                                donGivingMode.side === side &&
                                                !battle &&
                                                controlsThisSide;

                                            const isTargetingHere =
                                                targeting.active &&
                                                targeting.side === side &&
                                                ((targeting.section === 'char' &&
                                                    targeting.keyName === 'char') ||
                                                    targeting.multi);

                                            const ctx = {
                                                side: side,
                                                section: 'char',
                                                keyName: 'char',
                                                index: i
                                            };

                                            const valid = isTargetingHere
                                                ? (typeof targeting.validator === 'function'
                                                    ? targeting.validator(c, ctx)
                                                    : true)
                                                : false;

                                            const selected = targeting.multi
                                                ? targeting.selected.some(s =>
                                                    s.side === side &&
                                                    s.section === 'char' &&
                                                    s.keyName === 'char' &&
                                                    s.index === i
                                                )
                                                : (isTargetingHere &&
                                                    targeting.selectedIdx.includes(i));

                                            return (
                                                <Box
                                                    key={c.id + '-' + i}
                                                    sx={{ position: 'relative' }}
                                                >
                                                    <DonStack
                                                        donArr={_.get(areas, [side, 'charDon', i])}
                                                        cardIndex={i}
                                                    />
                                                    <img
                                                        src={c.thumb}
                                                        alt={c.id}
                                                        data-cardkey={modKey(side, 'char', 'char', i)}
                                                        style={{
                                                            width: CARD_W,
                                                            height: 'auto',
                                                            cursor: isTargetingHere
                                                                ? (valid ? 'crosshair' : 'not-allowed')
                                                                : (isValidDonTarget ? 'pointer' : 'pointer'),
                                                            borderRadius: '2px',
                                                            transform: c.rested
                                                                ? 'rotate(90deg)'
                                                                : 'none',
                                                            transformOrigin: 'center center',
                                                            filter: isTargetingHere && !valid
                                                                ? 'grayscale(0.9) brightness(0.6)'
                                                                : 'none',
                                                            outline: (() => {
                                                                //. Highlight eligible blockers during Block Step when this side is defending
                                                                if (battle &&
                                                                    battle.step === 'block' &&
                                                                    battle.target &&
                                                                    battle.target.side === side &&
                                                                    battle.target.section !== 'char') {
                                                                    const hasBlocker = getKeywordsFor(c.id)
                                                                        .some(k => /blocker/i.test(k));
                                                                    const active = !c.rested;
                                                                    const blockerDisabled = hasDisabledKeyword &&
                                                                        hasDisabledKeyword(
                                                                            side,
                                                                            'char',
                                                                            'char',
                                                                            i,
                                                                            'Blocker'
                                                                        );
                                                                    if (hasBlocker && active && !blockerDisabled) {
                                                                        return '3px solid #66bb6a';
                                                                    }
                                                                }
                                                                if (selected) { return '3px solid #ff9800'; }
                                                                if (isValidDonTarget) { return '3px solid #66bb6a'; }
                                                                return 'none';
                                                            })(),
                                                            boxShadow: isValidDonTarget
                                                                ? '0 0 12px rgba(102,187,106,0.6)'
                                                                : 'none',
                                                            position: 'relative',
                                                            zIndex: 1
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            //. Handle DON!! giving
                                                            if (isValidDonTarget && giveDonToCard) {
                                                                //. In multiplayer as guest, send action to host
                                                                if (isMultiplayer && !isHost && onGuestAction) {
                                                                    onGuestAction({
                                                                        type: 'giveDonToCard',
                                                                        payload: { side, section: 'char', keyName: 'char', index: i }
                                                                    });
                                                                } else {
                                                                    giveDonToCard(side, 'char', 'char', i);
                                                                }
                                                                return;
                                                            }
                                                            //. Handle targeting for other purposes
                                                            if (isTargetingHere) {
                                                                if (targeting.suspended) { return; }
                                                                if (!valid) { return; }
                                                                setTargeting((prev) => {
                                                                    if (prev.multi) {
                                                                        const has = prev.selected.some(
                                                                            s =>
                                                                                s.side === side &&
                                                                                s.section === 'char' &&
                                                                                s.keyName === 'char' &&
                                                                                s.index === i
                                                                        );
                                                                        let selected = has
                                                                            ? prev.selected.filter(
                                                                                s =>
                                                                                    !(
                                                                                        s.side === side &&
                                                                                        s.section === 'char' &&
                                                                                        s.keyName === 'char' &&
                                                                                        s.index === i
                                                                                    )
                                                                            )
                                                                            : [...prev.selected, ctx];
                                                                        if (selected.length > prev.max) {
                                                                            selected = selected.slice(-prev.max);
                                                                        }
                                                                        //. Update arrow preview with live power snapshot
                                                                        if (selected.length && currentAttack) {
                                                                            const si = selected[selected.length - 1].index;
                                                                            const defCard = _.get(
                                                                                areas,
                                                                                [side, 'char', si]
                                                                            );
                                                                            const defP = getTotalPower(
                                                                                side,
                                                                                'char',
                                                                                'char',
                                                                                si,
                                                                                defCard?.id
                                                                            );
                                                                            setBattleArrow({
                                                                                fromKey: currentAttack.key,
                                                                                toKey: modKey(
                                                                                    side,
                                                                                    'char',
                                                                                    'char',
                                                                                    si
                                                                                ),
                                                                                label: `${currentAttack.power} ▶ ${defP}`
                                                                            });
                                                                        }
                                                                        return { ...prev, selected };
                                                                    } else {
                                                                        const has = prev.selectedIdx.includes(i);
                                                                        let selectedIdx = has
                                                                            ? prev.selectedIdx.filter(
                                                                                x => x !== i
                                                                            )
                                                                            : [...prev.selectedIdx, i];
                                                                        if (selectedIdx.length > prev.max) {
                                                                            selectedIdx = selectedIdx.slice(-prev.max);
                                                                        }
                                                                        return { ...prev, selectedIdx };
                                                                    }
                                                                });
                                                                return;
                                                            }
                                                            openCardAction(c, i, {
                                                                side: side,
                                                                section: 'char',
                                                                keyName: 'char',
                                                                index: i
                                                            });
                                                        }}
                                                        onMouseEnter={() => handleCardHover(c, config)}
                                                        onMouseLeave={handleCardLeave}
                                                    />
                                                    {battle &&
                                                        battle.step === 'block' &&
                                                        battle.target &&
                                                        battle.target.side === side &&
                                                        battle.target.section !== 'char' &&
                                                        (() => {
                                                            const hasBlocker = getKeywordsFor(c.id)
                                                                .some(k => /blocker/i.test(k));
                                                            const active = !c.rested;
                                                            const blockerDisabled = hasDisabledKeyword &&
                                                                hasDisabledKeyword(
                                                                    side,
                                                                    'char',
                                                                    'char',
                                                                    i,
                                                                    'Blocker'
                                                                );
                                                            if (!hasBlocker || !active || blockerDisabled) {
                                                                return null;
                                                            }
                                                            return (
                                                                <Box
                                                                    sx={{
                                                                        position: 'absolute',
                                                                        bottom: 4,
                                                                        left: 4,
                                                                        right: 4
                                                                    }}
                                                                >
                                                                    <Button
                                                                        size='small'
                                                                        fullWidth
                                                                        variant='contained'
                                                                        color='error'
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            //. In multiplayer as guest, send action to host
                                                                            if (isMultiplayer && !isHost && onGuestAction) {
                                                                                onGuestAction({
                                                                                    type: 'useBlocker',
                                                                                    payload: { blockerIndex: i }
                                                                                });
                                                                            } else {
                                                                                applyBlocker(i);
                                                                            }
                                                                        }}
                                                                    >
                                                                        Use Blocker
                                                                    </Button>
                                                                </Box>
                                                            );
                                                        })()}
                                                    <PowerBadge
                                                        side={side}
                                                        section='char'
                                                        keyName='char'
                                                        index={i}
                                                        cardId={c.id}
                                                    />
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                )
                                    : (section === 'middle' && keyName === 'leader')
                                        ? (
                                            <Box
                                                position='relative'
                                                sx={{ width: CARD_W, height: CARD_H }}
                                            >
                                                {(() => {
                                                    const c = cardsArr[cardsArr.length - 1];
                                                    const idx = 0;

                                                    const isTargetingHere =
                                                        targeting.active &&
                                                        targeting.side === side &&
                                                        ((targeting.section === 'middle' &&
                                                            targeting.keyName === 'leader') ||
                                                            targeting.multi);

                                                    const selected = targeting.multi
                                                        ? targeting.selected.some(
                                                            s =>
                                                                s.side === side &&
                                                                s.section === 'middle' &&
                                                                s.keyName === 'leader' &&
                                                                s.index === idx
                                                        )
                                                        : (isTargetingHere &&
                                                            targeting.selectedIdx.includes(idx));

                                                    //. In multiplayer, check if this player controls this side
                                                    const controlsThisSide = canInteractWithSide(side);
                                                    
                                                    const isValidDonTarget =
                                                        donGivingMode?.active &&
                                                        donGivingMode.side === side &&
                                                        !battle &&
                                                        controlsThisSide;

                                                    const ctx = {
                                                        side,
                                                        section: 'middle',
                                                        keyName: 'leader',
                                                        index: idx
                                                    };

                                                    const valid = isTargetingHere
                                                        ? (typeof targeting.validator === 'function'
                                                            ? targeting.validator(c, ctx)
                                                            : true)
                                                        : false;

                                                    const onClick = (e) => {
                                                        e.stopPropagation();
                                                        //. Handle DON!! giving
                                                        if (isValidDonTarget && giveDonToCard) {
                                                            //. In multiplayer as guest, send action to host
                                                            if (isMultiplayer && !isHost && onGuestAction) {
                                                                onGuestAction({
                                                                    type: 'giveDonToCard',
                                                                    payload: { side, section: 'middle', keyName: 'leader', index: idx }
                                                                });
                                                            } else {
                                                                giveDonToCard(side, 'middle', 'leader', idx);
                                                            }
                                                            return;
                                                        }
                                                        //. Handle targeting
                                                        if (isTargetingHere) {
                                                            if (targeting.suspended) { return; }
                                                            if (!valid) { return; }

                                                            setTargeting((prev) => {
                                                                if (prev.multi) {
                                                                    const has = prev.selected.some(
                                                                        s =>
                                                                            s.side === side &&
                                                                            s.section === 'middle' &&
                                                                            s.keyName === 'leader' &&
                                                                            s.index === idx
                                                                    );
                                                                    let selected = has
                                                                        ? prev.selected.filter(
                                                                            s =>
                                                                                !(
                                                                                    s.side === side &&
                                                                                    s.section === 'middle' &&
                                                                                    s.keyName === 'leader' &&
                                                                                    s.index === idx
                                                                                )
                                                                        )
                                                                        : [...prev.selected, ctx];
                                                                    if (selected.length > prev.max) {
                                                                        selected = selected.slice(-prev.max);
                                                                    }
                                                                    if (selected.length && currentAttack) {
                                                                        const defP = getTotalPower(
                                                                            side,
                                                                            'middle',
                                                                            'leader',
                                                                            idx,
                                                                            c?.id
                                                                        );
                                                                        setBattleArrow({
                                                                            fromKey: currentAttack.key,
                                                                            toKey: modKey(
                                                                                side,
                                                                                'middle',
                                                                                'leader',
                                                                                idx
                                                                            ),
                                                                            label: `${currentAttack.power} ▶ ${defP}`
                                                                        });
                                                                    }
                                                                    return { ...prev, selected };
                                                                } else {
                                                                    const has = prev.selectedIdx.includes(idx);
                                                                    let selectedIdx = has
                                                                        ? prev.selectedIdx.filter(x => x !== idx)
                                                                        : [...prev.selectedIdx, idx];
                                                                    if (selectedIdx.length > prev.max) {
                                                                        selectedIdx = selectedIdx.slice(-prev.max);
                                                                    }
                                                                    return { ...prev, selectedIdx };
                                                                }
                                                            });
                                                            return;
                                                        }
                                                        openCardAction(c, idx, {
                                                            side,
                                                            section: 'middle',
                                                            keyName: 'leader',
                                                            index: idx
                                                        });
                                                    };

                                                    return (
                                                        <>
                                                            <Box
                                                                sx={{
                                                                    position: 'absolute',
                                                                    top: 0,
                                                                    left: 0,
                                                                    zIndex: 1,
                                                                    width: CARD_W,
                                                                    height: CARD_H
                                                                }}
                                                            >
                                                                <DonStack
                                                                    donArr={_.get(
                                                                        areas,
                                                                        [side, 'middle', 'leaderDon'],
                                                                        []
                                                                    )}
                                                                    cardIndex='leader'
                                                                />
                                                            </Box>
                                                            <Box
                                                                sx={{
                                                                    position: 'absolute',
                                                                    top: 0,
                                                                    left: 0,
                                                                    zIndex: 2,
                                                                    width: CARD_W,
                                                                    height: CARD_H
                                                                }}
                                                            >
                                                                <img
                                                                    src={c?.thumb}
                                                                    alt={c?.id}
                                                                    data-cardkey={modKey(
                                                                        side,
                                                                        'middle',
                                                                        'leader',
                                                                        idx
                                                                    )}
                                                                    style={{
                                                                        width: CARD_W,
                                                                        height: 'auto',
                                                                        borderRadius: '2px',
                                                                        transform: c?.rested
                                                                            ? 'rotate(90deg)'
                                                                            : 'none',
                                                                        transformOrigin: 'center center',
                                                                        filter: isTargetingHere && !valid
                                                                            ? 'grayscale(0.9) brightness(0.6)'
                                                                            : 'none',
                                                                        outline: (() => {
                                                                            if (selected) {
                                                                                return '3px solid #ff9800';
                                                                            }
                                                                            if (isValidDonTarget) {
                                                                                return '3px solid #66bb6a';
                                                                            }
                                                                            return 'none';
                                                                        })(),
                                                                        cursor: isTargetingHere
                                                                            ? (valid
                                                                                ? 'crosshair'
                                                                                : 'not-allowed')
                                                                            : (isValidDonTarget
                                                                                ? 'pointer'
                                                                                : 'pointer'),
                                                                        boxShadow: isValidDonTarget
                                                                            ? '0 0 12px rgba(102,187,106,0.6)'
                                                                            : 'none'
                                                                    }}
                                                                    onClick={onClick}
                                                                    onMouseEnter={() => c && handleCardHover(c, config)}
                                                                    onMouseLeave={handleCardLeave}
                                                                />
                                                                {selected && (
                                                                    <Box
                                                                        sx={{
                                                                            position: 'absolute',
                                                                            top: 6,
                                                                            right: 6,
                                                                            px: 0.5,
                                                                            borderRadius: 0.5,
                                                                            bgcolor: 'rgba(255,152,0,0.9)'
                                                                        }}
                                                                    >
                                                                        <Typography
                                                                            variant='caption'
                                                                            sx={{
                                                                                color: '#000',
                                                                                fontWeight: 700
                                                                            }}
                                                                        >
                                                                            Target
                                                                        </Typography>
                                                                    </Box>
                                                                )}
                                                                <PowerBadge
                                                                    side={side}
                                                                    section='middle'
                                                                    keyName='leader'
                                                                    index={idx}
                                                                    cardId={c?.id}
                                                                />
                                                            </Box>
                                                        </>
                                                    );
                                                })()}
                                            </Box>
                                        )
                                        : (
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
            sx={{
                width: '100%',
                maxWidth: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start'
            }}
            onClick={(e) => {
                //. Cancel DON giving mode when clicking on the board background
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
                    position: 'relative',
                    transform: `scale(${boardScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 80ms linear'
                }}
                onClick={(e) => {
                    //. Cancel DON giving mode when clicking anywhere in the play area (except DON cards and valid targets)
                    if (donGivingMode?.active) {
                        const target = e.target;
                        const clickedCard = target.tagName === 'IMG';
                        const clickedInsideAreaBox = target.closest('[data-area-box]');

                        if (!clickedCard && !clickedInsideAreaBox) {
                            cancelDonGiving();
                        }
                    }
                }}
            >
                {/* Top Side (opponent from viewer's perspective) */}
                <Box
                    sx={{
                        position: 'relative',
                        filter: turnSide === topSide ? 'brightness(1.10)' : 'brightness(1.0)',
                        transition: 'filter 600ms ease'
                    }}
                >
                    <Stack
                        direction='row'
                        spacing={compactMode ? 0.5 : 1}
                        sx={{ mb: compactMode ? 0.5 : 1 }}
                    >
                        <AreaBox
                            side={topSide}
                            section='top'
                            keyName='hand'
                            config={areaConfigs[topSide].top.hand}
                            areaRef={topHandRef}
                        />
                        <AreaBox
                            side={topSide}
                            section='top'
                            keyName='trash'
                            config={areaConfigs[topSide].top.trash}
                        />
                        <AreaBox
                            side={topSide}
                            section='top'
                            keyName='cost'
                            config={areaConfigs[topSide].top.cost}
                        />
                        <AreaBox
                            side={topSide}
                            section='top'
                            keyName='don'
                            config={areaConfigs[topSide].top.don}
                        />
                    </Stack>
                    <Stack
                        direction='row'
                        spacing={compactMode ? 0.5 : 1}
                        sx={{ mb: compactMode ? 0.5 : 1 }}
                    >
                        <Box sx={{ width: COST_W }} />
                        <AreaBox
                            side={topSide}
                            section='middle'
                            keyName='deck'
                            config={areaConfigs[topSide].middle.deck}
                        />
                        <AreaBox
                            side={topSide}
                            section='middle'
                            keyName='stage'
                            config={areaConfigs[topSide].middle.stage}
                        />
                        <AreaBox
                            side={topSide}
                            section='middle'
                            keyName='leader'
                            config={areaConfigs[topSide].middle.leader}
                        />
                    </Stack>
                    {/* Top side bottom row: constrain row height to character area while letting life overflow upward over middle row */}
                    <Box
                        sx={{
                            display: 'flex',
                            position: 'relative',
                            height: areaConfigs[topSide].char.height,
                            mb: compactMode ? 0.5 : 1
                        }}
                    >
                        <Box sx={{ width: COST_W, flexShrink: 0 }} />
                        <Box>
                            <AreaBox
                                side={topSide}
                                section='char'
                                keyName='char'
                                config={areaConfigs[topSide].char}
                            />
                        </Box>
                        <Box
                            sx={{
                                width: LIFE_W,
                                flexShrink: 0,
                                overflow: 'visible',
                                ml: compactMode ? 0.5 : 1,
                                mt: `-${(LIFE_MAX_VISIBLE - 1) * OVERLAP_OFFSET}px`
                            }}
                        >
                            <AreaBox
                                side={topSide}
                                section='life'
                                keyName='life'
                                config={areaConfigs[topSide].life}
                            />
                        </Box>
                    </Box>
                </Box>

                {viewerBounds &&
                    viewerBounds.width > 0 &&
                    viewerBounds.height > 0 && (
                        <Box
                            sx={{
                                position: 'absolute',
                                left: viewerBounds.left,
                                top: viewerBounds.top,
                                width: viewerBounds.width,
                                height: viewerBounds.height,
                                pointerEvents: 'none',
                                zIndex: 5,
                                display: 'flex',
                                alignItems: 'stretch',
                                justifyContent: 'center'
                            }}
                        >
                            <Box
                                sx={{
                                    width: '100%',
                                    height: '100%',
                                    pointerEvents: 'auto',
                                    borderRadius: 2,
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    bgcolor: 'rgba(15, 15, 15, 0.82)',
                                    boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
                                    p: 0.5,
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}
                            >
                                <CardViewer
                                    hovered={hovered}
                                    selectedCard={selectedCard}
                                    cardError={cardError}
                                    loadingCards={loadingCards}
                                    log={[]}
                                    compact={compactMode}
                                    showLog={false}
                                    frame={false}
                                    contentPadding={0.5}
                                    sx={{ width: '100%', height: '100%' }}
                                />
                            </Box>
                        </Box>
                    )}

                {/* Opening Hand overlay (positioned above player's hand) */}
                {handOverlayPos && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: handOverlayPos.left,
                            top: handOverlayPos.top,
                            width: handOverlayPos.width,
                            transform: 'translateY(-100%)',
                            zIndex: 50,
                            pointerEvents: 'auto'
                        }}
                    >
                        <OpeningHand
                            ref={openingHandRef}
                            library={library}
                            setLibrary={setLibrary}
                            oppLibrary={oppLibrary}
                            setOppLibrary={setOppLibrary}
                            areas={areas}
                            setAreas={setAreas}
                            getAssetForId={getAssetForId}
                            createCardBacks={createCardBacks}
                            setTurnSide={setTurnSide}
                            setTurnNumber={setTurnNumber}
                            executeRefreshPhase={executeRefreshPhase}
                            setPhase={setPhase}
                            setHovered={setHovered}
                            openingHandShown={openingHandShown}
                            setOpeningHandShown={setOpeningHandShown}
                            currentHandSide={currentHandSide}
                            onHandSelected={onHandSelected}
                            firstPlayer={firstPlayer}
                            CARD_W={CARD_W}
                            isMultiplayer={isMultiplayer}
                            isHost={isHost}
                            onGuestAction={onGuestAction}
                            playerHandSelected={playerHandSelected}
                            opponentHandSelected={opponentHandSelected}
                            onLocalHandSelected={markHandSelectedLocally}
                            setupPhase={setupPhase}
                            onBroadcastStateRef={onBroadcastStateRef}
                        />
                    </Box>
                )}

                {/* Deck Search overlay (always available; falls back to centered if handOverlayPos missing) */}
                <Box
                    sx={{
                        position: 'absolute',
                        zIndex: 1500,
                        pointerEvents: 'auto',
                        left: handOverlayPos ? handOverlayPos.left : '50%',
                        top: handOverlayPos ? handOverlayPos.top : (compactMode ? 8 : 16),
                        width: handOverlayPos ? handOverlayPos.width : 'min(1200px, 96%)',
                        transform: handOverlayPos ? 'translateY(-100%)' : 'translateX(-50%)'
                    }}
                >
                    {playerDeckSearch.active && <playerDeckSearch.Component />}
                    {opponentDeckSearch.active && <opponentDeckSearch.Component />}
                </Box>

                {/* Bottom Side (viewer's own side) */}
                <Box
                    sx={{
                        position: 'relative',
                        filter: turnSide === bottomSide ? 'brightness(1.10)' : 'brightness(1.0)',
                        transition: 'filter 600ms ease'
                    }}
                >
                    {/* Bottom top row: constrain row height to character area while letting life overflow without shifting horizontally */}
                    <Box
                        sx={{
                            display: 'flex',
                            position: 'relative',
                            height: areaConfigs.player.char.height,
                            mb: compactMode ? 0.5 : 1
                        }}
                    >
                        <Box sx={{ width: COST_W, flexShrink: 0 }} />
                        <Box
                            sx={{
                                width: LIFE_W,
                                flexShrink: 0,
                                overflow: 'visible',
                                ml: compactMode ? 0.5 : 1
                            }}
                        >
                            <AreaBox
                                side={bottomSide}
                                section='life'
                                keyName='life'
                                config={areaConfigs[bottomSide].life}
                            />
                        </Box>
                        <Box sx={{ ml: compactMode ? 0.5 : 1 }}>
                            <AreaBox
                                side={bottomSide}
                                section='char'
                                keyName='char'
                                config={areaConfigs[bottomSide].char}
                            />
                        </Box>
                    </Box>

                    {/* Bottom middle row: add left spacer to shift leader/stage right; deck aligned above trash */}
                    <Stack
                        direction='row'
                        spacing={compactMode ? 0.5 : 1}
                        sx={{ mb: compactMode ? 0.5 : 1 }}
                    >
                        <Box
                            sx={{
                                width: COST_W + SINGLE_W + (compactMode ? 4 : 8)
                            }}
                        />
                        <Box sx={{ width: COST_W }}>
                            <Stack
                                direction='row'
                                spacing={compactMode ? 0.5 : 1}
                                justifyContent='flex-end'
                            >
                                <AreaBox
                                    side={bottomSide}
                                    section='middle'
                                    keyName='leader'
                                    config={areaConfigs[bottomSide].middle.leader}
                                />
                                <AreaBox
                                    side={bottomSide}
                                    section='middle'
                                    keyName='stage'
                                    config={areaConfigs[bottomSide].middle.stage}
                                />
                            </Stack>
                        </Box>
                        <Box sx={{ width: SINGLE_W }}>
                            <AreaBox
                                side={bottomSide}
                                section='middle'
                                keyName='deck'
                                config={areaConfigs[bottomSide].middle.deck}
                            />
                        </Box>
                    </Stack>

                    {/* Bottom row - Hand, DON, Cost, Trash - with relative positioning for overlays */}
                    <Box sx={{ position: 'relative' }}>
                        <Stack
                            direction='row'
                            spacing={compactMode ? 0.5 : 1}
                        >
                            <AreaBox
                                side={bottomSide}
                                section='bottom'
                                keyName='hand'
                                config={areaConfigs[bottomSide].bottom.hand}
                                areaRef={bottomHandRef}
                            />
                            <AreaBox
                                side={bottomSide}
                                section='bottom'
                                keyName='don'
                                config={areaConfigs[bottomSide].bottom.don}
                            />
                            <AreaBox
                                side={bottomSide}
                                section='bottom'
                                keyName='cost'
                                config={areaConfigs[bottomSide].bottom.cost}
                            />
                            <AreaBox
                                side={bottomSide}
                                section='bottom'
                                keyName='trash'
                                config={areaConfigs[bottomSide].bottom.trash}
                            />
                        </Stack>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
