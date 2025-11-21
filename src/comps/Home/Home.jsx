
// Home.jsx
// Main landing page for One Piece TCG Sim. Handles login, registration, and displays user info.
import React, { useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { AuthContext } from '../../AuthContext';
import { Box, Container, Typography, Paper, Button, Stack, Chip, Divider } from '@mui/material';
import ClickAwayListener from '@mui/material/ClickAwayListener';
// Auth form now extracted to its own component
import LoginRegister from '../LoginRegister/LoginRegister';
import Actions from './Actions';
import DeckBuilder from '../DeckBuilder/DeckBuilder';
import { loadAllCards as loadCardJson } from '../../data/cards/loader';
import Board from './Board';
import CardViewer from './CardViewer';
import Activity from './Activity';


export default function Home() {
    // Auth context values and actions
    const { isLoggedIn, user, logout, loading } = useContext(AuthContext);


    // --- Card Viewer State ---
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
                setAllCards(data.cards || []);
                setHovered(null);
            } catch (e) {
                setCardError(e.message);
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
    const [compact, setCompact] = useState(false);

    // State storage for each area
    const [areas, setAreas] = useState(() => {
        const init = {
            opponent: {
                top: { hand: [], trash: [], cost: [], don: [] },
                middle: { deck: [], stage: [], leader: [], leaderDon: [] },
                char: [],
                charDon: [], // array of arrays: charDon[i] = DON!! cards under char[i]
                life: []
            },
            player: {
                life: [],
                char: [],
                charDon: [], // array of arrays: charDon[i] = DON!! cards under char[i]
                middle: { leader: [], leaderDon: [], stage: [], deck: [] },
                bottom: { hand: [], don: [], cost: [], trash: [] }
            }
        };
        return init;
    });

    // --- Game State ---
    const [gameStarted, setGameStarted] = useState(true); // disable manual board edits by default
    const [openingShown, setOpeningShown] = useState(false);
    const [allowMulligan, setAllowMulligan] = useState(true);
    const [openingHand, setOpeningHand] = useState([]); // asset objects for display
    const [library, setLibrary] = useState([]); // array of card IDs for player's deck order (top at end)
    const [leaderId, setLeaderId] = useState('');
    const [oppLibrary, setOppLibrary] = useState([]);

    // --- Deck Search State ---
    const [deckSearchOpen, setDeckSearchOpen] = useState(false);
    const [deckSearchConfig, setDeckSearchConfig] = useState({
        side: 'player',
        cards: [],
        quantity: 5,
        filter: {},
        minSelect: 0,
        maxSelect: 1,
        returnLocation: 'bottom',
        canReorder: true,
        effectDescription: '',
        onComplete: null
    });

    // Memoize constant card objects to prevent recreation on every render
    const CARD_BACK_URL = useMemo(() => '/api/cards/assets/Card%20Backs/CardBackRegular.png', []);
    const DON_FRONT = useMemo(() => ({ id: 'DON', full: '/api/cards/assets/Don/Don.png', thumb: '/api/cards/assets/Don/Don.png' }), []);
    const DON_BACK = useMemo(() => ({ id: 'DON_BACK', full: '/api/cards/assets/Card%20Backs/CardBackDon.png', thumb: '/api/cards/assets/Card%20Backs/CardBackDon.png' }), []);

    // Helper to create array of card back objects
    const createCardBacks = useCallback((count) => {
        return Array.from({ length: count }, () => ({ id: 'BACK', thumb: CARD_BACK_URL, full: CARD_BACK_URL }));
    }, [CARD_BACK_URL]);

    // Self-play loop
    const [turnSide, setTurnSide] = useState('player'); // 'player' | 'opponent'
    const [turnNumber, setTurnNumber] = useState(1);
    const [phase, setPhase] = useState('Draw'); // Draw | Don | Main | End
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);
    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        setLog((prev) => [...prev.slice(-199), `[T${turnNumber} ${turnSide} ${phase}] ${msg}`]);
    }, [turnNumber, turnSide, phase]);

    // End Turn confirmation state
    const [endTurnConfirming, setEndTurnConfirming] = useState(false);
    const endTurnTimeoutRef = useRef(null);

    // Clear end turn confirmation timeout on unmount
    useEffect(() => {
        return () => {
            if (endTurnTimeoutRef.current) {
                clearTimeout(endTurnTimeoutRef.current);
            }
        };
    }, []);

    // TODO: Implement DON!! giving mechanism (rule 6-5-5)
    // Leaders and Characters should store givenDon array: [{ id: 'DON', ... }, ...]
    // During Main Phase, player can move DON from cost area to under Leader/Character
    // Given DON!! provides +1000 power per DON during your turn (6-5-5-2)
    // Refresh Phase returns all given DON!! to cost area as rested (6-2-3)

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

    // Helper: shuffle array in-place (Fisher-Yates)
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // Build a full 50-card id list from stored deck data
    const expandDeckItems = useCallback((items) => {
        return (items || []).flatMap(it => Array(it.count || 0).fill(it.id));
    }, []);

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
                        const next = structuredClone(prev);
                        // Place leaders - create separate copies to avoid shared references
                        next.player.middle.leader = [{ ...leaderAsset, rested: false }];
                        next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
                        // Deck stacks visuals
                        next.player.middle.deck = createCardBacks(libP.length);
                        next.opponent.middle.deck = createCardBacks(libO.length);
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
                        next.opponent.middle.deck = createCardBacks(Math.max(0, libO.length - 5));
                        return next;
                    });

                    setLeaderId(DEMO_LEADER);
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
                        const next = structuredClone(prev);
                        next.player.middle.deck = createCardBacks(50);
                        next.opponent.middle.deck = createCardBacks(50);
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
                    const next = structuredClone(prev);
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
                        next.player.middle.leader = [{ ...leaderAsset, rested: false }];
                        next.opponent.middle.leader = [{ ...leaderAsset, rested: false }];
                    }
                    // Set deck as N back cards for both sides (player uses actual count, opponent mirrors 50)
                    next.player.middle.deck = createCardBacks(lib.length);
                    next.opponent.middle.deck = createCardBacks(50);
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
                    const next = structuredClone(prev);
                    next.player.middle.deck = createCardBacks(50);
                    next.opponent.middle.deck = createCardBacks(50);
                    return next;
                });
            }
        })();
    }, [isLoggedIn, allCards, allById, openingShown, library.length]);

    const addCardToArea = useCallback((side, section, key) => {
        if (gameStarted) return; // disable manual adding in game mode
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
    }, [getRandomCard, gameStarted]);

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

    const [actionOpen, setActionOpen] = useState(false);
    const [actionCard, setActionCard] = useState(null);
    const [actionCardIndex, setActionCardIndex] = useState(-1);
    const [actionSource, setActionSource] = useState(null); // { side, section, keyName, index }

    // Helper to close the action panel
    const closeActionPanel = useCallback(() => {
        setActionOpen(false);
        setActionCardIndex(-1);
        setActionSource(null);
        setSelectedCard(null);
    }, []);

    // Helpers to get side location from areas state
    const getSideLocation = useCallback((side) => side === 'player' ? areas.player : areas.opponent, [areas]);
    const getSideLocationFromNext = (next, side) => side === 'player' ? next.player : next.opponent;
    // Helper to get the hand/cost/trash/don container (bottom for player, top for opponent)
    const getHandCostLocation = useCallback((side) => side === 'player' ? areas?.player?.bottom : areas?.opponent?.top, [areas]);
    const getHandCostLocationFromNext = (next, side) => side === 'player' ? next.player.bottom : next.opponent.top;
    // Helpers to get specific arrays from areas with default empty array
    const getCharArray = useCallback((side) => side === 'player' ? (areas?.player?.char || []) : (areas?.opponent?.char || []), [areas]);
    const getLeaderArray = useCallback((side) => side === 'player' ? (areas?.player?.middle?.leader || []) : (areas?.opponent?.middle?.leader || []), [areas]);
    const getCostArray = useCallback((side) => side === 'player' ? (areas?.player?.bottom?.cost || []) : (areas?.opponent?.top?.cost || []), [areas]);
    const getDonDeckArray = useCallback((side) => side === 'player' ? (areas?.player?.bottom?.don || []) : (areas?.opponent?.top?.don || []), [areas]);

    const hasEnoughDonFor = useCallback((side, cost) => {
        if (!cost || cost <= 0) return true;
        const arr = getCostArray(side);
        const active = arr.filter((c) => c.id === 'DON' && !c.rested).length;
        return active >= cost;
    }, [getCostArray]);

    // --- DON!! Giving Selection System ---
    const [donGivingMode, setDonGivingMode] = useState({
        active: false,
        side: null, // which side's DON is being given
        selectedDonIndex: null // index of selected DON in cost area
    });

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
        // suspension + provenance metadata
        suspended: false,
        sessionId: null,
        origin: null, // { side, section, keyName, index }
        abilityIndex: null, // number | null (for ability-driven targeting)
        type: null // 'ability' | 'attack' | null
    });

    const startTargeting = useCallback((descriptor, onComplete) => {
        const { side, section, keyName, min = 1, max = 1, validator = null, multi = false, origin = null, abilityIndex = null, type = 'ability' } = descriptor || {};
        const sessionId = Date.now() + Math.random();
        console.log('[targeting:start]', { sessionId, side, section, keyName, min, max, multi, abilityIndex, type, origin });
        setTargeting({
            active: true, side, section: section || null, keyName: keyName || null, min, max, validator,
            selectedIdx: [], multi, selected: [], onComplete,
            suspended: false, sessionId, origin: origin || null,
            abilityIndex: (typeof abilityIndex === 'number' ? abilityIndex : null),
            type: type || 'ability'
        });
    }, []);

    const suspendTargeting = useCallback(() => {
        setTargeting((prev) => {
            if (!prev?.active) return prev;
            if (prev.suspended) return prev;
            return { ...prev, suspended: true };
        });
    }, []);

    const [currentAttack, setCurrentAttack] = useState(null); // { key, cardId, index, power }
    const [battleArrow, setBattleArrow] = useState(null); // { fromKey, toKey, label }
    // [Trigger] state for damage processing (Rules 4-6-3, 10-1-5)
    const [triggerPending, setTriggerPending] = useState(null); // { side: 'player'|'opponent', card: asset, hasTrigger: boolean }
    // Battle state lifecycle implementing steps per rules 7-1
    // battle: {
    //   attacker: { side, section, keyName, index, id, power }
    //   target: { side, section, keyName, index, id }
    //   step: 'attack' | 'block' | 'counter' | 'damage' | 'end'
    //   blockerUsed: boolean
    //   counterPower: number (temporary during battle only)
    //   counterTarget: { side, section, keyName, index } | null (which card receives counter power)
    // }
    const [battle, setBattle] = useState(null);
    const [resolvingEffect, setResolvingEffect] = useState(false);

    // Check if a specific side can play cards now
    // Must be Main Phase, that side's turn, and NOT currently in battle (CR 7-1 flow, 10-2-2/10-2-3)
    const canPlayNow = useCallback((side) => {
        return phaseLower === 'main' && side === turnSide && !battle;
    }, [phaseLower, turnSide, battle]);

    const cancelTargeting = useCallback(() => {
        // Cancel current selection flow
        setTargeting({
            active: false,
            side: null,
            section: null,
            keyName: null,
            min: 1,
            max: 1,
            validator: null,
            selectedIdx: [],
            multi: false,
            selected: [],
            onComplete: null,
            suspended: false,
            sessionId: null,
            origin: null,
            abilityIndex: null,
            type: null
        });

        if (battle) {
            // Preserve the battle arrow when a battle is in progress
            const fromKey = `${battle.attacker.side}:${battle.attacker.section}:${battle.attacker.keyName}:${battle.attacker.index}`;
            const toKey = `${battle.target.side}:${battle.target.section}:${battle.target.keyName}:${battle.target.index}`;
            // Keep existing label if any; label is optional for visibility
            setBattleArrow((prev) => ({ fromKey, toKey, label: prev?.label || '' }));
        } else {
            // No battle: clear any attack preview and arrow
            setBattleArrow(null);
            setCurrentAttack(null);
        }
    }, [battle]);

    const confirmTargeting = useCallback(() => {
        if (!targeting.active) return;
        const { side, section, keyName, selectedIdx, selected, onComplete, multi } = targeting;
        let arr = [];
        try {
            if (multi) {
                arr = (selected || []).map(({ side: s, section: sec, keyName: kn, index }) => {
                    const isNested = !Array.isArray(areas[s]?.[sec]);
                    const cardsArr = isNested ? areas[s][sec][kn] : areas[s][sec];
                    return { side: s, section: sec, keyName: kn, index, card: cardsArr[index] };
                }).filter((x) => x.card);
            } else {
                const isNested = !Array.isArray(areas[side]?.[section]);
                const cardsArr = isNested ? areas[side][section][keyName] : areas[side][section];
                arr = selectedIdx.map((i) => ({ index: i, card: cardsArr[i] })).filter((x) => x.card);
            }
        } catch { }
        console.log('[targeting:confirm]', { sessionId: targeting.sessionId, count: arr.length, targets: arr });
        cancelTargeting();
        if (typeof onComplete === 'function') onComplete(arr);
    }, [targeting, areas, cancelTargeting]);

    // Auto-confirm single-selection targeting when a valid choice is made
    useEffect(() => {
        if (!targeting.active) return;
        const count = targeting.multi ? (targeting.selected || []).length : (targeting.selectedIdx || []).length;
        const min = typeof targeting.min === 'number' ? targeting.min : 1;
        const max = typeof targeting.max === 'number' ? targeting.max : 1;

        // Auto-confirm conditions:
        // - Standard: min > 0 and count >= min
        // - Optional single-target: min === 0 and count >= 1 (single-select)
        // - Optional multi-target: min === 0 and count reaches max (for convenience)
        const shouldAutoConfirm = (
            (min > 0 && count >= min) ||
            (min === 0 && !targeting.multi && count >= 1) ||
            (min === 0 && targeting.multi && count >= max)
        );

        if (shouldAutoConfirm) {
            // Defer to next tick to allow UI to update selection outline
            const t = setTimeout(() => {
                try { confirmTargeting(); } catch { }
            }, 0);
            return () => clearTimeout(t);
        }
    }, [targeting, confirmTargeting]);

    const getCardMeta = useCallback((id) => metaById.get(id) || null, [metaById]);

    // Helper to check if a keyword array contains a specific keyword (case-insensitive)
    const hasKeyword = useCallback((keywords, keyword) => {
        return (keywords || []).some(k => new RegExp(keyword, 'i').test(k));
    }, []);

    // Helper to check if battle is in a specific step
    const isBattleStep = useCallback((step) => battle && battle.step === step, [battle]);

    // Helper to check if game actions are allowed (opening hand must be finalized)
    const canPerformGameAction = useCallback(() => !openingShown, [openingShown]);

    // Helper to get the opposing side
    const getOpposingSide = useCallback((side) => side === 'player' ? 'opponent' : 'player', []);

    // --- Power Mod Overlays ---
    // Track power modifiers with explicit expiry side so we can clear correctly at Refresh Phase.
    // Structure: { [key]: Array<{ delta: number, expireOnSide: 'player'|'opponent'|null }> }
    const [powerMods, setPowerMods] = useState({});
    
    // --- Cost Mod Overlays ---
    // Track cost modifiers similarly to power mods (for cards like Uta ST23-001 that reduce their own cost)
    // Structure: { [key]: Array<{ delta: number, expireOnSide: 'player'|'opponent'|null }> }
    const [costMods, setCostMods] = useState({});
    
    const modKey = useCallback((side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`, []);

    // Track continuous effects that last "until start of your next turn" (for Refresh Phase cleanup)
    const [untilNextTurnEffects, setUntilNextTurnEffects] = useState({ player: [], opponent: [] });
    const getPowerMod = useCallback((side, section, keyName, index) => {
        const arr = powerMods[modKey(side, section, keyName, index)] || [];
        return Array.isArray(arr) ? arr.reduce((sum, m) => sum + (m?.delta || 0), 0) : (typeof arr === 'number' ? arr : 0);
    }, [powerMods, modKey]);
    const applyPowerMod = useCallback((side, section, keyName, index, delta, expireOnSide = null) => {
        setPowerMods((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            const list = Array.isArray(next[k]) ? [...next[k]] : [];
            list.push({ delta, expireOnSide: expireOnSide || null });
            next[k] = list;
            return next;
        });
    }, [modKey]);

    const getCostMod = useCallback((side, section, keyName, index) => {
        const arr = costMods[modKey(side, section, keyName, index)] || [];
        return Array.isArray(arr) ? arr.reduce((sum, m) => sum + (m?.delta || 0), 0) : (typeof arr === 'number' ? arr : 0);
    }, [costMods, modKey]);
    
    const applyCostMod = useCallback((side, section, keyName, index, delta, expireOnSide = null) => {
        setCostMods((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            const list = Array.isArray(next[k]) ? [...next[k]] : [];
            list.push({ delta, expireOnSide: expireOnSide || null });
            next[k] = list;
            return next;
        });
    }, [modKey]);

    // Helper to register effects that last "until the start of your next turn" (rule 6-2-1)
    const registerUntilNextTurnEffect = useCallback((side, effectDescription) => {
        setUntilNextTurnEffects((prev) => ({
            ...prev,
            [side]: [...(prev[side] || []), { description: effectDescription, timestamp: Date.now() }]
        }));
    }, []);

    // --- Temporary Keywords (e.g., grant Rush this turn) ---
    // Structure: { [key]: Array<{ keyword: string, expireOnSide: 'player'|'opponent'|null }> }
    const [tempKeywords, setTempKeywords] = useState({});
    const addTempKeyword = useCallback((side, section, keyName, index, keyword, expireOnSide = null) => {
        setTempKeywords((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            const list = Array.isArray(next[k]) ? [...next[k]] : [];
            list.push({ keyword, expireOnSide: expireOnSide || null });
            next[k] = list;
            return next;
        });
    }, [modKey]);
    const hasTempKeyword = useCallback((side, section, keyName, index, keyword) => {
        const k = modKey(side, section, keyName, index);
        const arr = tempKeywords[k] || [];
        return Array.isArray(arr) && arr.some((e) => String(e?.keyword || '').toLowerCase() === String(keyword || '').toLowerCase());
    }, [tempKeywords, modKey]);

    // --- Disabled Keywords (e.g., prevent Blocker activation this turn) ---
    // Structure: { [key]: Array<{ keyword: string, expireOnSide: 'player'|'opponent'|null }> }
    const [disabledKeywords, setDisabledKeywords] = useState({});
    const addDisabledKeyword = useCallback((side, section, keyName, index, keyword, expireOnSide = null) => {
        setDisabledKeywords((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            const list = Array.isArray(next[k]) ? [...next[k]] : [];
            list.push({ keyword, expireOnSide: expireOnSide || null });
            next[k] = list;
            return next;
        });
    }, [modKey]);
    const hasDisabledKeyword = useCallback((side, section, keyName, index, keyword) => {
        const k = modKey(side, section, keyName, index);
        const arr = disabledKeywords[k] || [];
        return Array.isArray(arr) && arr.some((e) => String(e?.keyword || '').toLowerCase() === String(keyword || '').toLowerCase());
    }, [disabledKeywords, modKey]);

    // Track Once Per Turn ability usage per card instance (rule 10-2-13)
    const [oncePerTurnUsage, setOncePerTurnUsage] = useState({});
    useEffect(() => {
        setOncePerTurnUsage({});
    }, [turnSide, turnNumber]);
    const markOncePerTurnUsed = useCallback((source, abilityIndex) => {
        if (!source || typeof abilityIndex !== 'number') return;
        const side = source.side || 'player';
        const section = source.section || 'char';
        const keyName = source.keyName || 'char';
        const index = typeof source.index === 'number' ? source.index : 0;
        const key = modKey(side, section, keyName, index);
        setOncePerTurnUsage((prev) => {
            const existing = prev[key] || {};
            if (existing[abilityIndex]) return prev;
            return {
                ...prev,
                [key]: { ...existing, [abilityIndex]: true }
            };
        });
    }, [modKey]);

    // Helper to check if two source objects represent the same card
    const sameOrigin = useCallback((a, b) => !!(a && b && a.side === b.side && a.section === b.section && a.keyName === b.keyName && a.index === b.index), []);

    const openCardAction = useCallback(async (card, index, source = null) => {
        // Block opening other action windows while a targeting session is active.
        if (targeting.active) {
            // Allow opening only for the origin card (to resume), regardless of suspended state
            if (!sameOrigin(source, targeting.origin)) return;
        }
        setActionCard(card);
        setActionCardIndex(index);
        setActionSource(source);
        setActionOpen(true);
        setSelectedCard(card); // Set the selected card in the viewer
    }, [targeting.active, targeting.origin, sameOrigin]);

    // Start DON!! giving mode - select a DON!! card from cost area
    const startDonGiving = useCallback((side, donIndex) => {
        if (!canPerformGameAction()) return; // Cannot give DON until opening hand is finalized
        if (side !== turnSide) {
            appendLog(`Cannot give DON: not ${side}'s turn.`);
            return;
        }

        if (phaseLower !== 'main') {
            appendLog('Cannot give DON: must be Main Phase.');
            return;
        }

        if (battle) {
            appendLog('Cannot give DON during battle.');
            return;
        }

        setDonGivingMode({
            active: true,
            side,
            selectedDonIndex: donIndex
        });
        appendLog(`[DON Select] Click a Leader or Character to give DON!!.`);
    }, [canPerformGameAction, turnSide, phaseLower, battle, appendLog]);

    // Cancel DON!! giving mode
    const cancelDonGiving = useCallback(() => {
        if (donGivingMode.active) {
            appendLog('[DON Select] Cancelled.');
        }
        setDonGivingMode({ active: false, side: null, selectedDonIndex: null });
    }, [donGivingMode.active, appendLog]);

    // Rule 6-5-5: Give DON!! Cards - complete the giving action
    const giveDonToCard = useCallback((side, targetSection, targetKeyName, targetIndex) => {
        if (!donGivingMode.active) {
            appendLog('[DON Select] Not in DON giving mode.');
            return false;
        }
        if (donGivingMode.side !== side) {
            appendLog(`[DON Select] Wrong side for giving (expected ${donGivingMode.side}, got ${side}).`);
            return false;
        }

        let success = false;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const costLoc = getHandCostLocationFromNext(next, side);
            const costArr = costLoc.cost || [];

            // Get the selected DON card
            if (donGivingMode.selectedDonIndex >= costArr.length) {
                appendLog('[DON Select] Selected DON index out of range.');
                return prev;
            }

            const donCard = costArr[donGivingMode.selectedDonIndex];
            if (!donCard) {
                appendLog('[DON Select] Selected DON not found.');
                return prev;
            }
            if (donCard.id !== 'DON') {
                appendLog('[DON Select] Selected card is not a DON.');
                return prev;
            }
            if (donCard.rested) {
                appendLog('[DON Select] Selected DON is already rested.');
                return prev;
            }

            // Remove DON from cost area and mark as rested
            const [removedDon] = costArr.splice(donGivingMode.selectedDonIndex, 1);
            const restedDon = { ...removedDon, rested: true };

            // Place DON underneath target card
            const sideLoc = getSideLocationFromNext(next, side);
            if (targetSection === 'middle' && targetKeyName === 'leader') {
                if (sideLoc.middle.leader[targetIndex]) {
                    if (!sideLoc.middle.leaderDon) sideLoc.middle.leaderDon = [];
                    sideLoc.middle.leaderDon.push(restedDon);
                    success = true;
                } else {
                    appendLog('[DON Select] Leader target missing.');
                }
            } else if (targetSection === 'char' && targetKeyName === 'char') {
                if (sideLoc.char && sideLoc.char[targetIndex]) {
                    if (!sideLoc.charDon) sideLoc.charDon = [];
                    while (sideLoc.charDon.length <= targetIndex) {
                        sideLoc.charDon.push([]);
                    }
                    sideLoc.charDon[targetIndex].push(restedDon);
                    success = true;
                } else {
                    appendLog(`[DON Select] Character target #${targetIndex + 1} missing.`);
                }
            } else {
                appendLog('[DON Select] Invalid target area.');
            }

            return next;
        });

        if (success) {
            const targetName = targetSection === 'middle' ? 'Leader' : `Character #${targetIndex + 1}`;
            appendLog(`[${side}] Gave 1 DON!! to ${targetName}.`);
        }

        // Reset DON giving mode
        setDonGivingMode({ active: false, side: null, selectedDonIndex: null });

        return success;
    }, [donGivingMode, appendLog]);

    // Move DON!! from cost area to a card (for ability effects, bypasses donGivingMode)
    const moveDonFromCostToCard = useCallback((controllerSide, targetSide, targetSection, targetKeyName, targetIndex, quantity = 1, onlyRested = true) => {
        let success = false;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const costLoc = getHandCostLocationFromNext(next, controllerSide);
            const sourceCostArr = costLoc.cost || [];
            
            // Find and remove DON!! from cost area
            const donToMove = [];
            for (let i = 0; i < quantity && donToMove.length < quantity; i++) {
                const donIndex = sourceCostArr.findIndex(d => d.id === 'DON' && (onlyRested ? d.rested : true));
                if (donIndex >= 0) {
                    const [don] = sourceCostArr.splice(donIndex, 1);
                    donToMove.push(don);
                }
            }
            
            if (donToMove.length === 0) {
                appendLog('[giveDon] No DON!! found to move');
                return prev;
            }
            
            // Add DON!! to target location
            const targetSideLoc = getSideLocationFromNext(next, targetSide);
            if (targetSection === 'middle' && targetKeyName === 'leader') {
                targetSideLoc.middle.leaderDon = [...(targetSideLoc.middle.leaderDon || []), ...donToMove];
                appendLog(`[giveDon] Moved ${donToMove.length} DON!! to ${targetSide} leader`);
                success = true;
            } else if (targetSection === 'char' && targetKeyName === 'char') {
                if (!targetSideLoc.charDon[targetIndex]) {
                    targetSideLoc.charDon[targetIndex] = [];
                }
                targetSideLoc.charDon[targetIndex] = [...targetSideLoc.charDon[targetIndex], ...donToMove];
                appendLog(`[giveDon] Moved ${donToMove.length} DON!! to ${targetSide} character at index ${targetIndex}`);
                success = true;
            }
            
            return next;
        });
        
        return success;
    }, [appendLog]);

    // Rule 4-6-3 & 10-1-5: [Trigger] can be activated instead of adding Life card to hand
    const dealOneDamageToLeader = useCallback((defender) => {
        let cardWithTrigger = null;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const side = getSideLocationFromNext(next, defender);
            const life = side.life || [];
            if (!life.length) {
                // Rule 1-2-1-1-1: Taking damage with 0 Life = defeat condition
                appendLog(`[DEFEAT] ${defender} has 0 Life and took damage!`);
                return next;
            }
            const card = life[life.length - 1];
            side.life = life.slice(0, -1);

            // Check if card has [Trigger] keyword
            const keywords = metaById.get(card.id)?.keywords || [];
            const hasTrigger = hasKeyword(keywords, 'trigger');

            if (hasTrigger) {
                // Pause and show trigger choice modal
                cardWithTrigger = { side: defender, card, hasTrigger: true };
            } else {
                // No trigger: add to hand as normal
                const handLoc = getHandCostLocationFromNext(next, defender);
                handLoc.hand = [...(handLoc.hand || []), card];
                appendLog(`[Damage] ${defender} takes 1 damage, adds ${card.id} to hand.`);
            }
            return next;
        });

        // If trigger detected, pause for player choice
        if (cardWithTrigger) {
            setTriggerPending(cardWithTrigger);
        }
    }, [metaById, appendLog, hasKeyword]);

    // Handle player's choice to activate [Trigger] or add to hand
    const onTriggerActivate = useCallback(() => {
        if (!triggerPending) return;
        const { side, card } = triggerPending;
        appendLog(`[Trigger] ${side} activates [Trigger] on ${card.id}!`);
        // TODO: Actually resolve the trigger effect (needs effect activation system)
        // For now, trash the card as per Rule 10-1-5-3
        setAreas((prev) => {
            const next = structuredClone(prev);
            const trashLoc = getHandCostLocationFromNext(next, side);
            trashLoc.trash = [...(trashLoc.trash || []), card];
            return next;
        });
        setTriggerPending(null);
    }, [triggerPending, appendLog]);

    const onTriggerDecline = useCallback(() => {
        if (!triggerPending) return;
        const { side, card } = triggerPending;
        appendLog(`[Damage] ${side} takes 1 damage, adds ${card.id} to hand (declined trigger).`);
        // Add to hand instead
        setAreas((prev) => {
            const next = structuredClone(prev);
            const handLoc = getHandCostLocationFromNext(next, side);
            handLoc.hand = [...(handLoc.hand || []), card];
            return next;
        });
        setTriggerPending(null);
    }, [triggerPending, appendLog]);

    const getKeywordsFor = useCallback((id) => {
        return metaById.get(id)?.keywords || [];
    }, [metaById]);

    // Replacement effect: If this card would be removed by opponent's effect, give it -2000 instead (Once Per Turn)
    const maybeApplyRemovalReplacement = useCallback((targetSide, section, keyName, index, sourceSide) => {
        try {
            // Only applies when the source is the opponent of the target controller
            if (!targetSide || !sourceSide || targetSide === sourceSide) return false;
            // Only applies to fielded Leader/Character
            if (!((section === 'char' && keyName === 'char') || (section === 'middle' && keyName === 'leader'))) return false;
            const sideLoc = getSideLocation(targetSide);
            const inst = section === 'char' ? (sideLoc?.char?.[index]) : (sideLoc?.middle?.leader?.[0]);
            if (!inst || !inst.id) return false;
            const meta = metaById.get(inst.id);
            if (!meta) return false;
            const abilities = meta.abilities || [];
            // Heuristic: find a Continuous, Once Per Turn ability whose text mentions removal by opponent's effect
            const hasReplacement = abilities.some((ab) => {
                if ((ab?.type !== 'Continuous') || (String(ab?.frequency || '').toLowerCase() !== 'once per turn')) return false;
                const t = (typeof ab.effect === 'string' ? ab.effect : (ab.effect?.text || '')).toLowerCase();
                return t.includes('would be removed from the field') && t.includes("opponent") && t.includes('-2000');
            });
            if (!hasReplacement) return false;
            // Once per turn usage check; mark on instance
            const usedTurnProp = '__replacementUsedTurn';
            if (inst[usedTurnProp] === turnNumber) return false;
            // Apply -2000 this turn to self and mark used
            const expireOnSide = (turnSide === 'player') ? 'opponent' : 'player';
            const instIndex = section === 'char' ? index : 0;
            applyPowerMod(targetSide, section, keyName, instIndex, -2000, expireOnSide);
            if (registerUntilNextTurnEffect) {
                registerUntilNextTurnEffect(expireOnSide, `${meta.name || inst.id}: replacement -2000 applied instead of removal`);
            }
            // Persist the flag on areas
            setAreas((prev) => {
                const next = structuredClone(prev);
                const loc = getSideLocationFromNext(next, targetSide);
                if (section === 'char' && loc?.char?.[instIndex]) {
                    loc.char[instIndex][usedTurnProp] = turnNumber;
                } else if (section === 'middle' && loc?.middle?.leader?.[0]) {
                    loc.middle.leader[0][usedTurnProp] = turnNumber;
                }
                return next;
            });
            appendLog(`[Replacement] ${meta.name || inst.id}: Prevented removal by opponent's effect; -2000 this turn.`);
            return true;
        } catch (e) {
            console.warn('[maybeApplyRemovalReplacement] error', e);
            return false;
        }
    }, [areas, metaById, applyPowerMod, registerUntilNextTurnEffect, setAreas, appendLog, turnSide, turnNumber]);

    // Generic effect-based removal (e.g., KO by effect). Supports replacement interception.
    const removeCardByEffect = useCallback((targetSide, section, keyName, index, sourceSide) => {
        // Check replacement first; if applied, skip removal
        const replaced = maybeApplyRemovalReplacement(targetSide, section, keyName, index, sourceSide);
        if (replaced) return false;

        // Proceed to remove the card from the field and move to trash; return given DON!!
        setAreas((prev) => {
            const next = structuredClone(prev);
            const sideLoc = getSideLocationFromNext(next, targetSide);
            const trashLoc = getHandCostLocationFromNext(next, targetSide);

            if (section === 'char' && keyName === 'char') {
                const charArr = sideLoc?.char || [];
                if (!charArr[index]) return prev;
                const removed = charArr.splice(index, 1)[0];
                // Return any given DON!! to cost area (rested)
                const donUnderArr = (sideLoc?.charDon?.[index] || []);
                if (donUnderArr.length) {
                    const costLoc = getHandCostLocationFromNext(next, targetSide);
                    costLoc.cost = [...(costLoc.cost || []), ...donUnderArr];
                    appendLog(`[Effect KO] Returned ${donUnderArr.length} DON!! to cost area.`);
                }
                if (Array.isArray(sideLoc.charDon)) {
                    sideLoc.charDon.splice(index, 1);
                }
                // Move removed to trash
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] ${removed.id} was removed by effect.`);
            } else if (section === 'middle' && keyName === 'leader') {
                // Leaders are rarely removed by effects; handle generically -> move to trash
                const leaderArr = sideLoc?.middle?.leader || [];
                if (!leaderArr[0]) return prev;
                const removed = leaderArr.splice(0, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                // Return leader DON!! to cost area
                const leaderDon = sideLoc?.middle?.leaderDon || [];
                if (leaderDon.length) {
                    const costLoc = getHandCostLocationFromNext(next, targetSide);
                    costLoc.cost = [...(costLoc.cost || []), ...leaderDon];
                    sideLoc.middle.leaderDon = [];
                    appendLog(`[Effect KO] Returned ${leaderDon.length} DON!! from leader to cost area.`);
                }
                appendLog(`[Effect KO] Leader ${removed.id} was removed by effect.`);
            } else if ((section === 'bottom' || section === 'top') && keyName === 'hand') {
                // Trash card from hand (used for trashFromHand action)
                const handLoc = targetSide === 'player' ? next.player?.bottom : next.opponent?.top;
                const hand = handLoc?.hand || [];
                if (!hand[index]) return prev;
                const removed = hand.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Ability Cost] Trashed ${removed.id} from hand.`);
            }
            return next;
        });
        return true;
    }, [maybeApplyRemovalReplacement, setAreas, appendLog]);

    const canCharacterAttack = useCallback((card, side, index) => {
        if (!card || !card.id) return false;
        // RULE ENFORCEMENT: Can only attack during your own turn (7-1)
        if (side !== turnSide) return false;
        if (phaseLower !== 'main') return false;

        // Must be active (not rested)
        // Use field instance (may contain enteredTurn) rather than transient actionCard copy
        const fieldArr = getCharArray(side);
        const fieldInst = fieldArr[index];
        const rested = fieldInst ? fieldInst.rested : card.rested;
        if (rested) return false;

        // Check for [Rush] keyword (Rule 10-1-1) including temporary grants
        const rushStatic = hasKeyword(getKeywordsFor(card.id), 'rush');
        const rushTemp = hasTempKeyword(side, 'char', 'char', index, 'Rush');
        const rush = rushStatic || rushTemp;

        // RULE 6-5-6-1: Neither player can battle on their first turn
        // Turn 1 = first player's first turn, Turn 2 = second player's first turn
        // EXCEPTION: [Rush] keyword allows attacking on Turn 1/2 (Rule 10-1-1-1)
        if (turnNumber <= 2 && !rush) return false;

        // Rule 3-7-4: Cards cannot attack on the turn they are played (unless [Rush])
        const enteredTurnVal = fieldInst ? fieldInst.enteredTurn : card.enteredTurn;
        if (typeof enteredTurnVal === 'number' && enteredTurnVal === turnNumber && !rush) return false;

        return true;
    }, [turnSide, phaseLower, turnNumber, hasKeyword, getKeywordsFor, getCharArray, hasTempKeyword]);

    const canLeaderAttack = useCallback((card, side) => {
        if (!card || !card.id) return false;
        // RULE ENFORCEMENT: Can only attack during your own turn (7-1)
        if (side !== turnSide) return false;
        if (phaseLower !== 'main') return false;

        // Must be active (not rested)
        const leaderArr = getLeaderArray(side);
        const leaderCard = leaderArr[0];
        if (!leaderCard) return false;
        const rested = leaderCard.rested || false;
        if (rested) return false;

        // RULE 6-5-6-1: Neither player can battle on their first turn
        if (turnNumber <= 2) return false;

        return true;
    }, [turnSide, phaseLower, turnNumber, getLeaderArray]);

    const getBasePower = useCallback((id) => {
        return metaById.get(id)?.stats?.power || 0;
    }, [metaById]);

    // Compute static "aura" modifiers from Continuous abilities that grant powerMod to matching targets.
    const getAuraPowerMod = useCallback((targetSide, section, keyName, index) => {
        try {
            const appliesToLeader = (section === 'middle' && keyName === 'leader');
            const appliesToChar = (section === 'char' && keyName === 'char');
            if (!appliesToLeader && !appliesToChar) return 0;

            // Resolve relative targetSide from a source controller perspective
            const resolveFrom = (controllerSide, relative) => {
                if (relative === 'both') return 'both';
                if (relative === 'opponent') return controllerSide === 'player' ? 'opponent' : 'player';
                return controllerSide; // 'player'
            };

            let sum = 0;
            const sides = ['player', 'opponent'];
            for (const srcSide of sides) {
                const srcLoc = getSideLocation(srcSide);
                if (!srcLoc) continue;

                // Leaders as sources
                const leaderInst = srcLoc?.middle?.leader?.[0];
                if (leaderInst && leaderInst.id) {
                    const meta = metaById.get(leaderInst.id);
                    const abilities = meta?.abilities || [];
                    for (const ab of abilities) {
                        if (ab?.type !== 'Continuous') continue;
                        const actions = (ab.effect && typeof ab.effect === 'object') ? (ab.effect.actions || []) : [];
                        for (const action of actions) {
                            if (action?.type !== 'powerMod') continue;
                            // Require explicit aura mode if present; backward-compatible: treat missing mode as aura only if Continuous with target info and no min/max
                            if (action.mode && action.mode !== 'aura') continue;
                            const actualSide = resolveFrom(srcSide, action.targetSide || 'player');
                            if (!(actualSide === 'both' || actualSide === targetSide)) continue;
                            const tType = action.targetType || 'any';
                            const leaderOk = (tType === 'leader' || tType === 'any');
                            const charOk = (tType === 'character' || tType === 'any');
                            if ((appliesToLeader && leaderOk) || (appliesToChar && charOk)) {
                                sum += action.amount || 0;
                            }
                        }
                    }
                }

                // Characters as sources
                const chars = srcLoc?.char || [];
                for (let i = 0; i < chars.length; i++) {
                    const inst = chars[i];
                    if (!inst || !inst.id) continue;
                    const meta = metaById.get(inst.id);
                    const abilities = meta?.abilities || [];
                    for (const ab of abilities) {
                        if (ab?.type !== 'Continuous') continue;
                        const actions = (ab.effect && typeof ab.effect === 'object') ? (ab.effect.actions || []) : [];
                        for (const action of actions) {
                            if (action?.type !== 'powerMod') continue;
                            if (action.mode && action.mode !== 'aura') continue;
                            const actualSide = resolveFrom(srcSide, action.targetSide || 'player');
                            if (!(actualSide === 'both' || actualSide === targetSide)) continue;
                            const tType = action.targetType || 'any';
                            const leaderOk = (tType === 'leader' || tType === 'any');
                            const charOk = (tType === 'character' || tType === 'any');
                            if ((appliesToLeader && leaderOk) || (appliesToChar && charOk)) {
                                sum += action.amount || 0;
                            }
                        }
                    }
                }
            }
            return sum;
        } catch {
            return 0;
        }
    }, [areas, metaById]);

    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        const base = getBasePower(id);
        const mod = getPowerMod(side, section, keyName, index) || 0;

        // Continuous aura modifiers from on-field Continuous abilities (e.g., OP09-004 Shanks)
        const aura = getAuraPowerMod(side, section, keyName, index) || 0;

        // Rule 6-5-5-2: Leaders and Characters gain +1000 power per given DON during your turn
        let donBonus = 0;
        if (side === turnSide) {
            try {
                const sideLoc = getSideLocation(side);
                if (section === 'middle' && keyName === 'leader') {
                    const leaderDonArr = sideLoc?.middle?.leaderDon || [];
                    donBonus = leaderDonArr.length * 1000;
                } else if (section === 'char' && keyName === 'char') {
                    const charDonArr = sideLoc?.charDon?.[index] || [];
                    donBonus = charDonArr.length * 1000;
                }
            } catch (e) {
                // Ignore errors during power calculation
            }
        }

        return base + mod + aura + donBonus;
    }, [getBasePower, getPowerMod, getAuraPowerMod, turnSide, areas]);

    // Compute cost modifications from Continuous abilities that apply to cards in hand
    const getAuraCostMod = useCallback((cardId, side, section, keyName, index) => {
        try {
            // Only apply to cards in hand
            const isInHand = (section === 'bottom' || section === 'top') && keyName === 'hand';
            if (!isInHand) return 0;

            const meta = metaById.get(cardId);
            if (!meta) {
                console.debug('[getAuraCostMod] no meta for', cardId);
                return 0;
            }
            const abilities = meta?.abilities || [];

            let sum = 0;
            console.debug('[getAuraCostMod] evaluating', { cardId, side, section, keyName, index, abilities: abilities.length });
            for (const ab of abilities) {
                if (ab?.type !== 'Continuous') continue;
                const actions = (ab.effect && typeof ab.effect === 'object') ? (ab.effect.actions || []) : [];
                if (!actions.length) continue;
                console.debug('[getAuraCostMod] found Continuous ability with actions', { cardId, actionsCount: actions.length });

                for (const action of actions) {
                    if (action?.type !== 'costMod') continue;
                    if (!action.appliesToHand) continue; // Must explicitly apply to hand
                    if (!action.targetSelf) continue; // Must target self
                    console.debug('[getAuraCostMod] considering action', { cardId, action });

                    // Check condition if present
                    const condition = ab.condition || {};
                    let conditionMet = true;
                    if (condition.allyCharacterPower) {
                        // Check if you have a Character with >= specified power
                        const sideLoc = getSideLocation(side);
                        const chars = sideLoc?.char || [];
                        let hasPowerfulChar = false;
                        for (let i = 0; i < chars.length; i++) {
                            const c = chars[i];
                            if (!c || !c.id) continue;
                            const totalPower = getTotalPower(side, 'char', 'char', i, c.id);
                            if (totalPower >= condition.allyCharacterPower) {
                                hasPowerfulChar = true;
                                break;
                            }
                        }
                        console.debug('[getAuraCostMod] condition allyCharacterPower', { cardId, required: condition.allyCharacterPower, found: hasPowerfulChar });
                        if (!hasPowerfulChar) conditionMet = false;
                    }

                    if (conditionMet) {
                        sum += action.amount || 0;
                        console.debug('[getAuraCostMod] applied amount', { cardId, amount: action.amount, runningSum: sum });
                    }
                }
            }

            console.debug('[getAuraCostMod] final sum for', cardId, sum);
            return sum;
        } catch {
            return 0;
        }
    }, [metaById, areas, getTotalPower]);

    const getCardCost = useCallback((id, side = null, section = null, keyName = null, index = null) => {
        if (!id) return 0;
        const meta = metaById.get(id);
        const baseCost = meta?.stats?.cost;
        const cost = typeof baseCost === 'number' && baseCost > 0 ? baseCost : 0;
        
        // Apply cost modifications if location is provided
        if (side !== null && section !== null && keyName !== null && index !== null) {
            const arr = costMods[modKey(side, section, keyName, index)] || [];
            const mod = Array.isArray(arr) ? arr.reduce((sum, m) => sum + (m?.delta || 0), 0) : 0;
            
            // Also check for continuous cost mod abilities (e.g., Uta ST23-001)
            const auraMod = getAuraCostMod(id, side, section, keyName, index);
            
            return Math.max(0, cost + mod + auraMod); // Cost can't go below 0
        }
        
        return cost;
    }, [metaById, costMods, modKey, getAuraCostMod]);

    const playSelectedCard = useCallback(() => {
        if (!canPerformGameAction()) return; // Cannot play cards until opening hand is finalized
        if (!actionCard) return;
        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        // Enforce timing: only during your Main and no battle
        if (!canPlayNow(side)) return;

        // RULE ENFORCEMENT: Only the turn player can play cards (6-5-3)
        if (side !== turnSide) {
            appendLog(`Cannot play ${actionCard.id}: not ${side}'s turn.`);
            return;
        }

        // Calculate cost with modifications (cards in hand can have cost reductions)
        const section = actionSource?.section || 'bottom';
        const keyName = actionSource?.keyName || 'hand';
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = getCardCost(actionCard.id, side, section, keyName, index);
        
        if (!hasEnoughDonFor(side, cost)) {
            appendLog(`Cannot play ${actionCard.id}: need ${cost} DON (${side}).`);
            return;
        }
        let fieldIndex = -1;
        setAreas((prev) => {
            const next = structuredClone(prev);
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
        // Mark with special flag to indicate this was just played (for auto On Play triggering)
        setTimeout(() => {
            // Get the placed card from the updated areas state to ensure it has enteredTurn
            setAreas((currentAreas) => {
                const isPlayer = side === 'player';
                const chars = isPlayer ? (currentAreas.player.char || []) : (currentAreas.opponent.char || []);
                const placedCard = chars[fieldIndex];
                if (placedCard) {
                    openCardAction(placedCard, fieldIndex, { side, section: 'char', keyName: 'char', index: fieldIndex, justPlayed: true });
                }
                return currentAreas; // Don't modify areas, just read from it
            });
        }, 0);
    }, [actionCard, canPlayNow, actionCardIndex, getCardCost, hasEnoughDonFor, appendLog, openCardAction, actionSource, turnNumber, openingShown, canPerformGameAction, turnSide, setAreas]);

    const beginAttackForLeader = useCallback((leaderCard, attackingSide = 'player') => {
        if (!canPerformGameAction()) return; // Cannot attack until opening hand is finalized
        if (battle) return; // Only one battle at a time
        if (!canLeaderAttack(leaderCard, attackingSide)) return;

        // Cancel any active DON giving mode
        cancelDonGiving();

        const defendingSide = getOpposingSide(attackingSide);
        const attackerKey = modKey(attackingSide, 'middle', 'leader', 0);
        const attackerPower = getTotalPower(attackingSide, 'middle', 'leader', 0, leaderCard.id);
        setCurrentAttack({ key: attackerKey, cardId: leaderCard.id, index: 0, power: attackerPower, isLeader: true });
        appendLog(`[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"} Leader declares attack (power ${attackerPower}). Choose ${getOpposingSide(defendingSide)} Leader or a rested Character.`);
        // Target selection phase (Attack Step target declaration)
        startTargeting({
            side: defendingSide,
            multi: true,
            min: 1,
            max: 1,
            validator: (card, ctx) => {
                if (!ctx) return false;
                if (ctx.section === 'middle' && ctx.keyName === 'leader') return true;
                if (ctx.section === 'char' && ctx.keyName === 'char') return !!card?.rested;
                return false;
            },
            origin: { side: attackingSide, section: 'middle', keyName: 'leader', index: 0 },
            abilityIndex: null,
            type: 'attack'
        }, (targets) => {
            const t = (targets || [])[0];
            if (!t) { setCurrentAttack(null); return; }
            // Rest leader immediately when attack declared (7-1-1-1)
            setAreas((prev) => {
                const next = structuredClone(prev);
                if (next[attackingSide]?.middle?.leader?.[0]) next[attackingSide].middle.leader[0].rested = true;
                return next;
            });
            const targetArr = (t.section === 'char') ? (areas?.[defendingSide]?.char || []) : (areas?.[defendingSide]?.middle?.leader || []);
            const targetCard = targetArr[t.index];
            if (!targetCard) { appendLog('[attack] Target not found.'); setCurrentAttack(null); return; }
            // Close action window when attack is initiated
            closeActionPanel();
            // Initialize battle state
            setBattle({
                attacker: { side: attackingSide, section: 'middle', keyName: 'leader', index: 0, id: leaderCard.id, power: attackerPower },
                target: { side: defendingSide, section: t.section, keyName: t.keyName, index: t.index, id: targetCard.id },
                step: 'attack',
                blockerUsed: false,
                counterPower: 0,
                counterTarget: null
            });
        });
    }, [battle, canLeaderAttack, getTotalPower, startTargeting, setAreas, appendLog, areas, cancelDonGiving, modKey, setBattle, setCurrentAttack, openingShown]);

    const beginAttackForCard = useCallback((attackerCard, attackerIndex, attackingSide = 'player') => {
        if (!canPerformGameAction()) return; // Cannot attack until opening hand is finalized
        if (battle) return; // Only one battle at a time
        if (!canCharacterAttack(attackerCard, attackingSide, attackerIndex)) return;

        // Cancel any active DON giving mode
        cancelDonGiving();

        const defendingSide = getOpposingSide(attackingSide);
        const attackerKey = modKey(attackingSide, 'char', 'char', attackerIndex);
        const attackerPower = getTotalPower(attackingSide, 'char', 'char', attackerIndex, attackerCard.id);
        setCurrentAttack({ key: attackerKey, cardId: attackerCard.id, index: attackerIndex, power: attackerPower });
        appendLog(`[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"} ${attackerCard.id} declares attack (power ${attackerPower}). Choose ${getOpposingSide(defendingSide)} Leader or a rested Character.`);
        // Target selection phase (Attack Step target declaration)
        startTargeting({
            side: defendingSide,
            multi: true,
            min: 1,
            max: 1,
            validator: (card, ctx) => {
                if (!ctx) return false;
                if (ctx.section === 'middle' && ctx.keyName === 'leader') return true;
                if (ctx.section === 'char' && ctx.keyName === 'char') return !!card?.rested;
                return false;
            },
            origin: { side: attackingSide, section: 'char', keyName: 'char', index: attackerIndex },
            abilityIndex: null,
            type: 'attack'
        }, (targets) => {
            const t = (targets || [])[0];
            if (!t) { setCurrentAttack(null); return; }
            // Rest attacker immediately when attack declared (7-1-1-1)
            setAreas((prev) => {
                const next = structuredClone(prev);
                if (next[attackingSide]?.char?.[attackerIndex]) next[attackingSide].char[attackerIndex].rested = true;
                return next;
            });
            const targetArr = (t.section === 'char') ? (areas?.[defendingSide]?.char || []) : (areas?.[defendingSide]?.middle?.leader || []);
            const targetCard = targetArr[t.index];
            if (!targetCard) { appendLog('[attack] Target not found.'); setCurrentAttack(null); return; }
            // Close action window when attack is initiated
            closeActionPanel();
            // Initialize battle state
            setBattle({
                attacker: { side: attackingSide, section: 'char', keyName: 'char', index: attackerIndex, id: attackerCard.id, power: attackerPower },
                target: { side: defendingSide, section: t.section, keyName: t.keyName, index: t.index, id: targetCard.id },
                step: 'attack',
                blockerUsed: false,
                counterPower: 0,
                counterTarget: null
            });
        });
    }, [battle, canCharacterAttack, getTotalPower, startTargeting, setAreas, appendLog, areas, cancelDonGiving, modKey, setBattle, setCurrentAttack, openingShown]);

    // Auto-advance from Attack Step to Block Step (original flow)
    useEffect(() => {
        if (!battle) return;
        if (battle.step === 'attack') {
            appendLog('[battle] Attack Step complete. Proceed to Block Step.');
            cancelTargeting(); // Clear any lingering targeting state
            setBattle((b) => ({ ...b, step: 'block' }));
        }
    }, [battle, appendLog, cancelTargeting]);

    const getDefenderPower = useCallback((b) => {
        if (!b) return 0;
        const basePower = getTotalPower(b.target.side, b.target.section, b.target.keyName, b.target.index, b.target.id);
        // Rule 7-1-3-2-1: Counter power applies only if this card is the counterTarget
        const isCounterTarget = b.counterTarget &&
            b.counterTarget.side === b.target.side &&
            b.counterTarget.section === b.target.section &&
            b.counterTarget.keyName === b.target.keyName &&
            b.counterTarget.index === b.target.index;
        return basePower + (isCounterTarget ? (b.counterPower || 0) : 0);
    }, [getTotalPower]);

    // Use live attacker power at calculation time (accounts for buffs/debuffs applied after declaration)
    const getAttackerPower = useCallback((b) => {
        if (!b) return 0;
        return getTotalPower(b.attacker.side, b.attacker.section, b.attacker.keyName, b.attacker.index, b.attacker.id);
    }, [getTotalPower]);

    const getBattleStatus = useCallback(() => {
        if (!battle) return null;
        const atk = getAttackerPower(battle);
        const def = getDefenderPower(battle);
        // Rule 7-1-4-1: Attacker wins if atk >= def, so defender needs def > atk to survive
        // This means defender needs at least (atk - def + 1000) more power
        const needed = Math.max(0, atk - def + 1000);
        return { atk, def, needed, safe: def > atk };
    }, [battle, getDefenderPower, getAttackerPower]);

    const applyBlocker = useCallback((blockerIndex) => {
        if (!isBattleStep('block')) return;
        // Determine defending side from current target
        const defendingSide = battle.target?.side || 'opponent';
        const chars = getCharArray(defendingSide);
        const card = chars[blockerIndex];
        if (!card) return;
        // Must have [Blocker] and be active
        const hasBlocker = hasKeyword(getKeywordsFor(card.id), 'blocker');
        if (!hasBlocker) return;
        if (card.rested) return; // must be active
        // Check if Blocker keyword is disabled on this card
        const blockerDisabled = hasDisabledKeyword(defendingSide, 'char', 'char', blockerIndex, 'Blocker');
        if (blockerDisabled) {
            appendLog(`[battle] ${card.id} cannot activate [Blocker] (disabled by effect).`);
            return;
        }
        // Rest blocker and make it new target
        setAreas((prev) => {
            const next = structuredClone(prev);
            const loc = getSideLocationFromNext(next, defendingSide);
            if (loc?.char?.[blockerIndex]) loc.char[blockerIndex].rested = true;
            return next;
        });
        appendLog(`[battle] Blocker ${card.id} rests to block.`);
        setBattle((b) => {
            // If counters were already applied during Block Step, shift their target to the blocker.
            const newTarget = { side: defendingSide, section: 'char', keyName: 'char', index: blockerIndex, id: card.id };
            const counterTarget = (b.counterPower && b.counterPower > 0) ? newTarget : b.counterTarget;
            return {
                ...b,
                target: newTarget,
                blockerUsed: true,
                step: 'counter',
                counterTarget
            };
        });
    }, [isBattleStep, battle, hasKeyword, getCharArray, getKeywordsFor, hasDisabledKeyword, appendLog, setAreas]);

    const skipBlock = useCallback(() => {
        if (!isBattleStep('block')) return;
        appendLog('[battle] No blocker used. Proceed to Counter Step.');
        setBattle((b) => ({ ...b, step: 'counter' }));
    }, [isBattleStep, appendLog]);

    const addCounterFromHand = useCallback((handIndex) => {
        // Allow using counters in both Block and Counter steps (UI convenience).
        if (!(isBattleStep('counter') || isBattleStep('block'))) return;
        // Get card from defending side's hand
        const defendingSide = battle.target.side;
        const handLoc = getHandCostLocation(defendingSide);
        const card = handLoc?.hand?.[handIndex];
        if (!card) return;
        const meta = metaById.get(card.id);
        const counterVal = meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0;
        if (!counterVal) return;

        // Counter automatically applies to the card being attacked (battle.target)
        setAreas((prev) => {
            const next = structuredClone(prev);
            const handLoc = defendingSide === 'player' ? next.player?.bottom : next.opponent?.top;
            const hand = handLoc?.hand || [];
            // Move card to trash (cost of counter)
            hand.splice(handIndex, 1);
            handLoc.hand = hand;
            const trashArr = handLoc?.trash || [];
            handLoc.trash = [...trashArr, card];
            return next;
        });

        // Apply temporary counter power to the current target.
        setBattle((b) => ({
            ...b,
            counterPower: (b.counterPower || 0) + counterVal,
            counterTarget: {
                side: battle.target.side,
                section: battle.target.section,
                keyName: battle.target.keyName,
                index: battle.target.index
            },
            // If we are still in Block Step and no blocker chosen yet, remain in block; defender can still choose a blocker.
            step: b.step === 'block' && !b.blockerUsed ? 'block' : b.step
        }));

        const targetName = battle.target.section === 'middle' ? 'Leader' : areas?.[battle.target.side]?.char?.[battle.target.index]?.id || 'Character';
        appendLog(`[battle] Counter applied: ${card.id} +${counterVal} to ${targetName}.`);

        // Close action panel after counter is applied
        closeActionPanel();
    }, [isBattleStep, battle, metaById, appendLog, setAreas, areas, closeActionPanel]);

    // Play an Event Counter card from defending side's hand during Counter Step
    const playCounterEventFromHand = useCallback((handIndex) => {
        if (!isBattleStep('counter')) return;
        const defendingSide = battle.target.side;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const handLoc = defendingSide === 'player' ? next.player?.bottom : next.opponent?.top;
            const hand = handLoc?.hand || [];
            const card = hand[handIndex];
            if (!card) return prev;
            const meta = metaById.get(card.id);
            if (!meta) return prev;
            const isEvent = meta.category === 'Event';
            const hasCounterKeyword = hasKeyword(meta.keywords, 'counter');
            if (!isEvent || !hasCounterKeyword) return prev;
            const cost = meta?.stats?.cost || 0;
            const costArr = handLoc?.cost || [];
            const activeDon = costArr.filter(d => d.id === 'DON' && !d.rested);
            if (activeDon.length < cost) return prev; // cannot pay
            let toRest = cost;
            for (let i = 0; i < costArr.length && toRest > 0; i++) {
                const d = costArr[i];
                if (d.id === 'DON' && !d.rested) { d.rested = true; toRest--; }
            }
            // Trash the event card
            hand.splice(handIndex, 1);
            handLoc.hand = hand;
            const trashArr = handLoc?.trash || [];
            handLoc.trash = [...trashArr, card];
            appendLog(`[battle] Event Counter activated: ${card.id} (cost ${cost}).`);
            return next;
        });
    }, [isBattleStep, battle, hasKeyword, metaById, appendLog, setAreas]);

    const endCounterStep = useCallback(() => {
        if (!isBattleStep('counter')) return;
        appendLog('[battle] Counter Step complete. Proceed to Damage Step.');
        setBattle((b) => ({ ...b, step: 'damage' }));
    }, [isBattleStep, appendLog]);

    const resolveDamage = useCallback(() => {
        if (!isBattleStep('damage')) return;
        const atkPower = getAttackerPower(battle);
        const defPower = getDefenderPower(battle);
        const targetIsLeader = battle.target.section === 'middle' && battle.target.keyName === 'leader';
        appendLog(`[battle] Damage Step: Attacker ${battle.attacker.id} ${atkPower} vs Defender ${battle.target.id} ${defPower}.`);
        if (atkPower >= defPower) {
            if (targetIsLeader) {
                appendLog('[result] Leader takes 1 damage.');
                dealOneDamageToLeader(battle.target.side);
            } else {
                // KO character - Rule 6-5-5-4: Return given DON!! to cost area when card moves
                const defendingSide = battle.target.side;
                setAreas((prev) => {
                    const next = structuredClone(prev);
                    const sideLoc = getSideLocationFromNext(next, defendingSide);
                    const charArr = sideLoc.char || [];
                    const charDonArr = sideLoc.charDon || [];
                    const removed = charArr.splice(battle.target.index, 1)[0];

                    // Return given DON!! to cost area as rested (they're already rested)
                    const donUnder = charDonArr[battle.target.index] || [];
                    if (donUnder.length > 0) {
                        const costLoc = getHandCostLocationFromNext(next, defendingSide);
                        costLoc.cost = [...(costLoc.cost || []), ...donUnder];
                        appendLog(`[K.O.] Returned ${donUnder.length} DON!! to cost area.`);
                    }

                    // Remove character and its DON
                    charDonArr.splice(battle.target.index, 1);
                    sideLoc.char = charArr;
                    sideLoc.charDon = charDonArr;

                    const trashLoc = getHandCostLocationFromNext(next, defendingSide);
                    const trashArr = trashLoc?.trash || [];
                    trashLoc.trash = [...trashArr, removed];
                    return next;
                });
                appendLog(`[result] Defender Character ${battle.target.id} K.O.'d.`);
            }
        } else {
            appendLog('[result] Attacker loses battle; no damage.');
        }
        setBattle((b) => ({ ...b, step: 'end' }));
    }, [isBattleStep, battle, getAttackerPower, getDefenderPower, appendLog, dealOneDamageToLeader, setAreas]);

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
        if (!battle) {
            setBattleArrow(null);
            return;
        }
        const fromKey = modKey(battle.attacker.side, battle.attacker.section, battle.attacker.keyName, battle.attacker.index);
        const toKey = modKey(battle.target.side, battle.target.section, battle.target.keyName, battle.target.index);
        const attackerLabel = battle.attacker.side === 'player' ? '' : ' (Opp)';
        const defenderLabel = battle.target.side === 'player' ? '' : ' (Opp)';
        const label = `${getAttackerPower(battle)}${attackerLabel} ▶ ${getDefenderPower(battle)}${defenderLabel}`;
        setBattleArrow({ fromKey, toKey, label });
    }, [battle, getDefenderPower, getAttackerPower, modKey]);

    // --- Opening Hand Modal ---
    const finalizeKeep = () => {
        // Move openingHand to player's hand area; set Life (5) for both players; shrink deck stacks accordingly
        setAreas((prev) => {
            const next = structuredClone(prev);
            // Player hand gets opening 5
            next.player.bottom.hand = openingHand.slice(0, 5);
            // Compute top 5 (life) for each side from current libraries
            // Rule 5-2-1-7: "the card at the top of their deck is at the bottom in their Life area"
            // Opening hand are the last 5; life should be the next 5 below that
            const pLifeIds = library.slice(-10, -5);
            const oLifeIds = oppLibrary.slice(-5);
            // Reverse the order so top of deck (last element) becomes bottom of life area (first element)
            const pLife = pLifeIds.map((id) => getAssetForId(id)).filter(Boolean).reverse();
            const oLife = oLifeIds.map((id) => getAssetForId(id)).filter(Boolean).reverse();
            next.player.life = pLife;
            next.opponent.life = oLife;
            // Shrink deck visuals: player's deck -10 (5 hand, 5 life); opponent deck already -5 (hand), so -5 more (life)
            const pRemain = Math.max(0, (next.player.middle.deck || []).length - 10);
            next.player.middle.deck = createCardBacks(pRemain);
            const oRemain = Math.max(0, (next.opponent.middle.deck || []).length - 5);
            next.opponent.middle.deck = createCardBacks(oRemain);
            return next;
        });
        // Remove 10 from player's library (5 to hand, 5 to life), and 5 from opponent's (life)
        setLibrary((prev) => prev.slice(0, -10));
        setOppLibrary((prev) => prev.slice(0, -5));
        setOpeningShown(false);
        // Initialize turn state
        setTurnSide('player');
        setTurnNumber(1);

        // Execute Refresh Phase for first turn (rule 6-2)
        executeRefreshPhase('player');

        setPhase('Draw');
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
        if (!canPerformGameAction()) return; // Cannot draw cards until opening hand is finalized
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;
        if (!lib.length) return;

        setAreas((prevAreas) => {
            const next = structuredClone(prevAreas);
            const asset = getAssetForId(lib[lib.length - 1]);
            const handLoc = isPlayer ? next.player.bottom : next.opponent.top;
            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            handLoc.hand = [...(handLoc.hand || []), asset];
            deckLoc.deck = createCardBacks(Math.max(0, (deckLoc.deck || []).length - 1));
            return next;
        });
        (isPlayer ? setLibrary : setOppLibrary)((prev) => prev.slice(0, -1));
    }, [canPerformGameAction, library, oppLibrary, getAssetForId, createCardBacks]);

    // Start deck search modal (for card abilities like "Look at top 5 cards...")
    const startDeckSearch = useCallback((config) => {
        const { side, quantity, filter, minSelect, maxSelect, returnLocation, effectDescription, onComplete } = config;
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;

        // Close action window when opening deck search
        closeActionPanel();

        if (!lib.length) {
            appendLog(`[Deck Search] No cards in deck!`);
            return;
        }

        // Get top X cards from library (top of deck is at end of array)
        const lookCount = Math.min(quantity, lib.length);
        const topCards = lib.slice(-lookCount);
        const cardAssets = topCards.map(id => getAssetForId(id)).filter(Boolean);

        setDeckSearchConfig({
            side,
            cards: cardAssets,
            quantity: lookCount,
            filter: filter || {},
            minSelect: minSelect || 0,
            maxSelect: maxSelect || 1,
            returnLocation: returnLocation || 'bottom',
            canReorder: true,
            effectDescription: effectDescription || '',
            onComplete: (selectedCards, remainder) => {
                // Handle the selection
                const selectedIds = selectedCards.map(c => c.id);
                const remainderIds = remainder.map(c => c.id);

                setAreas((prev) => {
                    const next = structuredClone(prev);
                    const handLoc = isPlayer ? next.player.bottom : next.opponent.top;
                    const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;

                    // Add selected cards to hand
                    selectedCards.forEach(card => {
                        handLoc.hand = [...(handLoc.hand || []), card];
                    });

                    return next;
                });

                // Update library: remove looked cards, add remainder back based on returnLocation
                (isPlayer ? setLibrary : setOppLibrary)((prev) => {
                    // Remove all looked cards from top of deck
                    const newLib = prev.slice(0, -lookCount);

                    if (returnLocation === 'bottom') {
                        // Add remainder to bottom of deck (start of array)
                        return [...remainderIds, ...newLib];
                    } else if (returnLocation === 'top') {
                        // Add remainder to top of deck (end of array)
                        return [...newLib, ...remainderIds];
                    } else if (returnLocation === 'shuffle') {
                        // Shuffle remainder back in
                        const combined = [...newLib, ...remainderIds];
                        return shuffle(combined);
                    }
                    return newLib;
                });

                // Update deck visual
                setAreas((prev) => {
                    const next = structuredClone(prev);
                    const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
                    const newDeckSize = (isPlayer ? library : oppLibrary).length - lookCount + remainderIds.length;
                    deckLoc.deck = createCardBacks(Math.max(0, newDeckSize));
                    return next;
                });

                appendLog(`[Deck Search] Added ${selectedIds.length} card(s) to hand, returned ${remainderIds.length} to ${returnLocation} of deck.`);

                // Call custom completion handler if provided
                if (onComplete) onComplete(selectedCards, remainder);

                // Close modal
                setDeckSearchOpen(false);
            }
        });

        setDeckSearchOpen(true);
    }, [library, oppLibrary, getAssetForId, appendLog, createCardBacks]);

    const returnCardToDeck = useCallback((side, section, keyName, index, location = 'bottom') => {
        setAreas((prev) => {
            const next = structuredClone(prev);
            const isPlayer = side === 'player';

            // Determine where the card array lives
            // Sections 'top', 'middle', 'bottom' are nested objects keyed by keyName
            // Sections like 'char' or 'life' are arrays directly on the side root
            const sideRoot = getSideLocationFromNext(next, side);
            let sourceArray;
            if (section === 'top' || section === 'middle' || section === 'bottom') {
                const container = sideRoot[section];
                sourceArray = container?.[keyName];
            } else {
                // For direct arrays, prefer section; fallback to keyName if needed
                sourceArray = sideRoot[section] || sideRoot[keyName];
            }
            if (!sourceArray || index >= sourceArray.length) {
                console.error('[returnCardToDeck] Invalid source:', { side, section, keyName, index });
                return prev;
            }

            const card = sourceArray[index];

            // Remove from source
            if (section === 'top' || section === 'middle' || section === 'bottom') {
                sideRoot[section][keyName] = sourceArray.filter((_, i) => i !== index);
            } else {
                sideRoot[section] = sourceArray.filter((_, i) => i !== index);
            }

            // Update library state based on location
            if (location === 'top') {
                // Add to top of deck (end of array since deck is drawn from end)
                if (isPlayer) {
                    setLibrary(prev => [...prev, card.id]);
                } else {
                    setOppLibrary(prev => [...prev, card.id]);
                }
            } else if (location === 'bottom') {
                // Add to bottom of deck (start of array)
                if (isPlayer) {
                    setLibrary(prev => [card.id, ...prev]);
                } else {
                    setOppLibrary(prev => [card.id, ...prev]);
                }
            } else if (location === 'shuffle') {
                // Add and shuffle
                const currentLib = isPlayer ? library : oppLibrary;
                const newLib = [...currentLib, card.id];
                // Simple shuffle
                for (let i = newLib.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [newLib[i], newLib[j]] = [newLib[j], newLib[i]];
                }
                if (isPlayer) {
                    setLibrary(newLib);
                } else {
                    setOppLibrary(newLib);
                }
            }

            // Update deck visual (add one card back)
            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            const currentDeckSize = (deckLoc.deck || []).length;
            deckLoc.deck = createCardBacks(currentDeckSize + 1);

            appendLog(`[Ability Cost] Returned ${card.id} to ${location} of ${side}'s deck.`);

            return next;
        });
    }, [library, oppLibrary, createCardBacks, appendLog]);

    // Rest (tap) a field card by location; used for ability costs like cost.restThis
    const restCard = useCallback((side, section, keyName, index) => {
        setAreas((prev) => {
            const next = structuredClone(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            try {
                if (section === 'char' && keyName === 'char') {
                    if (sideLoc?.char?.[index]) {
                        sideLoc.char[index].rested = true;
                        appendLog(`[Ability Cost] Rested Character ${sideLoc.char[index].id}.`);
                    }
                } else if (section === 'middle' && keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = true;
                        appendLog(`[Ability Cost] Rested Leader ${sideLoc.middle.leader[0].id}.`);
                    }
                } else if (section === 'middle' && keyName === 'stage') {
                    if (sideLoc?.middle?.stage?.[0]) {
                        sideLoc.middle.stage[0].rested = true;
                        appendLog(`[Ability Cost] Rested Stage ${sideLoc.middle.stage[0].id}.`);
                    }
                }
            } catch (e) {
                console.warn('[restCard] Failed to rest', { side, section, keyName, index }, e);
                return prev;
            }
            return next;
        });
    }, [setAreas, appendLog]);

    const donPhaseGain = useCallback((side, count) => {
        if (!canPerformGameAction()) return 0; // Cannot gain DON until opening hand is finalized
        let actualMoved = 0;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const loc = getHandCostLocationFromNext(next, side);
            const available = (loc.don || []).length;

            // Rules 6-4-1, 6-4-2, 6-4-3: Handle DON!! deck depletion
            if (available === 0) {
                // Rule 6-4-3: If there are 0 cards in DON!! deck, do not place any
                actualMoved = 0;
                return next;
            }

            // Rule 6-4-2: If only 1 card in DON!! deck, place only 1
            const toMove = Math.min(count, available);
            actualMoved = toMove;

            const moved = Array.from({ length: toMove }, () => ({ ...DON_FRONT, rested: false }));
            loc.don = (loc.don || []).slice(0, -toMove);
            loc.cost = [...(loc.cost || []), ...moved];
            return next;
        });
        return actualMoved;
    }, [canPerformGameAction, DON_FRONT]);

    // Execute Refresh Phase according to rule 6-2
    const executeRefreshPhase = useCallback((side) => {
        appendLog(`[Refresh Phase] Start ${side}'s turn.`);

        // 6-2-1: End effects that last "until the start of your next turn"
        setUntilNextTurnEffects((prev) => {
            const effects = prev[side] || [];
            if (effects.length) {
                appendLog(`[Refresh] ${effects.length} "until next turn" effect(s) expired.`);
            }
            return { ...prev, [side]: [] };
        });

        // Clear any power modifiers that expire on this side's Refresh Phase
        setPowerMods((prev) => {
            const next = {};
            for (const [k, v] of Object.entries(prev || {})) {
                const arr = Array.isArray(v) ? v.filter((m) => (m && m.expireOnSide !== side)) : [];
                if (arr.length) next[k] = arr;
            }
            return next;
        });
        
        // Clear any cost modifiers that expire on this side's Refresh Phase
        setCostMods((prev) => {
            const next = {};
            for (const [k, v] of Object.entries(prev || {})) {
                const arr = Array.isArray(v) ? v.filter((m) => (m && m.expireOnSide !== side)) : [];
                if (arr.length) next[k] = arr;
            }
            return next;
        });
        
        // Clear any temporary keywords that expire on this side's Refresh Phase
        setTempKeywords((prev) => {
            const next = {};
            for (const [k, v] of Object.entries(prev || {})) {
                const arr = Array.isArray(v) ? v.filter((m) => (m && m.expireOnSide !== side)) : [];
                if (arr.length) next[k] = arr;
            }
            return next;
        });
        // Clear any disabled keywords that expire on this side's Refresh Phase
        setDisabledKeywords((prev) => {
            const next = {};
            for (const [k, v] of Object.entries(prev || {})) {
                const arr = Array.isArray(v) ? v.filter((m) => (m && m.expireOnSide !== side)) : [];
                if (arr.length) next[k] = arr;
            }
            return next;
        });

        // 6-2-2: Activate "at the start of your/opponent's turn" effects
        // TODO: Implement auto effect activation system

        // 6-2-3: Return all DON!! cards given to Leaders/Characters to cost area and rest them
        // 6-2-4: Set all rested cards to active
        setAreas((prev) => {
            const next = structuredClone(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const costLoc = getHandCostLocationFromNext(next, side);

            // 6-2-3: Return given DON!! from Leader
            if (sideLoc?.middle?.leaderDon && sideLoc.middle.leaderDon.length > 0) {
                const count = sideLoc.middle.leaderDon.length;
                appendLog(`[Refresh] Return ${count} DON!! from Leader to cost area.`);
                // Add rested DON!! back to cost area (they're already rested)
                costLoc.cost = [...(costLoc.cost || []), ...sideLoc.middle.leaderDon];
                sideLoc.middle.leaderDon = [];
            }

            // 6-2-3: Return given DON!! from Characters
            if (Array.isArray(sideLoc?.charDon)) {
                let totalReturned = 0;
                const allCharDon = [];
                sideLoc.charDon.forEach((donArr) => {
                    if (donArr && donArr.length > 0) {
                        totalReturned += donArr.length;
                        allCharDon.push(...donArr);
                    }
                });
                if (totalReturned > 0) {
                    appendLog(`[Refresh] Return ${totalReturned} DON!! from Characters to cost area.`);
                    costLoc.cost = [...(costLoc.cost || []), ...allCharDon];
                    // Clear all character DON arrays
                    sideLoc.charDon = sideLoc.charDon.map(() => []);
                }
            }

            // 6-2-4: Set all rested cards placed in Leader area, Character area, Stage area, and cost area as active
            costLoc.cost = (costLoc.cost || []).map((c) => (c.id === 'DON' ? { ...c, rested: false } : c));
            if (sideLoc?.middle?.leader?.[0]) {
                sideLoc.middle.leader[0].rested = false;
            }
            if (sideLoc?.middle?.stage?.[0]) {
                sideLoc.middle.stage[0].rested = false;
            }
            if (Array.isArray(sideLoc?.char)) {
                sideLoc.char = sideLoc.char.map((c) => ({ ...c, rested: false }));
            }

            return next;
        });

        appendLog('[Refresh Phase] Complete.');
    }, [appendLog, DON_FRONT]);

    // Pay Life as a cost (move top life to hand without Trigger)
    const payLife = useCallback((side, amount) => {
        if (!amount || amount <= 0) return 0;
        let paid = 0;
        setAreas((prev) => {
            const next = structuredClone(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const handLoc = getHandCostLocationFromNext(next, side);
            const lifeArr = sideLoc.life || [];
            const toPay = Math.min(amount, lifeArr.length);
            if (toPay <= 0) return prev;
            for (let i = 0; i < toPay; i++) {
                const card = sideLoc.life.pop();
                if (card) {
                    handLoc.hand = [...(handLoc.hand || []), card];
                    paid++;
                }
            }
            return next;
        });
        if (paid > 0) appendLog(`[Ability Cost] ${side} paid ${paid} life (added to hand).`);
        return paid;
    }, [setAreas, appendLog]);

    // Next Action button handler based on current phase
    const nextActionLabel = useMemo(() => {
        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') {
            const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
            // Calculate actual DON!! available in the DON!! deck
            const donDeck = getDonDeckArray(turnSide);
            const availableDon = donDeck.length;
            const actualAmount = Math.min(requestedAmount, availableDon);
            return `Gain ${actualAmount} DON!!`;
        }
        // Show confirmation text if in confirming state
        if (endTurnConfirming) return 'Are you sure?';
        return 'End Turn';
    }, [phaseLower, turnNumber, turnSide, getDonDeckArray, endTurnConfirming]);

    // Auto-skip DON phase if no DON can be gained (no button press required)
    useEffect(() => {
        if (!canPerformGameAction()) return;
        if (phaseLower !== 'don') return;
        const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
        const donDeck = getDonDeckArray(turnSide);
        const availableDon = donDeck.length;
        const actualAmount = Math.min(requestedAmount, availableDon);
        if (actualAmount === 0) {
            appendLog('DON!! deck empty: skipping DON phase.');
            setPhase('Main');
        }
    }, [canPerformGameAction, phaseLower, turnNumber, turnSide, getDonDeckArray, appendLog]);

    const onNextAction = useCallback(() => {
        // Block advancing while resolving mandatory effects, selections, deck search, triggers, or battle
        if (battle || resolvingEffect || targeting.active || deckSearchOpen || triggerPending) {
            appendLog('Cannot end turn while resolving effects or selections.');
            return;
        }
        if (!canPerformGameAction()) return; // Cannot advance phases until opening hand is finalized
        const isFirst = turnNumber === 1 && turnSide === 'player';

        if (phaseLower === 'draw') {
            if (!isFirst) drawCard(turnSide);
            appendLog(isFirst ? 'First turn: skip draw.' : 'Draw 1.');
            return setPhase('Don');
        }

        if (phaseLower === 'don') {
            const amt = isFirst ? 1 : 2;
            const actualGained = donPhaseGain(turnSide, amt);
            if (actualGained === 0) {
                appendLog('DON!! deck empty: gained 0 DON!!');
            } else if (actualGained < amt) {
                appendLog(`DON!! deck low: gained ${actualGained} DON!! (requested ${amt})`);
            } else {
                appendLog(`DON!! +${actualGained}.`);
            }
            return setPhase('Main');
        }

        // End Turn from Main - requires double-click confirmation
        if (!endTurnConfirming) {
            // First click: enter confirmation state
            setEndTurnConfirming(true);

            // Clear any existing timeout
            if (endTurnTimeoutRef.current) {
                clearTimeout(endTurnTimeoutRef.current);
            }

            // Set timeout to reset after 3 seconds
            endTurnTimeoutRef.current = setTimeout(() => {
                setEndTurnConfirming(false);
                endTurnTimeoutRef.current = null;
            }, 3000);

            return;
        }

        // Second click: actually end turn
        // Clear the timeout
        if (endTurnTimeoutRef.current) {
            clearTimeout(endTurnTimeoutRef.current);
            endTurnTimeoutRef.current = null;
        }
        setEndTurnConfirming(false);

        appendLog('[End Phase] End turn.');
        const nextSide = getOpposingSide(turnSide);

        // Cancel any active DON giving mode
        cancelDonGiving();

        // No blanket clear of power modifiers here; modifiers are cleared in executeRefreshPhase

        // Advance to next turn
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);

        // Execute Refresh Phase for the new turn player (rule 6-2)
        executeRefreshPhase(nextSide);

        setPhase('Draw');
    }, [canPerformGameAction, phaseLower, turnNumber, turnSide, getOpposingSide, drawCard, appendLog, donPhaseGain, executeRefreshPhase, cancelDonGiving, endTurnConfirming]);

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
                            {donGivingMode.active && (
                                <Chip
                                    color="warning"
                                    label="Select Leader/Character"
                                    onDelete={cancelDonGiving}
                                    sx={{ animation: 'pulse 1.5s ease-in-out infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.7 } } }}
                                />
                            )}
                            <Button
                                size="small"
                                variant="contained"
                                color={phaseLower === 'main' && endTurnConfirming ? 'error' : 'primary'}
                                onClick={onNextAction}
                                disabled={openingShown || !!battle || resolvingEffect || targeting.active || deckSearchOpen || !!triggerPending}
                            >
                                {nextActionLabel}
                            </Button>
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
                            <Board
                                areas={areas}
                                setAreas={setAreas}
                                hovered={hovered}
                                setHovered={setHovered}
                                gameStarted={gameStarted}
                                addCardToArea={addCardToArea}
                                removeCardFromArea={removeCardFromArea}
                                openCardAction={openCardAction}
                                actionOpen={actionOpen}
                                actionCardIndex={actionCardIndex}
                                targeting={targeting}
                                setTargeting={setTargeting}
                                currentAttack={currentAttack}
                                setBattleArrow={setBattleArrow}
                                getTotalPower={getTotalPower}
                                battle={battle}
                                getBattleStatus={getBattleStatus}
                                getKeywordsFor={getKeywordsFor}
                                hasDisabledKeyword={hasDisabledKeyword}
                                applyBlocker={applyBlocker}
                                getPowerMod={getPowerMod}
                                getAuraPowerMod={getAuraPowerMod}
                                getCardCost={(id, side, section, keyName, index) => getCardCost(id, side, section, keyName, index)}
                                getAuraCostMod={getAuraCostMod}
                                turnSide={turnSide}
                                CARD_BACK_URL={CARD_BACK_URL}
                                compact={compact}
                                giveDonToCard={giveDonToCard}
                                moveDonFromCostToCard={moveDonFromCostToCard}
                                startDonGiving={startDonGiving}
                                cancelDonGiving={cancelDonGiving}
                                donGivingMode={donGivingMode}
                                phase={phase}
                                openingShown={openingShown}
                                openingHand={openingHand}
                                allowMulligan={allowMulligan}
                                onMulligan={onMulligan}
                                onKeep={finalizeKeep}
                                deckSearchOpen={deckSearchOpen}
                                deckSearchConfig={deckSearchConfig}
                                setDeckSearchOpen={setDeckSearchOpen}
                                getCardMeta={(id) => metaById.get(id) || null}
                            />

                            {/* Viewer Column */}
                            <CardViewer
                                hovered={hovered}
                                selectedCard={selectedCard}
                                cardError={cardError}
                                loadingCards={loadingCards}
                                log={log}
                                compact={compact}
                            />
                        </Box>
                    </Box>
                )}
            </Box>
            {isLoggedIn && <DeckBuilder open={deckOpen} onClose={() => setDeckOpen(false)} />}

            {/* Anchored Actions Panel (bottom-right) */}
            {actionOpen && (
                <ClickAwayListener onClickAway={() => {
                    // Close Actions; if this window initiated targeting, suspend that session
                    if (targeting?.active && sameOrigin(targeting.origin, actionSource)) {
                        suspendTargeting();
                    }
                    setResolvingEffect(false);
                    closeActionPanel();
                }}>
                    <div>
                        <Actions
                            onClose={() => {
                                if (targeting?.active && sameOrigin(targeting.origin, actionSource)) {
                                    suspendTargeting();
                                }
                                setResolvingEffect(false);
                                closeActionPanel();
                            }}
                            card={actionCard}
                            cardMeta={metaById.get(actionCard?.id)}
                            cardIndex={actionCardIndex}
                            actionSource={actionSource}
                            phase={phase}
                            turnSide={turnSide}
                            turnNumber={turnNumber}
                            isYourTurn={turnSide === (actionSource?.side || 'player')}
                            canActivateMain={canPlayNow(actionSource?.side || 'player')}
                            areas={areas}
                            startTargeting={startTargeting}
                            cancelTargeting={cancelTargeting}
                            suspendTargeting={suspendTargeting}
                            confirmTargeting={confirmTargeting}
                            targeting={targeting}
                            getCardMeta={(id) => metaById.get(id) || null}
                            applyPowerMod={applyPowerMod}
                            registerUntilNextTurnEffect={registerUntilNextTurnEffect}
                            grantTempKeyword={addTempKeyword}
                            disableKeyword={addDisabledKeyword}
                            giveDonToCard={giveDonToCard}
                            moveDonFromCostToCard={moveDonFromCostToCard}
                            startDeckSearch={startDeckSearch}
                            returnCardToDeck={returnCardToDeck}
                            restCard={restCard}
                            payLife={payLife}
                            battle={battle}
                            battleApplyBlocker={applyBlocker}
                            battleSkipBlock={skipBlock}
                            battleAddCounterFromHand={addCounterFromHand}
                            battlePlayCounterEvent={playCounterEventFromHand}
                            battleEndCounterStep={endCounterStep}
                            battleGetDefPower={() => getDefenderPower(battle)}
                            removeCardByEffect={removeCardByEffect}
                            setResolvingEffect={setResolvingEffect}
                            getTotalPower={getTotalPower}
                            markAbilityUsed={markOncePerTurnUsed}
                            abilityUsage={actionSource ? oncePerTurnUsage[modKey(actionSource.side || 'player', actionSource.section || 'char', actionSource.keyName || 'char', typeof actionSource.index === 'number' ? actionSource.index : 0)] : undefined}
                        >
                            {/* Additional action controls (play from hand, attack, etc.) */}
                            {actionSource && ((actionSource.side === 'player' && actionSource.section === 'bottom' && actionSource.keyName === 'hand') || (actionSource.side === 'opponent' && actionSource.section === 'top' && actionSource.keyName === 'hand')) ? (
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                                        {(() => {
                                            // Defending side during Counter Step may only use counters/counter events
                                            if (battle && battle.step === 'counter' && actionSource.side === battle?.target?.side) {
                                                return 'Counter Step: use counters or counter events.';
                                            }
                                            const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
                                            if (battle) return 'Cannot play during battle.';
                                            if (!canPlayNow(side)) return 'Cannot play now (must be your Main Phase).';
                                            const section = actionSource?.section || 'bottom';
                                            const keyName = actionSource?.keyName || 'hand';
                                            const index = actionCardIndex >= 0 ? actionCardIndex : 0;
                                            const cost = actionCard ? getCardCost(actionCard.id, side, section, keyName, index) : 0;
                                            const ok = hasEnoughDonFor(side, cost);
                                            return ok ? `Playable now (${side}). Cost: ${cost} DON.` : `Need ${cost} active DON (${side}).`;
                                        })()}
                                    </Typography>
                                    {(() => {
                                        if (battle && (battle.step === 'counter' || battle.step === 'block') && actionSource.side === battle.target.side) {
                                            const meta = metaById.get(actionCard?.id);
                                            if (!meta) return null;
                                            const elements = [];
                                            const counterVal = meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0;
                                            if (counterVal) {
                                                elements.push(
                                                    <Button key="counterDiscard" size="small" variant="contained" color="error" onClick={() => { addCounterFromHand(actionCardIndex); }}>
                                                        Discard for Counter +{counterVal}
                                                    </Button>
                                                );
                                            }
                                            const isEvent = meta.category === 'Event';
                                            const hasCounterKeyword = hasKeyword(meta.keywords, 'counter');
                                            if (isEvent && hasCounterKeyword) {
                                                const cost = meta?.stats?.cost || 0;
                                                const canPay = hasEnoughDonFor(battle.target.side, cost);
                                                elements.push(
                                                    <Button key="counterEvent" size="small" variant="outlined" disabled={!canPay} onClick={() => { playCounterEventFromHand(actionCardIndex); setActionOpen(false); }}>
                                                        Play Counter Event (Cost {cost})
                                                    </Button>
                                                );
                                            }
                                            if (!elements.length) return <Typography variant="caption">No counter on this card.</Typography>;
                                            return <Stack direction="row" spacing={1}>{elements}</Stack>;
                                        }
                                        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';
                                        const section = actionSource?.section || 'bottom';
                                        const keyName = actionSource?.keyName || 'hand';
                                        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
                                        const cost = actionCard ? getCardCost(actionCard.id, side, section, keyName, index) : 0;
                                        const ok = canPlayNow(side) && hasEnoughDonFor(side, cost);
                                        return (
                                            <Button variant="contained" disabled={!ok} onClick={playSelectedCard}>Play to Character Area</Button>
                                        );
                                    })()}
                                </>
                            ) : (
                                <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                                    {phaseLower === 'main' && actionSource?.side === turnSide ? 'Select an action for this card.' : 'Actions are limited outside the Main Phase or when it\'s not your turn.'}
                                </Typography>
                            )}
                            {(() => {
                                // Attack controls for Characters
                                const isOnFieldChar = actionSource && actionSource.side === turnSide && actionSource.section === 'char' && actionSource.keyName === 'char';
                                // Attack controls for Leaders
                                const isLeader = actionSource && actionSource.side === turnSide && actionSource.section === 'middle' && actionSource.keyName === 'leader';

                                if (!isOnFieldChar && !isLeader) return null;

                                const cardObj = actionCard;
                                const idx = actionCardIndex;
                                const attackingSide = actionSource?.side || 'player';

                                // Check if this card is currently attacking
                                const isAttacking = battle && (
                                    (battle.attacker.section === 'char' && battle.attacker.index === idx && battle.attacker.side === attackingSide) ||
                                    (battle.attacker.section === 'middle' && isLeader && battle.attacker.side === attackingSide)
                                );

                                if (isAttacking) {
                                    // During Block/Counter steps, attacker has no actionable controls here
                                    return null;
                                }

                                // Determine if this card can attack
                                const canAtk = isLeader ? canLeaderAttack(cardObj, attackingSide) : canCharacterAttack(cardObj, attackingSide, idx);
                                if (!canAtk || battle) return null;

                                // Check if we're selecting a target for this card
                                const selecting = targeting.active && currentAttack && (
                                    (currentAttack.isLeader && isLeader) ||
                                    (currentAttack.index === idx && !currentAttack.isLeader)
                                ) && !battle;

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
                                        <Button size="small" variant="contained" onClick={() => isLeader ? beginAttackForLeader(cardObj, attackingSide) : beginAttackForCard(cardObj, idx, attackingSide)}>Attack</Button>
                                    </Stack>
                                );
                            })()}
                        </Actions>
                    </div>
                </ClickAwayListener>
            )}

            <Activity
                battle={battle}
                battleArrow={battleArrow}
                getBattleStatus={getBattleStatus}
                skipBlock={skipBlock}
                endCounterStep={endCounterStep}
            />

            {/* [Trigger] Activation Modal (Rules 4-6-3, 10-1-5) */}
            {triggerPending && (
                <Paper
                    elevation={8}
                    sx={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1500,
                        p: 3,
                        minWidth: 400,
                        bgcolor: 'background.paper',
                        border: '3px solid',
                        borderColor: 'warning.main'
                    }}
                >
                    <Stack spacing={2}>
                        <Typography variant="h6" fontWeight={700} color="warning.main">
                            [Trigger] Card Revealed!
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <img
                                src={triggerPending.card.full || triggerPending.card.thumb}
                                alt={triggerPending.card.id}
                                style={{ width: 200, height: 'auto', borderRadius: 8 }}
                            />
                        </Box>
                        <Typography variant="body1">
                            <strong>{triggerPending.side === 'player' ? 'You' : 'Opponent'}</strong> revealed <strong>{triggerPending.card.id}</strong> from Life.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Choose to activate its [Trigger] effect, or add it to hand.
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <Button
                                fullWidth
                                variant="contained"
                                color="warning"
                                onClick={onTriggerActivate}
                            >
                                Activate [Trigger]
                            </Button>
                            <Button
                                fullWidth
                                variant="outlined"
                                onClick={onTriggerDecline}
                            >
                                Add to Hand
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}
        </Container>
    );
}

