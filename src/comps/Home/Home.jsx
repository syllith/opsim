
// Home.jsx
// Main landing page for One Piece TCG Sim. Handles login, registration, and displays user info.
import React, { useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { AuthContext } from '../../AuthContext';
import { Box, Container, Typography, Paper, Button, Stack, Alert, Divider, CircularProgress, Chip } from '@mui/material';
import ClickAwayListener from '@mui/material/ClickAwayListener';
// Auth form now extracted to its own component
import LoginRegister from '../LoginRegister/LoginRegister';
import ActionsPanel from './ActionsPanel';
import OP01004Action from '../Cards/OP01/OP01-004';
import DeckBuilder from '../DeckBuilder/DeckBuilder';
import { loadAllCards as loadCardJson } from '../../data/cards/loader';
import OpeningHand from './OpeningHand';


export default function Home() {
    // Auth context values and actions
    const { isLoggedIn, user, logout, loading } = useContext(AuthContext);


    // --- Card Viewer State ---
    const [cards, setCards] = useState([]); // all card assets across directories (from /api/cardsAll)
    const [hovered, setHovered] = useState(null); // currently hovered card object
    const [selectedCard, setSelectedCard] = useState(null); // currently selected card object (from actions)
    const [loadingCards, setLoadingCards] = useState(false);
    const [cardError, setCardError] = useState('');
    const [allCards, setAllCards] = useState([]);
    const allById = useMemo(() => new Map(allCards.map(c => [c.id, c])), [allCards]);
    const [metaById, setMetaById] = useState(() => new Map());

    // Load structured card JSON metadata (cost, power, etc.)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { byId } = await loadCardJson();
                if (alive) setMetaById(byId);
            } catch (e) {
                console.warn('Failed to load card JSON metadata:', e);
            }
        })();
        return () => { alive = false; };
    }, []);

    // Load all cards once logged in
    useEffect(() => {
        if (!isLoggedIn) return;
        const fetchAll = async () => {
            setLoadingCards(true);
            setCardError('');
            try {
                const res = await fetch('/api/cardsAll');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load cards');
                setCards(data.cards || []);
                setAllCards(data.cards || []);
                setHovered(null);
            } catch (e) {
                setCardError(e.message);
                setCards([]);
                setAllCards([]);
                setHovered(null);
            } finally {
                setLoadingCards(false);
            }
        };
        fetchAll();
    }, [isLoggedIn]);

    // Random card helper selecting small (thumb) asset if available
    const getRandomCard = useCallback(() => {
        if (!allCards.length) return null;
        return allCards[Math.floor(Math.random() * allCards.length)];
    }, [allCards]);

    // --- Board / Play Area Logic ---
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
    const compact = boardScale < 0.9;

    // Recompute scale on resize and when layout mounts
    useEffect(() => {
        if (!isLoggedIn) return; // only when board is visible
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
    }, [isLoggedIn, BASE_BOARD_WIDTH]);

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

    // State storage for each area
    const [areas, setAreas] = useState(() => {
        const init = {};
        Object.entries(areaConfigs).forEach(([side, cfg]) => {
            init[side] = {};
            Object.entries(cfg).forEach(([section, sectionCfg]) => {
                if (typeof sectionCfg.mode === 'string') {
                    init[side][section] = [];
                } else {
                    // nested sections
                    init[side][section] = {};
                    Object.keys(sectionCfg).forEach(k => { init[side][section][k] = []; });
                }
            });
        });
        return init;
    });

    // --- Game State ---
    const [gameStarted, setGameStarted] = useState(true); // disable manual board edits by default
    const [openingShown, setOpeningShown] = useState(false);
    const [allowMulligan, setAllowMulligan] = useState(true);
    const [openingHand, setOpeningHand] = useState([]); // asset objects for display
    const [library, setLibrary] = useState([]); // array of card IDs for player's deck order (top at end)
    const [leaderId, setLeaderId] = useState('');
    const [oppLeaderId, setOppLeaderId] = useState('');
    const [oppLibrary, setOppLibrary] = useState([]);
    const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png';
    const DON_FRONT = { id: 'DON', full: '/api/cards/assets/Don/Don.png', thumb: '/api/cards/assets/Don/Don.png' };
    const DON_BACK = { id: 'DON_BACK', full: '/api/cards/assets/Card%20Backs/CardBackDon.png', thumb: '/api/cards/assets/Card%20Backs/CardBackDon.png' };

    // Self-play loop
    const [turnSide, setTurnSide] = useState('player'); // 'player' | 'opponent'
    const [turnNumber, setTurnNumber] = useState(1);
    const [phase, setPhase] = useState('Draw'); // Draw | Don | Main (Refresh auto)
    const [log, setLog] = useState([]);
    const logRef = useRef(null);
    const appendLog = useCallback((msg) => {
        setLog((prev) => [...prev.slice(-199), `[T${turnNumber} ${turnSide} ${phase}] ${msg}`]);
        setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 0);
    }, [turnNumber, turnSide, phase]);

    // Hardcoded self-play deck
    const HARDCODED = true;
    const DEMO_LEADER = 'OP09-001';
    const DEMO_DECK_ITEMS = [
        { id: 'OP01-006', count: 4 },
        { id: 'OP09-002', count: 4 },
        { id: 'OP09-008', count: 4 },
        { id: 'OP09-011', count: 4 },
        { id: 'OP09-014', count: 4 },
        { id: 'OP12-008', count: 4 },
        { id: 'OP09-013', count: 4 },
        { id: 'PRB02-002', count: 4 },
        { id: 'ST23-001', count: 2 },
        { id: 'OP09-009', count: 4 },
        { id: 'ST15-002', count: 3 },
        { id: 'OP08-118', count: 4 },
        { id: 'OP06-007', count: 3 },
        { id: 'OP09-004', count: 2 },
    ];

    const getAssetForId = useCallback((id) => {
        if (!id) return null;
        const hit = allById.get(id);
        if (hit) return hit;
        const m = String(id).match(/^([A-Za-z0-9]+)-/);
        const setName = m ? m[1] : '';
        // Images are only .png and not in "Original" folders
        return {
            id,
            thumb: `/api/cards/assets/${setName}/${id}_small.png`,
            full: `/api/cards/assets/${setName}/${id}.png`,
        };
    }, [allById]);

    const getCardCost = useCallback((id) => {
        if (!id) return 0;
        const meta = metaById.get(id);
        const cost = meta?.stats?.cost;
        return typeof cost === 'number' && cost > 0 ? cost : 0;
    }, [metaById]);

    // Helper: shuffle array in-place (Fisher-Yates)
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // Build a full 50-card id list from stored deck data
    const expandDeckItems = (items) => {
        const out = [];
        for (const it of items || []) {
            for (let i = 0; i < (it.count || 0); i++) out.push(it.id);
        }
        return out;
    };

    // Load most recent saved deck and initialize game state
    useEffect(() => {
        if (!isLoggedIn) return;
        if (!allCards.length) return; // need assets to map ids
        if (openingShown || library.length || oppLibrary.length) return; // already initialized
        (async () => {
            try {
                if (HARDCODED) {
                    // Build libraries
                    const ids = expandDeckItems(DEMO_DECK_ITEMS);
                    const libP = shuffle(ids.slice());
                    const libO = shuffle(ids.slice());
                    const leaderAsset = getAssetForId(DEMO_LEADER);

                    setAreas((prev) => {
                        const next = JSON.parse(JSON.stringify(prev));
                        // Place leaders
                        next.player.middle.leader = [leaderAsset];
                        next.opponent.middle.leader = [leaderAsset];
                        // Deck stacks visuals
                        next.player.middle.deck = Array.from({ length: libP.length }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                        next.opponent.middle.deck = Array.from({ length: libO.length }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                        // DON!! decks (10 each)
                        next.player.bottom.don = Array.from({ length: 10 }, () => ({ ...DON_BACK }));
                        next.opponent.top.don = Array.from({ length: 10 }, () => ({ ...DON_BACK }));
                        // Cost areas empty
                        next.player.bottom.cost = [];
                        next.opponent.top.cost = [];
                        // Opponent opening 5 (auto keep, visible)
                        const opp5 = libO.slice(-5).map((id) => getAssetForId(id)).filter(Boolean);
                        next.opponent.top.hand = opp5;
                        // Reduce opponent deck by 5 for opening
                        next.opponent.middle.deck = Array.from({ length: Math.max(0, libO.length - 5) }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                        return next;
                    });

                    setLeaderId(DEMO_LEADER);
                    setOppLeaderId(DEMO_LEADER);
                    setLibrary(libP);
                    setOppLibrary(libO);
                    const p5 = libP.slice(-5);
                    setOpeningHand(p5.map((id) => getAssetForId(id)).filter(Boolean).slice(0, 5));
                    setOpeningShown(true);
                    setAllowMulligan(true);
                    setGameStarted(true);
                    return;
                }
                const res = await fetch('/api/decks', { credentials: 'include' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'No decks');
                const decks = (data.decks || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                if (!decks.length) {
                    // Fallback: show empty leaders if missing, still show facedown deck stack
                    setAreas((prev) => {
                        const next = JSON.parse(JSON.stringify(prev));
                        next.player.middle.deck = Array.from({ length: 50 }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                        next.opponent.middle.deck = Array.from({ length: 50 }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                        return next;
                    });
                    return;
                }
                const chosen = decks[0];
                const dres = await fetch(`/api/decks/${encodeURIComponent(chosen.name)}`, { credentials: 'include' });
                const deck = await dres.json();
                if (!dres.ok) throw new Error(deck.error || 'Failed to load deck');
                const ids = expandDeckItems(deck.items);
                if (ids.length !== 50) {
                    console.warn('Deck is not 50 cards; filling to 50 with random cards for demo');
                    while (ids.length < 50 && allCards.length) ids.push(allCards[Math.floor(Math.random() * allCards.length)].id);
                }
                const lib = shuffle(ids.slice());
                const lead = deck.leaderId;

                // Prepare visual areas: place leaders, deck stacks (back images)
                setAreas((prev) => {
                    const next = JSON.parse(JSON.stringify(prev));
                    let leaderAsset = allById.get(lead) || null;
                    if (!leaderAsset && typeof lead === 'string') {
                        const m = lead.match(/^([A-Za-z0-9]+)-/);
                        if (m) {
                            const setName = m[1];
                            leaderAsset = {
                                id: lead,
                                thumb: `/api/cards/assets/${setName}/${lead}_small.png`,
                                full: `/api/cards/assets/${setName}/${lead}.png`,
                            };
                        }
                    }
                    if (leaderAsset) {
                        next.player.middle.leader = [leaderAsset];
                        next.opponent.middle.leader = [leaderAsset];
                    }
                    // Set deck as N back cards for both sides (player uses actual count, opponent mirrors 50)
                    next.player.middle.deck = Array.from({ length: lib.length }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                    next.opponent.middle.deck = Array.from({ length: 50 }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                    return next;
                });

                setLeaderId(lead);
                setLibrary(lib);
                // Draw opening 5 (top of deck is last element)
                const drawn = lib.slice(-5);
                setOpeningHand(drawn.map((id) => allById.get(id)).filter(Boolean).slice(0, 5));
                setOpeningShown(true);
                setAllowMulligan(true);
                setGameStarted(true);
            } catch (e) {
                console.error('Init game failed:', e);
                // Show fallback deck stacks even on error
                setAreas((prev) => {
                    const next = JSON.parse(JSON.stringify(prev));
                    next.player.middle.deck = Array.from({ length: 50 }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                    next.opponent.middle.deck = Array.from({ length: 50 }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
                    return next;
                });
            }
        })();
    }, [isLoggedIn, allCards, allById, openingShown, library.length]);

    const addCardToArea = useCallback((side, section, key) => {
        if (gameStarted) return; // disable manual adding in game mode
        const config = typeof areaConfigs[side][section].mode === 'string' ? areaConfigs[side][section] : areaConfigs[side][section][key];
        const card = getRandomCard();
        if (!card) {
            console.warn('[addCardToArea] No cards available. allCards length:', allCards.length, 'side:', side, 'section:', section, 'key:', key);
            return;
        }
        console.log('[addCardToArea] Adding card', card.id, 'to', side, section, key || '(direct)');
        setAreas(prev => {
            // Non-nested section (array directly)
            if (Array.isArray(prev[side][section])) {
                const target = prev[side][section];
                if (target.length >= config.max) return prev;
                return {
                    ...prev,
                    [side]: {
                        ...prev[side],
                        [section]: [...target, { ...card }]
                    }
                };
            }
            // Nested (object of arrays)
            const target = prev[side][section][key];
            if (target.length >= config.max) return prev;
            return {
                ...prev,
                [side]: {
                    ...prev[side],
                    [section]: {
                        ...prev[side][section],
                        [key]: [...target, { ...card }]
                    }
                }
            };
        });
    }, [getRandomCard, areaConfigs]);

    const removeCardFromArea = useCallback((side, section, key) => {
        if (gameStarted) return; // disable manual removal in game mode
        console.log('[removeCardFromArea] Removing last card from', side, section, key || '(direct)');
        setAreas(prev => {
            if (Array.isArray(prev[side][section])) {
                const target = prev[side][section];
                if (!target.length) return prev;
                const newArr = target.slice(0, -1);
                return {
                    ...prev,
                    [side]: { ...prev[side], [section]: newArr }
                };
            }
            const target = prev[side][section][key];
            if (!target.length) return prev;
            const newArr = target.slice(0, -1);
            return {
                ...prev,
                [side]: {
                    ...prev[side],
                    [section]: {
                        ...prev[side][section],
                        [key]: newArr
                    }
                }
            };
        });
    }, []);

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
                                        style={{ position: 'absolute', top: i * -offset, left: i * -offset, width: CARD_W, height: 'auto', borderRadius: 4, boxShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
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

    const [actionOpen, setActionOpen] = useState(false);
    const [actionCard, setActionCard] = useState(null);
    const [actionCardIndex, setActionCardIndex] = useState(-1);
    const [actionSource, setActionSource] = useState(null); // { side, section, keyName, index }
    const [ActionComp, setActionComp] = useState(null);
    const actionModules = useMemo(() => import.meta.glob('../Cards/**/[A-Z0-9-]*.jsx'), []);

    const canPlayNow = useMemo(() => phase.toLowerCase() === 'main', [phase]);

    const hasEnoughDonFor = useCallback((side, cost) => {
        if (!cost || cost <= 0) return true;
        const arr = side === 'player' ? (areas?.player?.bottom?.cost || []) : (areas?.opponent?.top?.cost || []);
        const active = arr.filter((c) => c.id === 'DON' && !c.rested).length;
        return active >= cost;
    }, [areas]);

    // --- Targeting System for Board Selection ---
    const [targeting, setTargeting] = useState({
        active: false,
        side: null,
        section: null,
        keyName: null,
        min: 1,
        max: 1,
        validator: null, // (card, ctx?) => boolean
        selectedIdx: [], // indices in single-section mode
        multi: false, // allow clicks across multiple sections
        selected: [], // [{ side, section, keyName, index }]
        onComplete: null,
    });

    const startTargeting = useCallback((descriptor, onComplete) => {
        const { side, section, keyName, min = 1, max = 1, validator = null, multi = false } = descriptor || {};
        setTargeting({ active: true, side, section: section || null, keyName: keyName || null, min, max, validator, selectedIdx: [], multi, selected: [], onComplete });
    }, []);

    const [currentAttack, setCurrentAttack] = useState(null); // { key, cardId, index, power }
    const [battleArrow, setBattleArrow] = useState(null); // { fromKey, toKey, label }
    // Battle state lifecycle implementing steps per rules 7-1
    // battle: {
    //   attacker: { side, section, keyName, index, id, power }
    //   target: { side, section, keyName, index, id }
    //   step: 'attack' | 'block' | 'counter' | 'damage' | 'end'
    //   blockerUsed: boolean
    //   counterPower: number (temporary during battle only)
    // }
    const [battle, setBattle] = useState(null);

    const cancelTargeting = useCallback(() => {
        // Cancel selection (before battle is created). Does not cancel an ongoing battle.
        setTargeting({ active: false, side: null, section: null, keyName: null, min: 1, max: 1, validator: null, selectedIdx: [], multi: false, selected: [], onComplete: null });
        setBattleArrow(null);
        // If battle not yet established, clear currentAttack
        if (!battle) setCurrentAttack(null);
    }, [battle]);

    const confirmTargeting = useCallback(() => {
        if (!targeting.active) return;
        const { side, section, keyName, selectedIdx, selected, onComplete, multi } = targeting;
        let arr = [];
        try {
            if (multi) {
                arr = (selected || []).map(({ side: s, section: sec, keyName: kn, index }) => {
                    const isNested = typeof areaConfigs[s][sec].mode !== 'string';
                    const cardsArr = isNested ? areas[s][sec][kn] : areas[s][sec];
                    return { side: s, section: sec, keyName: kn, index, card: cardsArr[index] };
                }).filter((x) => x.card);
            } else {
                const isNested = typeof areaConfigs[side][section].mode !== 'string';
                const cardsArr = isNested ? areas[side][section][keyName] : areas[side][section];
                arr = selectedIdx.map((i) => ({ index: i, card: cardsArr[i] })).filter((x) => x.card);
            }
        } catch { }
        cancelTargeting();
        if (typeof onComplete === 'function') onComplete(arr);
    }, [targeting, areas, areaConfigs, cancelTargeting]);

    const getCardMeta = useCallback((id) => metaById.get(id) || null, [metaById]);

    // --- Power Mod Overlays ---
    const [powerMods, setPowerMods] = useState({}); // key => number delta
    const modKey = (side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`;
    const getPowerMod = useCallback((side, section, keyName, index) => powerMods[modKey(side, section, keyName, index)] || 0, [powerMods]);
    const applyPowerMod = useCallback((side, section, keyName, index, delta) => {
        setPowerMods((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            next[k] = (next[k] || 0) + delta;
            return next;
        });
    }, []);

    const openCardAction = useCallback(async (card, index, source = null) => {
        setActionCard(card);
        setActionCardIndex(index);
        setActionSource(source);
        setActionComp(null);
        setActionOpen(true);
        setSelectedCard(card); // Set the selected card in the viewer
        try {
            const id = card?.id;
            if (!id) return;
            const match = Object.keys(actionModules).find((k) => k.endsWith(`/${id}.jsx`));
            if (match) {
                const mod = await actionModules[match]();
                setActionComp(() => mod.default || null);
            }
        } catch { }
    }, [actionModules]);

    const playSelectedCard = useCallback(() => {
        if (!actionCard || !canPlayNow) return;
        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        const cost = getCardCost(actionCard.id);
        if (!hasEnoughDonFor(side, cost)) {
            appendLog(`Cannot play ${actionCard.id}: need ${cost} DON (${side}).`);
            return;
        }
        let fieldIndex = -1;
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const isPlayer = side === 'player';
            const hand = isPlayer ? (next.player.bottom.hand || []) : (next.opponent.top.hand || []);
            const idx = actionCardIndex >= 0 ? actionCardIndex : hand.findIndex((h) => h.id === actionCard.id);
            const chars = isPlayer ? (next.player.char || []) : (next.opponent.char || []);
            if (idx !== -1 && chars.length < 5) {
                if (cost && cost > 0) {
                    const pool = isPlayer ? (next.player.bottom.cost || []) : (next.opponent.top.cost || []);
                    let toRest = cost;
                    for (let i = 0; i < pool.length && toRest > 0; i++) {
                        const d = pool[i];
                        if (d.id === 'DON' && !d.rested) {
                            d.rested = true;
                            toRest--;
                        }
                    }
                }
                const [card] = hand.splice(idx, 1);
                if (isPlayer) next.player.bottom.hand = hand; else next.opponent.top.hand = hand;
                fieldIndex = chars.length;
                const placed = { ...card, rested: false, enteredTurn: turnNumber };
                if (isPlayer) next.player.char = [...chars, placed]; else next.opponent.char = [...chars, placed];
            }
            return next;
        });
        appendLog(`[${side}] Played ${actionCard.id}${cost ? ` by resting ${cost} DON` : ''}.`);
        // Open Actions for the played card to allow On Play resolution
        setTimeout(() => {
            openCardAction(actionCard, fieldIndex, { side, section: 'char', keyName: 'char', index: fieldIndex });
        }, 0);
    }, [actionCard, canPlayNow, actionCardIndex, getCardCost, hasEnoughDonFor, appendLog, openCardAction, actionSource]);

    const dealOneDamageToLeader = useCallback((defender) => {
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (defender === 'player') {
                const life = next.player.life || [];
                if (!life.length) return next;
                const card = life[life.length - 1];
                next.player.life = life.slice(0, -1);
                next.player.bottom.hand = [...(next.player.bottom.hand || []), card];
            } else {
                const life = next.opponent.life || [];
                if (!life.length) return next;
                const card = life[life.length - 1];
                next.opponent.life = life.slice(0, -1);
                next.opponent.top.hand = [...(next.opponent.top.hand || []), card];
            }
            return next;
        });
    }, []);

    const getKeywordsFor = useCallback((id) => {
        const meta = metaById.get(id);
        return Array.isArray(meta?.keywords) ? meta.keywords : [];
    }, [metaById]);

    const canCharacterAttack = useCallback((card, side, index) => {
        if (!card || !card.id) return false;
        if (turnSide !== 'player') return false; // only allow player attacks in this demo
        if (side !== 'player') return false;
        if (phase.toLowerCase() !== 'main') return false;
        // First turn of game: no battles
        if (turnNumber === 1 && turnSide === 'player') return false;
        // Must be active (not rested)
        // Use field instance (may contain enteredTurn) rather than transient actionCard copy
        const fieldArr = areas?.player?.char || [];
        const fieldInst = fieldArr[index];
        const rested = fieldInst ? fieldInst.rested : card.rested;
        if (rested) return false;
        const rush = getKeywordsFor(card.id).some((k) => /rush/i.test(k));
        const enteredTurnVal = fieldInst ? fieldInst.enteredTurn : card.enteredTurn;
        if (typeof enteredTurnVal === 'number' && enteredTurnVal === turnNumber && !rush) return false;
        return true;
    }, [turnSide, phase, turnNumber, getKeywordsFor, areas]);

    const getBasePower = useCallback((id) => {
        const meta = metaById.get(id);
        const p = meta?.stats?.power;
        return typeof p === 'number' ? p : 0;
    }, [metaById]);

    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        const base = getBasePower(id);
        const mod = getPowerMod(side, section, keyName, index) || 0;
        return base + mod;
    }, [getBasePower, getPowerMod]);

    const beginAttackForCard = useCallback((attackerCard, attackerIndex) => {
        if (battle) return; // Only one battle at a time
        if (!canCharacterAttack(attackerCard, 'player', attackerIndex)) return;
        const attackerKey = modKey('player', 'char', 'char', attackerIndex);
        const attackerPower = getTotalPower('player', 'char', 'char', attackerIndex, attackerCard.id);
        setCurrentAttack({ key: attackerKey, cardId: attackerCard.id, index: attackerIndex, power: attackerPower });
        appendLog(`[attack] Declare attack with ${attackerCard.id} (power ${attackerPower}). Choose opponent Leader or a rested Character.`);
        // Target selection phase (Attack Step target declaration)
        startTargeting({
            side: 'opponent',
            multi: true,
            min: 1,
            max: 1,
            validator: (card, ctx) => {
                if (!ctx) return false;
                if (ctx.section === 'middle' && ctx.keyName === 'leader') return true;
                if (ctx.section === 'char' && ctx.keyName === 'char') return !!card?.rested;
                return false;
            }
        }, (targets) => {
            const t = (targets || [])[0];
            if (!t) { setCurrentAttack(null); return; }
            // Rest attacker immediately when attack declared (7-1-1-1)
            setAreas((prev) => {
                const next = JSON.parse(JSON.stringify(prev));
                if (next.player?.char?.[attackerIndex]) next.player.char[attackerIndex].rested = true;
                return next;
            });
            const targetArr = (t.section === 'char') ? (areas?.opponent?.char || []) : (areas?.opponent?.middle?.leader || []);
            const targetCard = targetArr[t.index];
            if (!targetCard) { appendLog('[attack] Target not found.'); setCurrentAttack(null); return; }
            // Initialize battle state
            setBattle({
                attacker: { side: 'player', section: 'char', keyName: 'char', index: attackerIndex, id: attackerCard.id, power: attackerPower },
                target: { side: 'opponent', section: t.section, keyName: t.keyName, index: t.index, id: targetCard.id },
                step: 'attack',
                blockerUsed: false,
                counterPower: 0
            });
        });
    }, [battle, canCharacterAttack, getTotalPower, startTargeting, setAreas, appendLog, areas]);

    // Advance battle step automatically from attack -> block
    useEffect(() => {
        if (!battle) return;
        if (battle.step === 'attack') {
            // Placeholder for [When Attacking] triggers
            appendLog(`[battle] Attack Step complete. Proceed to Block Step.`);
            setBattle((b) => ({ ...b, step: 'block' }));
        }
    }, [battle, appendLog]);

    const getDefenderPower = useCallback((b) => {
        if (!b) return 0;
        const { target } = b;
        const base = getTotalPower(target.side, target.section, target.keyName, target.index, target.id);
        return base + (b.counterPower || 0);
    }, [getTotalPower]);

    // Use live attacker power at calculation time (accounts for buffs/debuffs applied after declaration)
    const getAttackerPower = useCallback((b) => {
        if (!b) return 0;
        const { attacker } = b;
        return getTotalPower(attacker.side, attacker.section, attacker.keyName, attacker.index, attacker.id);
    }, [getTotalPower]);

    const getBattleStatus = useCallback(() => {
        if (!battle) return null;
        const atk = getAttackerPower(battle);
        const def = getDefenderPower(battle);
        const needed = Math.max(0, atk - def);
        return { atk, def, needed, safe: needed === 0 };
    }, [battle, getDefenderPower, getAttackerPower]);

    const applyBlocker = useCallback((blockerIndex) => {
        if (!battle || battle.step !== 'block') return;
        // Blocker must be active & have keyword Blocker
        const oppChars = areas?.opponent?.char || [];
        const card = oppChars[blockerIndex];
        if (!card) return;
        const hasBlocker = getKeywordsFor(card.id).some((k) => /blocker/i.test(k));
        if (!hasBlocker) return;
        if (card.rested) return; // must be active
        // Rest blocker and make it new target
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (next.opponent?.char?.[blockerIndex]) next.opponent.char[blockerIndex].rested = true;
            return next;
        });
        appendLog(`[battle] Blocker ${card.id} rests to block.`);
        setBattle((b) => ({ ...b, target: { side: 'opponent', section: 'char', keyName: 'char', index: blockerIndex, id: card.id }, blockerUsed: true, step: 'counter' }));
    }, [battle, areas, getKeywordsFor, appendLog, setAreas]);

    const skipBlock = useCallback(() => {
        if (!battle || battle.step !== 'block') return;
        appendLog('[battle] No blocker used. Proceed to Counter Step.');
        setBattle((b) => ({ ...b, step: 'counter' }));
    }, [battle, appendLog]);

    const addCounterFromHand = useCallback((handIndex) => {
        if (!battle || battle.step !== 'counter') return;
        // Defender is opponent in current demo (only player attacks)
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const hand = next.opponent?.top?.hand || [];
            const card = hand[handIndex];
            if (!card) return prev;
            const meta = metaById.get(card.id);
            const counterVal = meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0;
            if (!counterVal) return prev;
            // Move card to trash (cost of counter)
            hand.splice(handIndex, 1);
            next.opponent.top.hand = hand;
            const trashArr = next.opponent.top.trash || [];
            next.opponent.top.trash = [...trashArr, card];
            // Apply temporary counter power
            setBattle((b) => ({ ...b, counterPower: (b.counterPower || 0) + counterVal }));
            appendLog(`[battle] Counter applied: ${card.id} +${counterVal} to defender.`);
            return next;
        });
    }, [battle, metaById, appendLog, setAreas]);

    // Play an Event Counter card from opponent hand during Counter Step
    const playCounterEventFromHand = useCallback((handIndex) => {
        if (!battle || battle.step !== 'counter') return;
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const hand = next.opponent?.top?.hand || [];
            const card = hand[handIndex];
            if (!card) return prev;
            const meta = metaById.get(card.id);
            if (!meta) return prev;
            const isEvent = meta.category === 'Event';
            const hasCounterKeyword = (meta.keywords || []).some(k => /counter/i.test(k));
            if (!isEvent || !hasCounterKeyword) return prev;
            const cost = meta?.stats?.cost || 0;
            const costArr = next.opponent.top.cost || [];
            const activeDon = costArr.filter(d => d.id === 'DON' && !d.rested);
            if (activeDon.length < cost) return prev; // cannot pay
            let toRest = cost;
            for (let i = 0; i < costArr.length && toRest > 0; i++) {
                const d = costArr[i];
                if (d.id === 'DON' && !d.rested) { d.rested = true; toRest--; }
            }
            // Trash the event card
            hand.splice(handIndex, 1);
            next.opponent.top.hand = hand;
            const trashArr = next.opponent.top.trash || [];
            next.opponent.top.trash = [...trashArr, card];
            appendLog(`[battle] Event Counter activated: ${card.id} (cost ${cost}).`);
            return next;
        });
    }, [battle, metaById, appendLog, setAreas]);

    const endCounterStep = useCallback(() => {
        if (!battle || battle.step !== 'counter') return;
        appendLog('[battle] Counter Step complete. Proceed to Damage Step.');
        setBattle((b) => ({ ...b, step: 'damage' }));
    }, [battle, appendLog]);

    const resolveDamage = useCallback(() => {
        if (!battle || battle.step !== 'damage') return;
        const atkPower = getAttackerPower(battle);
        const defPower = getDefenderPower(battle);
        const targetIsLeader = battle.target.section === 'middle' && battle.target.keyName === 'leader';
        appendLog(`[battle] Damage Step: Attacker ${battle.attacker.id} ${atkPower} vs Defender ${battle.target.id} ${defPower}.`);
        if (atkPower >= defPower) {
            if (targetIsLeader) {
                appendLog('[result] Leader takes 1 damage.');
                dealOneDamageToLeader('opponent');
            } else {
                // KO character
                setAreas((prev) => {
                    const next = JSON.parse(JSON.stringify(prev));
                    const charArr = next.opponent.char || [];
                    const removed = charArr.splice(battle.target.index, 1)[0];
                    next.opponent.char = charArr;
                    const trashArr = next.opponent.top?.trash || [];
                    if (next.opponent.top) next.opponent.top.trash = [...trashArr, removed];
                    return next;
                });
                appendLog(`[result] Defender Character ${battle.target.id} K.O.'d.`);
            }
        } else {
            appendLog('[result] Attacker loses battle; no damage.');
        }
        setBattle((b) => ({ ...b, step: 'end' }));
    }, [battle, getAttackerPower, getDefenderPower, appendLog, dealOneDamageToLeader, setAreas]);

    // Transition from damage to end & cleanup
    useEffect(() => {
        if (!battle) return;
        if (battle.step === 'damage') {
            resolveDamage();
        } else if (battle.step === 'end') {
            appendLog('[battle] Battle ends.');
            setBattle(null);
            setCurrentAttack(null);
            setBattleArrow(null);
        }
    }, [battle, resolveDamage, appendLog]);

    // Maintain arrow during battle (attacker -> current target)
    useEffect(() => {
        if (!battle) return;
        const fromKey = modKey(battle.attacker.side, battle.attacker.section, battle.attacker.keyName, battle.attacker.index);
        const toKey = modKey(battle.target.side, battle.target.section, battle.target.keyName, battle.target.index);
        const label = `${getAttackerPower(battle)} ▶ ${getDefenderPower(battle)}`;
        setBattleArrow({ fromKey, toKey, label });
    }, [battle, getDefenderPower, getAttackerPower]);

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
                <Box flexGrow={1} display="flex" alignItems={mode === 'side-by-side' ? 'center' : 'flex-start'} justifyContent="flex-start" position="relative">
                    {/* Overlay label on top of cards */}
                    <Box sx={{ position: 'absolute', top: 4, left: 6, right: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2, pointerEvents: 'none' }}>
                        <Typography variant="caption" fontWeight={700} sx={{ fontSize: compact ? 13 : 15, lineHeight: 1.1, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{config.label}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.9, fontSize: compact ? 13 : 15, lineHeight: 1.1, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>({cardsArr.length})</Typography>
                    </Box>
                    {(isPlayerHand || isOppHand) && mode === 'overlap-right' ? (
                        <Box position="relative" width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET} height={CARD_H}>
                            {cardsArr.map((c, i) => (
                                <img
                                    key={c.id + i}
                                    src={c.thumb}
                                    alt={c.id}
                                    data-cardkey={modKey(side, section, keyName, i)}
                                    style={{ position: 'absolute', top: 0, left: i * OVERLAP_OFFSET, width: CARD_W, cursor: 'pointer', outline: actionOpen && actionCardIndex === i ? '3px solid #90caf9' : 'none', borderRadius: 4 }}
                                    onClick={(e) => { e.stopPropagation(); openCardAction(c, i, { side, section, keyName, index: i }); }}
                                    onMouseEnter={() => setHovered(c)}
                                    onMouseLeave={() => setHovered(null)}
                                />
                            ))}
                        </Box>
                    ) : (
                        ((side === 'player' && section === 'bottom' && keyName === 'cost') || (side === 'opponent' && section === 'top' && keyName === 'cost')) ? (
                            <Box position="relative" width={CARD_W + (cardsArr.length - 1) * OVERLAP_OFFSET} height={CARD_H}>
                                {cardsArr.map((c, i) => (
                                    <img
                                        key={(c.id || 'card') + '-' + i}
                                        src={c.thumb}
                                        alt={c.id}
                                        style={{ position: 'absolute', top: 0, left: i * OVERLAP_OFFSET, width: CARD_W, borderRadius: 4, transform: c.id === 'DON' && c.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center' }}
                                        onMouseEnter={() => setHovered(c)}
                                        onMouseLeave={() => setHovered(null)}
                                    />
                                ))}
                            </Box>
                        ) : (side === 'player' && section === 'char') ? (
                            <Box display="flex" gap={1}>
                                {cardsArr.map((c, i) => (
                                    <Box key={c.id + '-' + i} sx={{ position: 'relative' }}>
                                        <img
                                            src={c.thumb}
                                            alt={c.id}
                                            data-cardkey={modKey('player', 'char', 'char', i)}
                                            style={{
                                                width: CARD_W, height: 'auto', cursor: (targeting.active && targeting.side === 'player' && ((targeting.section === 'char' && targeting.keyName === 'char') || targeting.multi)) ? 'crosshair' : 'pointer', borderRadius: 4, transform: c.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', outline: (() => {
                                                    const selected = targeting.multi ? targeting.selected.some(s => s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i) : (targeting.active && targeting.side === 'player' && targeting.section === 'char' && targeting.keyName === 'char' && targeting.selectedIdx.includes(i));
                                                    return selected ? '3px solid #ff9800' : 'none';
                                                })()
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (targeting.active && targeting.side === 'player' && ((targeting.section === 'char' && targeting.keyName === 'char') || targeting.multi)) {
                                                    const ctx = { side: 'player', section: 'char', keyName: 'char', index: i };
                                                    const valid = typeof targeting.validator === 'function' ? targeting.validator(c, ctx) : true;
                                                    if (!valid) return;
                                                    setTargeting((prev) => {
                                                        if (prev.multi) {
                                                            const has = prev.selected.some(s => s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i);
                                                            let selected = has ? prev.selected.filter((s) => !(s.side === 'player' && s.section === 'char' && s.keyName === 'char' && s.index === i)) : [...prev.selected, ctx];
                                                            if (selected.length > prev.max) selected = selected.slice(-prev.max);
                                                            // Update arrow preview (from attacker to chosen target)
                                                            if (selected.length && currentAttack) {
                                                                setBattleArrow({ fromKey: currentAttack.key, toKey: modKey('player', 'char', 'char', selected[selected.length - 1].index).replace('player', 'opponent'), label: `${currentAttack.power || ''}` });
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
                                                openCardAction(c, i, { side: 'player', section: 'char', keyName: 'char', index: i });
                                            }}
                                            onMouseEnter={() => setHovered(c)}
                                            onMouseLeave={() => setHovered(null)}
                                        />
                                        {(() => {
                                            const delta = getPowerMod('player', 'char', 'char', i);
                                            if (!delta) return null;
                                            return (
                                                <Box sx={{ position: 'absolute', top: 4, left: 4, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.5)' }}>
                                                    <Typography variant="caption" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                ))}
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
                                            <img
                                                src={c.thumb}
                                                alt={c.id}
                                                style={{
                                                    width: CARD_W, height: 'auto', cursor: isTargetingHere ? (valid ? 'crosshair' : 'not-allowed') : 'pointer', borderRadius: 4, filter: isTargetingHere && !valid ? 'grayscale(0.9) brightness(0.6)' : 'none', transform: c.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', outline: (() => {
                                                        // Highlight eligible blockers during Block Step
                                                        if (battle && battle.step === 'block' && battle.target && battle.target.section !== 'char') {
                                                            const hasBlocker = getKeywordsFor(c.id).some(k => /blocker/i.test(k));
                                                            const active = !c.rested;
                                                            if (hasBlocker && active) return '3px solid #66bb6a';
                                                        }
                                                        return selected ? '3px solid #ff9800' : 'none';
                                                    })()
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
                                            {battle && battle.target && battle.target.section === 'char' && battle.target.index === i && (
                                                <Box sx={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                    {(() => {
                                                        const s = getBattleStatus();
                                                        if (!s) return null;
                                                        return (
                                                            <>
                                                                <Chip size="small" label={`DEF ${s.def}`} color={s.safe ? 'success' : 'default'} variant={s.safe ? 'filled' : 'outlined'} />
                                                                {s.safe ? (
                                                                    <Chip size="small" label="Safe" color="success" />
                                                                ) : (
                                                                    <Chip size="small" label={`Need +${s.needed}`} color="warning" />
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </Box>
                                            )}
                                            {(() => {
                                                const delta = getPowerMod('opponent', 'char', 'char', i);
                                                if (!delta) return null;
                                                return (
                                                    <Box sx={{ position: 'absolute', top: 4, left: 4, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.5)' }}>
                                                        <Typography variant="caption" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
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
                                    const onClick = (e) => {
                                        e.stopPropagation();
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
                                            <img
                                                src={c?.thumb}
                                                alt={c?.id}
                                                data-cardkey={modKey(side, 'middle', 'leader', idx)}
                                                style={{ width: CARD_W, height: 'auto', borderRadius: 4, transform: c?.rested ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', outline: selected ? '3px solid #ff9800' : 'none', cursor: isTargetingHere ? 'crosshair' : 'pointer' }}
                                                onClick={onClick}
                                                onMouseEnter={() => c && setHovered(c)}
                                                onMouseLeave={() => setHovered(null)}
                                            />
                                            {selected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(255,152,0,0.9)' }}>
                                                    <Typography variant="caption" sx={{ color: '#000', fontWeight: 700 }}>Target</Typography>
                                                </Box>
                                            )}
                                            {battle && battle.target && battle.target.section === 'middle' && side === battle.target.side && keyName === 'leader' && (
                                                <Box sx={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                    {(() => {
                                                        const s = getBattleStatus();
                                                        if (!s) return null;
                                                        return (
                                                            <>
                                                                <Chip size="small" label={`DEF ${s.def}`} color={s.safe ? 'success' : 'default'} variant={s.safe ? 'filled' : 'outlined'} />
                                                                {s.safe ? (
                                                                    <Chip size="small" label="Safe" color="success" />
                                                                ) : (
                                                                    <Chip size="small" label={`Need +${s.needed}`} color="warning" />
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </Box>
                                            )}
                                            {(() => {
                                                const delta = getPowerMod(side, 'middle', 'leader', idx);
                                                if (!delta) return null;
                                                return (
                                                    <Box sx={{ position: 'absolute', top: 4, left: 4, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.5)' }}>
                                                        <Typography variant="caption" sx={{ color: delta > 0 ? '#4caf50' : '#ef5350', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Typography>
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

    // --- Opening Hand Modal ---
    const finalizeKeep = () => {
        // Move openingHand to player's hand area; set Life (5) for both players; shrink deck stacks accordingly
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            // Player hand gets opening 5
            next.player.bottom.hand = openingHand.slice(0, 5);
            // Compute top 5 (life) for each side from current libraries
            // Opening hand are the last 5; life should be the next 5 below that
            const pLifeIds = library.slice(-10, -5);
            const oLifeIds = oppLibrary.slice(-5);
            const pLife = pLifeIds.map((id) => getAssetForId(id)).filter(Boolean);
            const oLife = oLifeIds.map((id) => getAssetForId(id)).filter(Boolean);
            next.player.life = pLife;
            next.opponent.life = oLife;
            // Shrink deck visuals: player's deck -10 (5 hand, 5 life); opponent deck already -5 (hand), so -5 more (life)
            const pRemain = Math.max(0, (next.player.middle.deck || []).length - 10);
            next.player.middle.deck = Array.from({ length: pRemain }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
            const oRemain = Math.max(0, (next.opponent.middle.deck || []).length - 5);
            next.opponent.middle.deck = Array.from({ length: oRemain }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
            return next;
        });
        // Remove 10 from player's library (5 to hand, 5 to life), and 5 from opponent's (life)
        setLibrary((prev) => prev.slice(0, -10));
        setOppLibrary((prev) => prev.slice(0, -5));
        setOpeningShown(false);
        // Initialize turn state (auto-refresh -> start at Draw)
        setTurnSide('player');
        setTurnNumber(1);
        setPhase('Draw');
        appendLog('Start Turn. Refresh completed.');
    };

    const onKeep = () => {
        finalizeKeep();
    };

    const onMulligan = () => {
        if (!allowMulligan) return;
        // Put current 5 to bottom, draw new 5, must keep
        setLibrary((prev) => {
            const lib = prev.slice();
            const cur5 = lib.splice(-5, 5);
            lib.unshift(...cur5); // bottom is front of array (we treat top as end)
            const draw5 = lib.slice(-5);
            const newHand = draw5.map((id) => getAssetForId(id)).filter(Boolean).slice(0, 5);
            setOpeningHand(newHand);
            setAllowMulligan(false);
            return lib;
        });
    };

    // --- Self-Play Engine Helpers ---
    const drawCard = useCallback((side) => {
        setAreas((prevAreas) => {
            const next = JSON.parse(JSON.stringify(prevAreas));
            const isPlayer = side === 'player';
            const lib = isPlayer ? library : oppLibrary;
            if (!lib.length) return next;
            const topId = lib[lib.length - 1];
            const asset = getAssetForId(topId);
            if (isPlayer) {
                next.player.bottom.hand = [...(next.player.bottom.hand || []), asset];
                next.player.middle.deck = Array.from({ length: Math.max(0, (next.player.middle.deck || []).length - 1) }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
            } else {
                next.opponent.top.hand = [...(next.opponent.top.hand || []), asset];
                next.opponent.middle.deck = Array.from({ length: Math.max(0, (next.opponent.middle.deck || []).length - 1) }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
            }
            return next;
        });
        if (side === 'player') setLibrary((prev) => prev.slice(0, -1));
        else setOppLibrary((prev) => prev.slice(0, -1));
    }, [library, oppLibrary, getAssetForId]);

    const donPhaseGain = useCallback((side, count) => {
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (side === 'player') {
                const toMove = Math.min(count, (next.player.bottom.don || []).length);
                const moved = Array.from({ length: toMove }, () => ({ ...DON_FRONT, rested: false }));
                next.player.bottom.don = (next.player.bottom.don || []).slice(0, -toMove);
                next.player.bottom.cost = [...(next.player.bottom.cost || []), ...moved];
            } else {
                const toMove = Math.min(count, (next.opponent.top.don || []).length);
                const moved = Array.from({ length: toMove }, () => ({ ...DON_FRONT, rested: false }));
                next.opponent.top.don = (next.opponent.top.don || []).slice(0, -toMove);
                next.opponent.top.cost = [...(next.opponent.top.cost || []), ...moved];
            }
            return next;
        });
    }, []);

    

    // Next Action button handler based on current phase
    const nextActionLabel = useMemo(() => {
        if (phase.toLowerCase() === 'draw') return 'Draw Card';
        if (phase.toLowerCase() === 'don') {
            const isFirst = turnNumber === 1 && turnSide === 'player';
            return `Gain ${isFirst ? 1 : 2} DON!!`;
        }
        return 'End Turn';
    }, [phase, turnNumber, turnSide]);

    const onNextAction = useCallback(() => {
        if (phase.toLowerCase() === 'draw') {
            const isFirst = turnNumber === 1 && turnSide === 'player';
            if (!isFirst) {
                drawCard(turnSide);
                appendLog('Draw 1.');
            } else {
                appendLog('First turn: skip draw.');
            }
            setPhase('Don');
            return;
        }
        if (phase.toLowerCase() === 'don') {
            const isFirst = turnNumber === 1 && turnSide === 'player';
            const amt = isFirst ? 1 : 2;
            donPhaseGain(turnSide, amt);
            appendLog(`DON!! +${amt}.`);
            setPhase('Main');
            return;
        }
        // End Turn from Main
        appendLog('End Turn. Refresh next turn auto.');
        const nextSide = turnSide === 'player' ? 'opponent' : 'player';
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);
        // Invalidate power modifiers that lasted "during this turn"
        setPowerMods({});
        // Refresh: set all rested cards (DON, Leader, Characters) to active for the new turn player
        setAreas((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            const costLoc = nextSide === 'player' ? next.player.bottom : next.opponent.top;
            costLoc.cost = (costLoc.cost || []).map((c) => (c.id === 'DON' ? { ...c, rested: false } : c));
            const sideLoc = nextSide === 'player' ? next.player : next.opponent;
            if (sideLoc?.middle?.leader && sideLoc.middle.leader[0]) {
                sideLoc.middle.leader[0].rested = false;
            }
            if (Array.isArray(sideLoc?.char)) {
                sideLoc.char = sideLoc.char.map((c) => ({ ...c, rested: false }));
            }
            return next;
        });
        setPhase('Draw'); // Auto-Refresh applied
    }, [phase, turnNumber, turnSide, drawCard, appendLog, donPhaseGain]);

    // Render main UI: show loading, user info, or login/register form plus card viewer
    const [deckOpen, setDeckOpen] = useState(false);
    return (
        <Container maxWidth={false} disableGutters sx={{ py: 0, px: compact ? 1 : 2, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ p: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', m: 0, py: 0, minHeight: 48 }}>
                    <Typography variant={'h6'} fontWeight={700} sx={{ mb: 0, lineHeight: 1 }}>
                        One Piece TCG Sim
                    </Typography>
                    {isLoggedIn && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Chip color="primary" label={`Turn ${turnNumber}`} />
                            <Chip color={turnSide === 'player' ? 'success' : 'warning'} label={`${turnSide === 'player' ? 'Your' : "Opponent's"} Turn`} />
                            <Chip variant="outlined" label={`Phase: ${phase}`} />
                            <Button size="small" variant="contained" onClick={onNextAction}>{nextActionLabel}</Button>
                        </Stack>
                    )}
                    {isLoggedIn && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button size="small" variant="contained" onClick={() => setDeckOpen(true)}>Deck Builder</Button>
                            <Typography variant="body2" sx={{ opacity: 0.9, lineHeight: 1.2 }}>
                                Signed in as: <strong>{user}</strong>
                            </Typography>
                            <Button size="small" variant="outlined" onClick={logout}>Sign out</Button>
                        </Box>
                    )}
                </Box>
                {loading ? (
                    <Typography>Checking session…</Typography>
                ) : !isLoggedIn ? (
                    <LoginRegister compact={compact} />
                ) : (
                    <Box sx={{ mt: 0 }}>
                        <Divider sx={{ mt: -0.5, mb: 0 }} />
                        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={compact ? 2 : 3} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            {/* Play Area Board */}
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
                                        <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ mb: compact ? 0.5 : 1 }}>
                                            <AreaBox side="opponent" section="top" keyName="hand" config={areaConfigs.opponent.top.hand} />
                                            <AreaBox side="opponent" section="top" keyName="trash" config={areaConfigs.opponent.top.trash} />
                                            <AreaBox side="opponent" section="top" keyName="cost" config={areaConfigs.opponent.top.cost} />
                                            <AreaBox side="opponent" section="top" keyName="don" config={areaConfigs.opponent.top.don} />
                                        </Stack>
                                        <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ mb: compact ? 0.5 : 1 }}>
                                            <Box sx={{ width: COST_W }} />
                                            <AreaBox side="opponent" section="middle" keyName="deck" config={areaConfigs.opponent.middle.deck} />
                                            <AreaBox side="opponent" section="middle" keyName="stage" config={areaConfigs.opponent.middle.stage} />
                                            <AreaBox side="opponent" section="middle" keyName="leader" config={areaConfigs.opponent.middle.leader} />
                                        </Stack>
                                        <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ mb: compact ? 0.5 : 1 }}>
                                            <Box sx={{ width: COST_W }} />
                                            <AreaBox side="opponent" section="char" keyName="char" config={areaConfigs.opponent.char} />
                                            <AreaBox side="opponent" section="life" keyName="life" config={areaConfigs.opponent.life} />
                                        </Stack>
                                    </Box>
                                    {/* Player Side */}
                                    <Box>
                                        {/* Player top row: constrain row height to character area while letting life overflow without shifting horizontally */}
                                        <Box sx={{ display: 'flex', position: 'relative', height: areaConfigs.player.char.height, mb: compact ? 0.5 : 1 }}>
                                            <Box sx={{ width: COST_W, flexShrink: 0 }} />
                                            <Box sx={{ width: LIFE_W, flexShrink: 0, overflow: 'visible', ml: compact ? 0.5 : 1 }}>
                                                <AreaBox side="player" section="life" keyName="life" config={areaConfigs.player.life} />
                                            </Box>
                                            <Box sx={{ ml: compact ? 0.5 : 1 }}>
                                                <AreaBox side="player" section="char" keyName="char" config={areaConfigs.player.char} />
                                            </Box>
                                        </Box>
                                        {/* Player middle row: add left spacer to shift leader/stage right; deck aligned above trash */}
                                        <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ mb: compact ? 0.5 : 1 }}>
                                            <Box sx={{ width: COST_W + SINGLE_W + (compact ? 4 : 8) }} />
                                            <Box sx={{ width: COST_W }}>
                                                <Stack direction="row" spacing={compact ? 0.5 : 1} justifyContent="flex-end">
                                                    <AreaBox side="player" section="middle" keyName="leader" config={areaConfigs.player.middle.leader} />
                                                    <AreaBox side="player" section="middle" keyName="stage" config={areaConfigs.player.middle.stage} />
                                                </Stack>
                                            </Box>
                                            <Box sx={{ width: SINGLE_W }}>
                                                <AreaBox side="player" section="middle" keyName="deck" config={areaConfigs.player.middle.deck} />
                                            </Box>
                                        </Stack>
                                        <Stack direction="row" spacing={compact ? 0.5 : 1}>
                                            <AreaBox side="player" section="bottom" keyName="hand" config={areaConfigs.player.bottom.hand} />
                                            <AreaBox side="player" section="bottom" keyName="don" config={areaConfigs.player.bottom.don} />
                                            <AreaBox side="player" section="bottom" keyName="cost" config={areaConfigs.player.bottom.cost} />
                                            <AreaBox side="player" section="bottom" keyName="trash" config={areaConfigs.player.bottom.trash} />
                                        </Stack>
                                    </Box>
                                </Box>
                            </Box>

                            {/* Viewer Column */}
                            <Box sx={{ width: { xs: '100%', md: compact ? 380 : 440 }, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
                                <Typography variant={compact ? 'h6' : 'h5'} gutterBottom sx={{ mb: compact ? 1 : 2, flexShrink: 0 }}>Card Viewer</Typography>
                                {cardError && <Alert severity="error" sx={{ mb: 2 }}>{cardError}</Alert>}
                                {loadingCards ? (
                                    <CircularProgress size={28} />
                                ) : (
                                    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', overflow: 'hidden' }}>
                                        {(() => {
                                            // Show hovered card if hovering, otherwise show selected card if one exists
                                            const displayCard = hovered || selectedCard;
                                            return displayCard ? (
                                                <img src={displayCard.full} alt={displayCard.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                            ) : (
                                                <Typography variant="body2" color="text.secondary" textAlign="center">Hover over a card to view its effects</Typography>
                                            );
                                        })()}
                                    </Box>
                                )}
                                {(() => {
                                    const displayCard = hovered || selectedCard;
                                    return displayCard && (
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                            <Typography variant="caption" display="block">
                                                {displayCard.id}
                                            </Typography>
                                            {selectedCard && !hovered && (
                                                <Chip label="Selected" size="small" color="primary" variant="outlined" />
                                            )}
                                        </Stack>
                                    );
                                })()}
                                <Divider sx={{ my: 1 }} />
                                <Box ref={logRef} sx={{ border: '1px dashed', borderColor: 'divider', p: 1, borderRadius: 1, height: 120, overflow: 'auto', bgcolor: 'background.default' }}>
                                    {log.map((l, i) => (
                                        <Typography key={i} variant="caption" display="block">{l}</Typography>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
            {isLoggedIn && <DeckBuilder open={deckOpen} onClose={() => setDeckOpen(false)} />}
            {/* Disable test ActionsPanel in game mode */}
            {isLoggedIn && !gameStarted && (
                <ActionsPanel title="Actions">
                    <OP01004Action />
                </ActionsPanel>
            )}

            <OpeningHand open={openingShown} hand={openingHand} allowMulligan={allowMulligan} onMulligan={onMulligan} onKeep={onKeep} />

            {/* Anchored Actions Panel (bottom-right) */}
            {actionOpen && (
                <ClickAwayListener onClickAway={() => { setActionOpen(false); setActionCardIndex(-1); setActionSource(null); setSelectedCard(null); }}>
                    <div>
                        {(() => {
                            const id = actionCard?.id;
                            const meta = id ? metaById.get(id) : null;
                            const title = id ? `${id}${meta?.name ? ` — ${meta.name}` : ''}` : 'Actions';
                            return (
                                <ActionsPanel title={title} onClose={() => { setActionOpen(false); setActionCardIndex(-1); setActionSource(null); setSelectedCard(null); }}>
                                    <Box sx={{ width: '100%' }}>
                                        {ActionComp ? (
                                            <ActionComp
                                                phase={phase}
                                                turnSide={turnSide}
                                                isYourTurn={turnSide === 'player'}
                                                canActivateMain={canPlayNow}
                                                areas={areas}
                                                startTargeting={startTargeting}
                                                cancelTargeting={cancelTargeting}
                                                confirmTargeting={confirmTargeting}
                                                targeting={targeting}
                                                getCardMeta={(id) => metaById.get(id) || null}
                                                actionSource={actionSource}
                                                applyPowerMod={applyPowerMod}
                                                battle={battle}
                                                battleApplyBlocker={applyBlocker}
                                                battleSkipBlock={skipBlock}
                                                battleAddCounterFromHand={addCounterFromHand}
                                                battlePlayCounterEvent={playCounterEventFromHand}
                                                battleEndCounterStep={endCounterStep}
                                                battleGetDefPower={() => getDefenderPower(battle)}
                                            />
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">No specific actions available for this card.</Typography>
                                        )}
                                        {actionSource && ((actionSource.side === 'player' && actionSource.section === 'bottom' && actionSource.keyName === 'hand') || (actionSource.side === 'opponent' && actionSource.section === 'top' && actionSource.keyName === 'hand')) ? (
                                            <>
                                                <Divider sx={{ my: 1 }} />
                                                <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                                                    {(() => {
                                                        if (battle && battle.step === 'counter' && actionSource.side === 'opponent') return 'Counter Step: use counters or counter events.';
                                                        if (!canPlayNow) return 'Cannot play now (must be Main Phase).';
                                                        const cost = actionCard ? getCardCost(actionCard.id) : 0;
                                                        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
                                                        const ok = hasEnoughDonFor(side, cost);
                                                        return ok ? `Playable now (${side}). Cost: ${cost} DON.` : `Need ${cost} active DON (${side}).`;
                                                    })()}
                                                </Typography>
                                                {(() => {
                                                    if (battle && battle.step === 'counter' && actionSource.side === 'opponent') {
                                                        const meta = metaById.get(actionCard?.id);
                                                        if (!meta) return null;
                                                        const elements = [];
                                                        const counterVal = meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0;
                                                        if (counterVal) {
                                                            elements.push(
                                                                <Button key="counterDiscard" size="small" variant="contained" color="error" onClick={() => { addCounterFromHand(actionCardIndex); setActionOpen(false); }}>
                                                                    Discard for Counter +{counterVal}
                                                                </Button>
                                                            );
                                                        }
                                                        const isEvent = meta.category === 'Event';
                                                        const hasCounterKeyword = (meta.keywords || []).some(k => /counter/i.test(k));
                                                        if (isEvent && hasCounterKeyword) {
                                                            const cost = meta?.stats?.cost || 0;
                                                            const canPay = hasEnoughDonFor('opponent', cost);
                                                            elements.push(
                                                                <Button key="counterEvent" size="small" variant="outlined" disabled={!canPay} onClick={() => { playCounterEventFromHand(actionCardIndex); setActionOpen(false); }}>
                                                                    Play Counter Event (Cost {cost})
                                                                </Button>
                                                            );
                                                        }
                                                        if (!elements.length) return <Typography variant="caption">No counter on this card.</Typography>;
                                                        return <Stack direction="row" spacing={1}>{elements}</Stack>;
                                                    }
                                                    const cost = actionCard ? getCardCost(actionCard.id) : 0;
                                                    const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
                                                    const ok = canPlayNow && hasEnoughDonFor(side, cost);
                                                    return (
                                                        <Button variant="contained" disabled={!ok} onClick={playSelectedCard}>Play to Character Area</Button>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                                                {phase.toLowerCase() === 'main' ? 'Select an action for this card.' : 'Actions are limited outside the Main Phase.'}
                                            </Typography>
                                        )}
                                        {(() => {
                                            const isOnFieldChar = actionSource && actionSource.side === 'player' && actionSource.section === 'char' && actionSource.keyName === 'char';
                                            if (!isOnFieldChar) return null;
                                            const cardObj = actionCard;
                                            const idx = actionCardIndex;
                                            if (battle && battle.attacker.index === idx) {
                                                // During Block/Counter steps, attacker has no actionable controls here
                                                return null;
                                            }
                                            const canAtk = canCharacterAttack(cardObj, 'player', idx);
                                            if (!canAtk || battle) return null;
                                            const selecting = targeting.active && currentAttack && currentAttack.index === idx && !battle;
                                            if (selecting) {
                                                return (
                                                    <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                                                        {(() => {
                                                            // Derive a concise target label for clarity during confirmation
                                                            let label = '';
                                                            if (Array.isArray(targeting.selected) && targeting.selected.length) {
                                                                const t = targeting.selected[targeting.selected.length - 1];
                                                                if (t.section === 'middle' && t.keyName === 'leader') label = 'Opponent Leader';
                                                                if (t.section === 'char' && t.keyName === 'char') {
                                                                    const arr = areas?.opponent?.char || [];
                                                                    const tc = arr[t.index];
                                                                    label = tc?.id || 'Opponent Character';
                                                                }
                                                            }
                                                            return (
                                                                <Chip size="small" color="warning" label={label ? `Target: ${label}` : 'Select a target'} />
                                                            );
                                                        })()}
                                                        <Button size="small" variant="contained" disabled={(targeting.selected?.length || 0) < 1} onClick={confirmTargeting}>Confirm Attack</Button>
                                                        <Button size="small" variant="outlined" onClick={cancelTargeting}>Cancel Attack</Button>
                                                    </Stack>
                                                );
                                            }
                                            return (
                                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                    <Button size="small" variant="contained" onClick={() => beginAttackForCard(cardObj, idx)}>Attack</Button>
                                                </Stack>
                                            );
                                        })()}
                                    </Box>
                                </ActionsPanel>
                            );
                        })()}
                    </div>
                </ClickAwayListener>
            )}
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
                // Color arrow by current safety: green safe, orange within 1000, red otherwise
                let stroke = '#f44336';
                const s = getBattleStatus();
                if (s) {
                    stroke = s.safe ? '#43a047' : (s.needed <= 1000 ? '#fb8c00' : '#f44336');
                }
                return (
                    <svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1600 }}>
                        <defs>
                            <marker id={id} markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
                            </marker>
                        </defs>
                        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth="4" markerEnd={`url(#${id})`} />
                        {label ? (
                            <g>
                                <rect x={mid.x - 28} y={mid.y - 12} width="56" height="18" rx="4" ry="4" fill="rgba(0,0,0,0.6)" />
                                <text x={mid.x} y={mid.y} fill="#fff" fontSize="12" textAnchor="middle" dominantBaseline="middle">{label}</text>
                            </g>
                        ) : null}
                    </svg>
                );
            })()}
        </Container>
    );
}

