
// Home.jsx
// Main landing page for One Piece TCG Sim. Handles login, registration, and displays user info.
import React, { useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { AuthContext } from '../../AuthContext';
import { Box, Container, Typography, Paper, Button, Stack, Chip, Divider } from '@mui/material';
import ClickAwayListener from '@mui/material/ClickAwayListener';
// Auth form now extracted to its own component
import LoginRegister from '../LoginRegister/LoginRegister';
import Actions from './Actions';
import OP01004Action from '../Cards/OP01/OP01-004';
import DeckBuilder from '../DeckBuilder/DeckBuilder';
import { loadAllCards as loadCardJson } from '../../data/cards/loader';
import OpeningHand from './OpeningHand';
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
                middle: { deck: [], stage: [], leader: [] },
                char: [],
                life: []
            },
            player: {
                life: [],
                char: [],
                middle: { leader: [], stage: [], deck: [] },
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
    const [phase, setPhase] = useState('Draw'); // Draw | Don | Main (Refresh auto)
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);
    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        setLog((prev) => [...prev.slice(-199), `[T${turnNumber} ${turnSide} ${phase}] ${msg}`]);
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
                        // Place leaders
                        next.player.middle.leader = [leaderAsset];
                        next.opponent.middle.leader = [leaderAsset];
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
                        next.player.middle.leader = [leaderAsset];
                        next.opponent.middle.leader = [leaderAsset];
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
    const [ActionComp, setActionComp] = useState(null);
    const actionModules = useMemo(() => import.meta.glob('../Cards/**/[A-Z0-9-]*.jsx'), []);

    const canPlayNow = useMemo(() => phaseLower === 'main', [phaseLower]);

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
        cancelTargeting();
        if (typeof onComplete === 'function') onComplete(arr);
    }, [targeting, areas, cancelTargeting]);

    const getCardMeta = useCallback((id) => metaById.get(id) || null, [metaById]);

    // --- Power Mod Overlays ---
    const [powerMods, setPowerMods] = useState({}); // key => number delta
    const modKey = useCallback((side, section, keyName, index) => `${side}:${section}:${keyName}:${index}`, []);
    const getPowerMod = useCallback((side, section, keyName, index) => powerMods[modKey(side, section, keyName, index)] || 0, [powerMods, modKey]);
    const applyPowerMod = useCallback((side, section, keyName, index, delta) => {
        setPowerMods((prev) => {
            const k = modKey(side, section, keyName, index);
            const next = { ...prev };
            next[k] = (next[k] || 0) + delta;
            return next;
        });
    }, [modKey]);

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
        setTimeout(() => {
            openCardAction(actionCard, fieldIndex, { side, section: 'char', keyName: 'char', index: fieldIndex });
        }, 0);
    }, [actionCard, canPlayNow, actionCardIndex, getCardCost, hasEnoughDonFor, appendLog, openCardAction, actionSource]);

    const dealOneDamageToLeader = useCallback((defender) => {
        setAreas((prev) => {
            const next = structuredClone(prev);
            const side = defender === 'player' ? next.player : next.opponent;
            const life = side.life || [];
            if (!life.length) return next;
            const card = life[life.length - 1];
            side.life = life.slice(0, -1);
            const handLoc = defender === 'player' ? next.player.bottom : next.opponent.top;
            handLoc.hand = [...(handLoc.hand || []), card];
            return next;
        });
    }, []);

    const getKeywordsFor = useCallback((id) => {
        return metaById.get(id)?.keywords || [];
    }, [metaById]);

    const canCharacterAttack = useCallback((card, side, index) => {
        if (!card || !card.id) return false;
        if (turnSide !== 'player') return false; // only allow player attacks in this demo
        if (side !== 'player') return false;
        if (phaseLower !== 'main') return false;
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
    }, [turnSide, phaseLower, turnNumber, getKeywordsFor, areas]);

    const getBasePower = useCallback((id) => {
        return metaById.get(id)?.stats?.power || 0;
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
                const next = structuredClone(prev);
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
        return getTotalPower(b.target.side, b.target.section, b.target.keyName, b.target.index, b.target.id) + (b.counterPower || 0);
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
            const next = structuredClone(prev);
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
            const next = structuredClone(prev);
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
            const next = structuredClone(prev);
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
                    const next = structuredClone(prev);
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

    // --- Opening Hand Modal ---
    const finalizeKeep = () => {
        // Move openingHand to player's hand area; set Life (5) for both players; shrink deck stacks accordingly
        setAreas((prev) => {
            const next = structuredClone(prev);
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
            next.player.middle.deck = createCardBacks(pRemain);
            const oRemain = Math.max(0, (next.opponent.middle.deck || []).length - 5);
            next.opponent.middle.deck = createCardBacks(oRemain);
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
    }, [library, oppLibrary, getAssetForId, createCardBacks]);

    const donPhaseGain = useCallback((side, count) => {
        setAreas((prev) => {
            const next = structuredClone(prev);
            const loc = side === 'player' ? next.player.bottom : next.opponent.top;
            const toMove = Math.min(count, (loc.don || []).length);
            const moved = Array.from({ length: toMove }, () => ({ ...DON_FRONT, rested: false }));
            loc.don = (loc.don || []).slice(0, -toMove);
            loc.cost = [...(loc.cost || []), ...moved];
            return next;
        });
    }, [DON_FRONT]);

    // Next Action button handler based on current phase
    const nextActionLabel = useMemo(() => {
        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') return `Gain ${turnNumber === 1 && turnSide === 'player' ? 1 : 2} DON!!`;
        return 'End Turn';
    }, [phaseLower, turnNumber, turnSide]);

    const onNextAction = useCallback(() => {
        const isFirst = turnNumber === 1 && turnSide === 'player';

        if (phaseLower === 'draw') {
            if (!isFirst) drawCard(turnSide);
            appendLog(isFirst ? 'First turn: skip draw.' : 'Draw 1.');
            return setPhase('Don');
        }

        if (phaseLower === 'don') {
            const amt = isFirst ? 1 : 2;
            donPhaseGain(turnSide, amt);
            appendLog(`DON!! +${amt}.`);
            return setPhase('Main');
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
            const next = structuredClone(prev);
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
    }, [phaseLower, turnNumber, turnSide, drawCard, appendLog, donPhaseGain]);

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
                                applyBlocker={applyBlocker}
                                getPowerMod={getPowerMod}
                                turnSide={turnSide}
                                CARD_BACK_URL={CARD_BACK_URL}
                                compact={compact}
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
            {/* Disable test Actions in game mode */}
            {isLoggedIn && !gameStarted && (
                <Actions title="Actions">
                    <OP01004Action />
                </Actions>
            )}

            <OpeningHand open={openingShown} hand={openingHand} allowMulligan={allowMulligan} onMulligan={onMulligan} onKeep={finalizeKeep} />

            {/* Anchored Actions Panel (bottom-right) */}
            {actionOpen && (
                <ClickAwayListener onClickAway={() => { setActionOpen(false); setActionCardIndex(-1); setActionSource(null); setSelectedCard(null); }}>
                    <div>
                        {(() => {
                            const id = actionCard?.id;
                            const meta = id ? metaById.get(id) : null;
                            const title = id ? `${id}${meta?.name ? ` — ${meta.name}` : ''}` : 'Actions';
                            return (
                                <Actions title={title} onClose={() => { setActionOpen(false); setActionCardIndex(-1); setActionSource(null); setSelectedCard(null); }}>
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
                                                {phaseLower === 'main' ? 'Select an action for this card.' : 'Actions are limited outside the Main Phase.'}
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
                                </Actions>
                            );
                        })()}
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
        </Container>
    );
}

