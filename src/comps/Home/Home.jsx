// Home.jsx - Main game component for One Piece TCG Sim
import React, {
    useState,
    useContext,
    useEffect,
    useMemo,
    useCallback,
    useRef
} from 'react';
import _ from 'lodash';
import { AuthContext } from '../../AuthContext';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Stack,
    Chip,
    Divider,
} from '@mui/material';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import LoginRegister from '../LoginRegister/LoginRegister';
import Actions from './Actions';
import DeckBuilder from '../DeckBuilder/DeckBuilder';
import { loadAllCards as loadCardJson } from '../../data/cards/loader';
import Board from './Board';
import Activity from './Activity';
import { useBattleSystem } from './Battle';
import { useDonManagement } from './Don';
import { useTargeting } from './useTargeting';
import { useModifiers } from './useModifiers';
import { useDeckInitializer, createInitialAreas } from './useDeckInitializer';
import GameModeSelect from './GameModeSelect';
import DiceRoll from './DiceRoll';

const CARD_BACK_URL = '/api/cards/assets/Card%20Backs/CardBackRegular.png'; //. Performance: constants defined outside component
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
    { id: 'OP09-004', count: 2 }
];

//. Helper to get the side location from areas (player or opponent)
const getSideLocationFromNext = (next, side) => {
    return side === 'player' ? next.player : next.opponent;
};

//. Helper to get hand/cost/trash/don container from areas
const getHandCostLocationFromNext = (next, side) => {
    return side === 'player' ? next.player.bottom : next.opponent.top;
};

//. Returns deep-cloned board areas (for safe mutation)
const cloneAreas = (prev) => _.cloneDeep(prev);

export default function Home() {
    //. Auth context values and actions
    const { isLoggedIn, user, logout, loading } = useContext(AuthContext);

    //. Card Viewer State
    const [hovered, setHovered] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);
    const [loadingCards, setLoadingCards] = useState(false);
    const [cardError, setCardError] = useState('');
    const [allCards, setAllCards] = useState([]);
    const allById = useMemo(() => _.keyBy(allCards, 'id'), [allCards]);
    const [metaById, setMetaById] = useState(() => new Map());

    //. Load card JSON metadata on mount
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

    const cardsLoadedRef = useRef(false); //. Load all cards once on login
    useEffect(() => {
        if (!isLoggedIn || cardsLoadedRef.current) { return; }
        cardsLoadedRef.current = true;

        const fetchAll = async () => {
            setLoadingCards(true);
            setCardError('');
            try {
                const res = await fetch('/api/cardsAll');
                const data = await res.json();
                if (!res.ok) { throw new Error(data.error || 'Failed to load cards'); }
                setAllCards(data.cards || []);
                setHovered(null);
            } catch (e) {
                setCardError(e.message);
                setAllCards([]);
                setHovered(null);
                cardsLoadedRef.current = false; //. Allow retry on error
            } finally {
                setLoadingCards(false);
            }
        };
        fetchAll();
    }, [isLoggedIn]);

    //. Returns random card for demo/testing
    const getRandomCard = useCallback(() => {
        if (_.isEmpty(allCards)) { return null; }
        return _.sample(allCards);
    }, [allCards]);

    //. Board / Play Area State
    const compact = false;
    const [areas, setAreas] = useState(createInitialAreas);

    //. Game Mode State
    const [gameMode, setGameMode] = useState(null); //. null = not selected, 'self-vs-self', 'vs-ai', 'multiplayer'

    //. Game Setup State (for vs-self mode)
    const [setupPhase, setSetupPhase] = useState('dice'); //. 'dice' | 'hand-first' | 'hand-second' | 'complete'
    const [firstPlayer, setFirstPlayer] = useState(null); //. 'player' | 'opponent' - who won dice roll
    const [currentHandSide, setCurrentHandSide] = useState(null); //. Which side is currently selecting hand

    //. Game State
    const gameStarted = gameMode !== null; //. Manual board edits disabled during game
    const gameSetupComplete = setupPhase === 'complete'; //. True when both hands selected
    const [library, setLibrary] = useState([]); //. Player deck card IDs (top at end)
    const [oppLibrary, setOppLibrary] = useState([]); //. Opponent deck card IDs
    const deckSearchRef = useRef(null); //. Deck search component ref
    const openingHandRef = useRef(null); //. Opening hand component ref

    const { //. Deck initialization and card asset helpers
        createCardBacks,
        getAssetForId,
        resetGameInit
    } = useDeckInitializer({
        isLoggedIn,
        allCards,
        allById,
        library,
        oppLibrary,
        setAreas,
        setLibrary,
        setOppLibrary,
        initializeDonDecks: () => { }, //. will be overridden after DON hook init
        openingHandRef,
        demoConfig: { HARDCODED, DEMO_LEADER, DEMO_DECK_ITEMS },
        cardBackUrl: CARD_BACK_URL,
        gameMode
    });

    const [openingHandShown, setOpeningHandShown] = useState(false);

    //. Turn and Phase State
    const [turnSide, setTurnSide] = useState('player');
    const [turnNumber, setTurnNumber] = useState(1);
    const [phase, setPhase] = useState('Draw');
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);
    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        setLog((prev) => [
            ..._.takeRight(prev, 199),
            `[T${turnNumber} ${turnSide} ${phase}] ${msg}`
        ]);
    }, [turnNumber, turnSide, phase]);
    const [endTurnConfirming, setEndTurnConfirming] = useState(false); //. Double-click confirmation
    const endTurnTimeoutRef = useRef(null);

    useEffect(() => { //. Clear end turn timeout on unmount
        return () => {
            if (endTurnTimeoutRef.current) {
                clearTimeout(endTurnTimeoutRef.current);
            }
        };
    }, []);

    const addCardToArea = useCallback((side, section, key) => {
        if (gameStarted) { return; }

        const card = getRandomCard();
        if (!card) {
            console.warn(
                '[addCardToArea] No cards available. allCards length:',
                allCards.length,
                'side:',
                side,
                'section:',
                section,
                'key:',
                key
            );
            return;
        }

        setAreas(prev => {
            const sideData = prev[side];
            const targetSection = sideData[section];

            //. Direct array section (e.g., char)
            if (_.isArray(targetSection)) {
                return {
                    ...prev,
                    [side]: {
                        ...sideData,
                        [section]: [...targetSection, _.clone(card)]
                    }
                };
            }

            //. Nested section (e.g., middle.leader)
            const targetArray = targetSection[key];
            return {
                ...prev,
                [side]: {
                    ...sideData,
                    [section]: {
                        ...targetSection,
                        [key]: [...targetArray, _.clone(card)]
                    }
                }
            };
        });
    }, [getRandomCard, allCards.length]);

    const removeCardFromArea = useCallback((side, section, key) => {
        if (gameStarted) { return; }

        setAreas(prev => {
            const targetSection = _.get(prev, [side, section]);
            if (!targetSection) { return prev; }

            if (_.isArray(targetSection)) {
                if (_.isEmpty(targetSection)) { return prev; }
                return {
                    ...prev,
                    [side]: {
                        ...prev[side],
                        [section]: _.dropRight(targetSection)
                    }
                };
            }

            const target = targetSection[key];
            if (!target?.length) { return prev; }

            return {
                ...prev,
                [side]: {
                    ...prev[side],
                    [section]: {
                        ...targetSection,
                        [key]: _.dropRight(target)
                    }
                }
            };
        });
    }, []);

    const [actionOpen, setActionOpen] = useState(false);
    const [actionCard, setActionCard] = useState(null);
    const [actionCardIndex, setActionCardIndex] = useState(-1);
    const [actionSource, setActionSource] = useState(null);

    //. Closes action panel and clears selection
    const closeActionPanel = useCallback(() => {
        setActionOpen(false);
        setActionCardIndex(-1);
        setActionSource(null);
        setSelectedCard(null);
    }, []);

    //. Get side root from areas
    const getSideLocation = useCallback((side) => _.get(areas, side), [areas]);

    //. Get hand/cost/trash/don container
    const getHandCostLocation = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.bottom' : 'opponent.top'),
        [areas]
    );

    //. Get character array
    const getCharArray = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.char' : 'opponent.char', []),
        [areas]
    );

    //. Get leader array
    const getLeaderArray = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.middle.leader' : 'opponent.middle.leader', []),
        [areas]
    );

    //. Targeting and Battle State
    const [currentAttack, setCurrentAttack] = useState(null);
    const [battleArrow, setBattleArrow] = useState(null);
    const [battle, setBattle] = useState(null); //. Battle lifecycle: attack > block > counter > damage > end (CR 7-1)

    //. Leave game and reset all game state
    const leaveGame = useCallback(() => {
        setGameMode(null);
        setAreas(createInitialAreas());
        setLibrary([]);
        setOppLibrary([]);
        setOpeningHandShown(false);
        setTurnSide('player');
        setTurnNumber(1);
        setPhase('Draw');
        setLog([]);
        setBattle(null);
        setCurrentAttack(null);
        setBattleArrow(null);
        setSetupPhase('dice');
        setFirstPlayer(null);
        setCurrentHandSide(null);
        resetGameInit();
    }, [resetGameInit]);

    //. Handle dice roll completion
    const handleDiceRollComplete = useCallback(({ firstPlayer: winner }) => {
        setFirstPlayer(winner);
        setSetupPhase('hand-first');
        setCurrentHandSide(winner);
        //. Initialize opening hand for the first player (dice roll winner)
        const lib = winner === 'player' ? library : oppLibrary;
        openingHandRef?.current?.initialize(lib, winner);
    }, [library, oppLibrary]);

    const {
        targeting,
        setTargeting,
        startTargeting,
        suspendTargeting,
        cancelTargeting,
        confirmTargeting,
        resumeTargeting
    } = useTargeting({
        areas,
        battle,
        setBattleArrow,
        setCurrentAttack
    });
    const [triggerPending, setTriggerPending] = useState(null); //. Trigger choice pending (CR 4-6-3, 10-1-5)
    const [resolvingEffect, setResolvingEffect] = useState(false);

    //. Can play cards? (Main phase, your turn, no battle - CR 10-2-2/10-2-3)
    const canPlayNow = useCallback((side) => {
        return phaseLower === 'main' && side === turnSide && !battle;
    }, [phaseLower, turnSide, battle]);

    const getCardMeta = useCallback((id) => metaById.get(id) || null, [metaById]);

    //. Case-insensitive keyword check
    const hasKeyword = useCallback((keywords, keyword) => {
        return _.some(keywords, k => new RegExp(keyword, 'i').test(k));
    }, []);

    //. Game actions allowed after opening hand finalized AND game setup complete
    const canPerformGameAction = useCallback(() => {
        return !openingHandShown && gameSetupComplete;
    }, [openingHandShown, gameSetupComplete]);

    const getOpposingSide = useCallback((side) => {
        return side === 'player' ? 'opponent' : 'player';
    }, []);

    const { //. DON management (gain, give, return)
        donGivingMode,
        startDonGiving,
        cancelDonGiving,
        giveDonToCard,
        moveDonFromCostToCard,
        donPhaseGain,
        returnAllGivenDon,
        getDonPowerBonus,
        returnDonFromCard,
        returnDonToDonDeckFromCard,
        detachDonFromCard,
        initializeDonDecks,
        getDonDeckArray,
        hasEnoughDonFor
    } = useDonManagement({
        areas,
        setAreas,
        turnSide,
        turnNumber,
        phase,
        battle,
        appendLog,
        canPerformGameAction
    });

    //. Initialize DON decks once when component mounts
    useEffect(() => {
        initializeDonDecks();
    }, [initializeDonDecks]);

    //. Unique key for card location
    const modKey = useCallback((side, section, keyName, index) => {
        return `${side}:${section}:${keyName}:${index}`;
    }, []);

    const { //. Power/cost modifiers and temporary keywords
        getPowerMod,
        hasTempKeyword,
        hasDisabledKeyword,
        applyPowerMod,
        addTempKeyword,
        addDisabledKeyword,
        registerUntilNextTurnEffect,
        cleanupOnRefreshPhase
    } = useModifiers({ modKey, appendLog });

    const [oncePerTurnUsage, setOncePerTurnUsage] = useState({}); //. Track Once Per Turn abilities (CR 10-2-13)
    const [attackLocked, setAttackLocked] = useState(false); //. Prevent cancelling attack after When Attacking effects resolve

    //. Reset Once Per Turn usage each turn
    useEffect(() => {
        setOncePerTurnUsage({});
        setAttackLocked(false);
    }, [turnSide, turnNumber]);

    const lockCurrentAttack = useCallback((source, abilityIndex) => {
        try {
            if (!currentAttack || !source) { return; }
            const isLeaderAttack = currentAttack.isLeader;
            const sameSide = source.side === currentAttack.side;
            const sameSection = source.section === (isLeaderAttack ? 'middle' : 'char');
            const sameKey = source.keyName === (isLeaderAttack ? 'leader' : 'char');
            const sameIndex = (source.index ?? 0) === (currentAttack.index ?? 0);
            if (sameSide && sameSection && sameKey && sameIndex) {
                setAttackLocked(true);
            }
        } catch { /* noop */ }
    }, [currentAttack]);

    //. Cancel an attack during declaring phase - un-rests the attacker and clears battle state
    const cancelAttack = useCallback(() => {
        if (attackLocked) { return; } //. Cannot cancel if locked by When Attacking ability
        if (!battle || battle.step !== 'declaring') { return; } //. Only cancel during declaring phase

        const attacker = battle.attacker;
        if (attacker) {
            //. Un-rest the attacker
            setAreas((prev) => {
                const next = _.cloneDeep(prev);
                const sideLoc = attacker.side === 'player' ? next.player : next.opponent;
                if (attacker.section === 'char' && attacker.keyName === 'char') {
                    if (sideLoc?.char?.[attacker.index]) {
                        sideLoc.char[attacker.index].rested = false;
                    }
                } else if (attacker.section === 'middle' && attacker.keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = false;
                    }
                }
                return next;
            });
            appendLog(`[Attack] Cancelled attack with ${attacker.id}.`);
        }

        //. Clear battle and targeting state
        cancelTargeting();
        setBattle(null);
        setCurrentAttack(null);
    }, [attackLocked, battle, cancelTargeting, setAreas, appendLog]);

    //. Reset attackLocked when attack/battle ends OR when a new attack begins
    useEffect(() => {
        if (!currentAttack && !battle) {
            //. No active attack or battle: reset lock
            setAttackLocked(false);
        } else if (currentAttack && battle?.step === 'declaring') {
            //. New attack just started in declaring phase: reset lock
            setAttackLocked(false);
        }
    }, [currentAttack, battle]);

    const markOncePerTurnUsed = useCallback((source, abilityIndex) => {
        if (!source || typeof abilityIndex !== 'number') { return; }
        const side = source.side || 'player';
        const section = source.section || 'char';
        const keyName = source.keyName || 'char';
        const index = _.isNumber(source.index) ? source.index : 0;
        const key = modKey(side, section, keyName, index);
        setOncePerTurnUsage((prev) => {
            const existing = prev[key] || {};
            if (existing[abilityIndex]) { return prev; }
            return {
                ...prev,
                [key]: { ...existing, [abilityIndex]: true }
            };
        });
    }, [modKey]);

    //. Check if two sources reference same card
    const sameOrigin = useCallback((a, b) => {
        return !!(
            a && b &&
            a.side === b.side &&
            a.section === b.section &&
            a.keyName === b.keyName &&
            a.index === b.index
        );
    }, []);

    const openCardAction = useCallback(async (card, index, source = null) => {
        //. Block opening non-origin cards during targeting
        if (targeting.active && !sameOrigin(source, targeting.origin)) { return; }
        setActionCard(card);
        setActionCardIndex(index);
        setActionSource(source);
        setActionOpen(true);
        setSelectedCard(card);
    }, [targeting.active, targeting.origin, sameOrigin]);

    //. Deal 1 damage; check for Trigger (CR 4-6-3, 10-1-5)
    const dealOneDamageToLeader = useCallback((defender) => {
        let cardWithTrigger = null;

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const side = getSideLocationFromNext(next, defender);
            const life = side.life || [];

            //. Rule 1-2-1-1-1: Taking damage with 0 Life = defeat condition
            if (!life.length) {
                appendLog(`[DEFEAT] ${defender} has 0 Life and took damage!`);
                return next;
            }

            //. Remove top card from life
            const card = life[life.length - 1];
            side.life = life.slice(0, -1);

            //. Check if card has [Trigger] keyword
            const keywords = metaById.get(card.id)?.keywords || [];
            const cardHasTrigger = hasKeyword(keywords, 'trigger');

            if (cardHasTrigger) {
                //. Pause and show trigger choice modal
                cardWithTrigger = { side: defender, card, hasTrigger: true };
            } else {
                //. No trigger: add to hand as normal
                const handLoc = getHandCostLocationFromNext(next, defender);
                handLoc.hand = _.concat(handLoc.hand || [], card);
                appendLog(`[Damage] ${defender} takes 1 damage, adds ${card.id} to hand.`);
            }

            return next;
        });

        //. If trigger detected, pause for player choice
        if (cardWithTrigger) {
            setTriggerPending(cardWithTrigger);
        }
    }, [metaById, appendLog, hasKeyword, setAreas]);

    const onTriggerActivate = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Trigger] ${side} activates [Trigger] on ${card.id}!`);

        //. TODO: Actually resolve the trigger effect (needs effect activation system)
        //. For now, trash the card as per Rule 10-1-5-3
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const trashLoc = getHandCostLocationFromNext(next, side);
            trashLoc.trash = [...(trashLoc.trash || []), card];
            return next;
        });

        setTriggerPending(null);
    }, [triggerPending, appendLog, setAreas]);

    const onTriggerDecline = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Damage] ${side} takes 1 damage, adds ${card.id} to hand (declined trigger).`);

        //. Add to hand instead
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const handLoc = getHandCostLocationFromNext(next, side);
            handLoc.hand = [...(handLoc.hand || []), card];
            return next;
        });

        setTriggerPending(null);
    }, [triggerPending, appendLog, setAreas]);

    const getKeywordsFor = useCallback((id) => {
        return _.get(metaById.get(id), 'keywords', []);
    }, [metaById]);

    const maybeApplyRemovalReplacement = useCallback((targetSide, section, keyName, index, sourceSide) => {
        try {
            //. Only applies when the source is the opponent of the target controller
            if (!targetSide || !sourceSide || targetSide === sourceSide) {
                return false;
            }

            //. Only applies to fielded Leader/Character
            const isCharacter = section === 'char' && keyName === 'char';
            const isLeader = section === 'middle' && keyName === 'leader';
            if (!isCharacter && !isLeader) {
                return false;
            }

            //. Get the card instance
            const sideLoc = getSideLocation(targetSide);
            const cardInstance = isCharacter ? sideLoc?.char?.[index] : sideLoc?.middle?.leader?.[0];
            if (!cardInstance?.id) {
                return false;
            }

            //. Check if card has replacement ability (new schema)
            const meta = metaById.get(cardInstance.id);
            if (!meta) { return false; }

            const abilities = _.get(meta, 'abilities', []);
            
            //. Events that represent "would be removed by opponent's effect"
            const removalEvents = [
                'beforeThisRemovedByOpponentsEffect',
                'wouldBeRemovedFromFieldByOpponentsEffect',
                'thisCardWouldBeRemovedFromFieldByOpponentsEffect'
            ];
            
            //. Find replacement effect action for removal prevention
            let foundAbility = null;
            let foundAction = null;
            let foundAbilityIndex = -1;
            
            for (let abilityIdx = 0; abilityIdx < abilities.length; abilityIdx++) {
                const ability = abilities[abilityIdx];
                //. Only static/continuous abilities can have permanent replacement effects
                if (ability.timing !== 'static') continue;
                
                const actions = _.get(ability, 'actions', []);
                for (const action of actions) {
                    if (action.type !== 'replacementEffect') continue;
                    if (!removalEvents.includes(action.event)) continue;
                    
                    //. Check that target refers to this card
                    const targetRef = action.target;
                    let targetSelector = null;
                    if (typeof targetRef === 'string') {
                        //. Could be a selector key or global like 'selfThisCard'
                        if (targetRef === 'selfThisCard' || targetRef === 'thisCard') {
                            targetSelector = { side: 'self', type: 'thisCard' };
                        } else if (ability.selectors && ability.selectors[targetRef]) {
                            targetSelector = ability.selectors[targetRef];
                        }
                    } else if (typeof targetRef === 'object') {
                        targetSelector = targetRef;
                    }
                    
                    //. Ensure selector targets 'thisCard'
                    if (!targetSelector || targetSelector.type !== 'thisCard') continue;
                    
                    foundAbility = ability;
                    foundAction = action;
                    foundAbilityIndex = abilityIdx;
                    break;
                }
                if (foundAction) break;
            }
            
            if (!foundAction) { return false; }

            //. Check frequency: oncePerTurn
            const usedTurnProp = '__replacementUsedTurn';
            const frequency = foundAbility.frequency || 'none';
            
            if (frequency === 'oncePerTurn') {
                if (cardInstance[usedTurnProp] === turnNumber) {
                    return false;
                }
            }
            
            //. Check maxTriggers if specified
            const maxTriggers = foundAction.maxTriggers || Infinity;
            const triggersUsedProp = '__replacementTriggersUsed';
            const triggersUsed = cardInstance[triggersUsedProp] || 0;
            if (triggersUsed >= maxTriggers) {
                return false;
            }

            //. TODO: If may is true, we should prompt the player
            //. For now, auto-apply the replacement (beneficial for the player)
            const isMay = foundAction.may === true;
            
            //. Execute nested actions from the replacement effect
            const nestedActions = foundAction.actions || [];
            const expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            const cardIndex = isCharacter ? index : 0;
            
            let appliedAnyEffect = false;
            
            for (const nestedAction of nestedActions) {
                if (nestedAction.type === 'noop') {
                    //. noop means simply prevent the removal without additional effects
                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} cannot be removed by opponent's effect.`);
                } else if (nestedAction.type === 'modifyStat' && nestedAction.stat === 'power') {
                    //. Apply power modification instead of removal
                    const amount = nestedAction.amount || 0;
                    const duration = nestedAction.duration || 'thisTurn';
                    
                    //. Apply power mod
                    applyPowerMod(targetSide, section, keyName, cardIndex, amount, expireOnSide);
                    
                    if (registerUntilNextTurnEffect && duration === 'thisTurn') {
                        registerUntilNextTurnEffect(
                            expireOnSide,
                            `${meta.cardName || cardInstance.id}: replacement ${amount} power applied instead of removal`
                        );
                    }
                    
                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} gains ${amount} power instead of being removed.`);
                } else if (nestedAction.type === 'preventKO') {
                    //. Simply prevent the removal
                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} KO prevented.`);
                }
            }
            
            if (!appliedAnyEffect) {
                return false;
            }

            //. Persist the usage flag on areas
            setAreas((prev) => {
                const next = cloneAreas(prev);
                const loc = getSideLocationFromNext(next, targetSide);

                if (isCharacter && loc?.char?.[cardIndex]) {
                    loc.char[cardIndex][usedTurnProp] = turnNumber;
                    loc.char[cardIndex][triggersUsedProp] = triggersUsed + 1;
                } else if (isLeader && loc?.middle?.leader?.[0]) {
                    loc.middle.leader[0][usedTurnProp] = turnNumber;
                    loc.middle.leader[0][triggersUsedProp] = triggersUsed + 1;
                }

                return next;
            });

            // Return any given DON!! to cost area
            returnDonFromCard(targetSide, section, keyName, index);
            return true;
        } catch {
            return false;
        }
    }, [setAreas, appendLog, returnDonFromCard, metaById, getSideLocation, getSideLocationFromNext, turnNumber, turnSide, applyPowerMod, registerUntilNextTurnEffect, cloneAreas]);

    const removeCardByEffect = useCallback((targetSide, section, keyName, index, sourceSide) => {
        //. Check replacement effect first (e.g., -2000 power instead of removal)
        const wasReplaced = maybeApplyRemovalReplacement(targetSide, section, keyName, index, sourceSide);
        if (wasReplaced) {
            return false;
        }

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, targetSide);
            const trashLoc = getHandCostLocationFromNext(next, targetSide);

            //. Handle Character removal
            if (section === 'char' && keyName === 'char') {
                const charArr = sideLoc?.char || [];
                if (!charArr[index]) return prev;

                const removed = charArr.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] ${removed.id} was removed by effect.`);
            }
            //. Handle Leader removal (rare)
            else if (section === 'middle' && keyName === 'leader') {
                const leaderArr = sideLoc?.middle?.leader || [];
                if (!leaderArr[0]) return prev;

                const removed = leaderArr.splice(0, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] Leader ${removed.id} was removed by effect.`);
            }
            //. Handle card trashed from hand
            else if ((section === 'bottom' || section === 'top') && keyName === 'hand') {
                const handLoc = targetSide === 'player' ? next.player?.bottom : next.opponent?.top;
                const hand = handLoc?.hand || [];
                if (!hand[index]) return prev;

                const removed = hand.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Ability Cost] Trashed ${removed.id} from hand.`);
            }

            return next;
        });

        //. Return any given DON!! to cost area
        returnDonFromCard(targetSide, section, keyName, index);
        return true;
    }, [maybeApplyRemovalReplacement, setAreas, appendLog, returnDonFromCard, cloneAreas, getSideLocationFromNext, getHandCostLocationFromNext]);

    const getBasePower = useCallback((id) => {
        const meta = metaById.get(id) || {};
        //. v2 schema: use top-level power only
        return _.get(meta, 'power', 0);
    }, [metaById]);

    const getAuraPowerMod = useCallback((targetSide, section, keyName, index) => {
        try {
            const appliesToLeader = section === 'middle' && keyName === 'leader';
            const appliesToChar = section === 'char' && keyName === 'char';

            if (!appliesToLeader && !appliesToChar) {
                return 0;
            }

            //. Resolve relative targetSide from a source controller perspective
            const resolveTargetSide = (controllerSide, relative) => {
                if (relative === 'both') return 'both';
                if (relative === 'opponent') {
                    return controllerSide === 'player' ? 'opponent' : 'player';
                }
                return controllerSide;
            };

            //. Check if action applies to the target
            const actionAppliesToTarget = (action, srcSide) => {
                if (action?.type !== 'powerMod') return false;
                if (action.mode && action.mode !== 'aura') return false;

                const actualSide = resolveTargetSide(srcSide, action.targetSide || 'player');
                if (actualSide !== 'both' && actualSide !== targetSide) return false;

                const targetType = action.targetType || 'any';
                const leaderOk = targetType === 'leader' || targetType === 'any';
                const charOk = targetType === 'character' || targetType === 'any';

                return (appliesToLeader && leaderOk) || (appliesToChar && charOk);
            };

            //. Process all abilities from a card
            const processAbilityActions = (abilities, srcSide) => {
                let modSum = 0;

                for (const ability of abilities) {
                    // New schema: continuous is timing === 'static'
                    if (ability?.timing !== 'static') continue;

                    const actions = Array.isArray(ability.actions) ? ability.actions : [];
                    for (const action of actions) {
                        // Legacy aura support
                        if (actionAppliesToTarget(action, srcSide)) {
                            modSum += action.amount || 0;
                            continue;
                        }
                        // Schema power modify: treat permanent adds as aura to targets
                        if (action?.type === 'modifyStat' && action.stat === 'power' && action.duration === 'permanent') {
                            const sel = action.target;
                            const selector = typeof sel === 'object' ? sel : null;
                            if (selector) {
                                // Resolve selector side relative to srcSide
                                const actualSide = selector.side === 'self'
                                  ? srcSide
                                  : selector.side === 'opponent'
                                  ? (srcSide === 'player' ? 'opponent' : 'player')
                                  : targetSide;
                                if (actualSide === targetSide || actualSide === 'both') {
                                    const targetType = selector.type || 'any';
                                    const leaderOk = targetType === 'leader' || targetType === 'leaderOrCharacter' || targetType === 'any';
                                    const charOk = targetType === 'character' || targetType === 'leaderOrCharacter' || targetType === 'any';
                                    if ((appliesToLeader && leaderOk) || (appliesToChar && charOk)) {
                                        modSum += action.amount || 0;
                                    }
                                }
                            }
                        }
                    }
                }

                return modSum;
            };

            let totalMod = 0;
            const sides = ['player', 'opponent'];

            for (const srcSide of sides) {
                const srcLoc = getSideLocation(srcSide);
                if (!srcLoc) continue;

                //. Process leader abilities
                const leaderCard = srcLoc?.middle?.leader?.[0];
                if (leaderCard?.id) {
                    const meta = metaById.get(leaderCard.id);
                    if (meta?.abilities) {
                        totalMod += processAbilityActions(meta.abilities, srcSide);
                    }
                }

                //. Process character abilities
                const chars = srcLoc?.char || [];
                for (const charCard of chars) {
                    if (!charCard?.id) continue;

                    const meta = metaById.get(charCard.id);
                    if (meta?.abilities) {
                        totalMod += processAbilityActions(meta.abilities, srcSide);
                    }
                }
            }

            return totalMod;
        } catch {
            return 0;
        }
    }, [metaById, getSideLocation]);

    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        const base = getBasePower(id);
        const mod = getPowerMod(side, section, keyName, index) || 0;
        const aura = getAuraPowerMod(side, section, keyName, index) || 0; //. Continuous abilities (e.g., OP09-004)
        const donBonus = getDonPowerBonus(side, section, keyName, index); //. +1000 per given DON during your turn (CR 6-5-5-2)
        return base + mod + aura + donBonus;
    }, [getBasePower, getPowerMod, getAuraPowerMod, getDonPowerBonus]);

    const getAuraCostMod = useCallback((cardId, side, section, keyName, index) => {
        try {
            //. Only applies to cards in hand
            const isInHand = (section === 'bottom' || section === 'top') && keyName === 'hand';
            if (!isInHand) return 0;

            const meta = metaById.get(cardId);
            const abilities = _.get(meta, 'abilities', []);
            if (_.isEmpty(abilities)) return 0;

            let totalMod = 0;

            for (const ability of abilities) {
                //. Handle both old schema (type: 'Continuous') and new schema (timing: 'static')
                const isOldContinuous = _.get(ability, 'type') === 'Continuous';
                const isNewStatic = _.get(ability, 'timing') === 'static';
                if (!isOldContinuous && !isNewStatic) continue;

                //. Get actions from either old (effect.actions) or new (actions) schema
                let actions = _.get(ability, 'actions', []);
                if (_.isEmpty(actions)) {
                    actions = _.get(ability, 'effect.actions', []);
                }
                if (_.isEmpty(actions)) continue;

                for (const action of actions) {
                    //. Handle old schema: costMod with appliesToHand and targetSelf
                    if (action?.type === 'costMod') {
                        if (!action.appliesToHand || !action.targetSelf) continue;

                        //. Check condition if present (old schema)
                        const condition = ability.condition || {};
                        let conditionMet = true;

                        if (condition.allyCharacterPower) {
                            const sideLoc = getSideLocation(side);
                            const chars = sideLoc?.char || [];
                            conditionMet = _.some(chars, (char, i) => {
                                if (!char?.id) return false;
                                const totalPower = getTotalPower(side, 'char', 'char', i, char.id);
                                return totalPower >= condition.allyCharacterPower;
                            });
                        }

                        if (conditionMet) {
                            totalMod += action.amount || 0;
                        }
                    }

                    //. Handle new schema: modifyStat with stat='cost' and target='thisCard'
                    if (action?.type === 'modifyStat' && action?.stat === 'cost' && action?.target === 'thisCard') {
                        //. Check action-level condition (new schema)
                        const actionCondition = action.condition || {};
                        let conditionMet = true;

                        if (actionCondition.logic === 'AND' && Array.isArray(actionCondition.all)) {
                            conditionMet = actionCondition.all.every(cond => {
                                //. Check selfZone condition - card must be in hand
                                if (cond.field === 'selfZone' && cond.op === '=' && cond.value === 'hand') {
                                    return isInHand; //. Already checked above, always true here
                                }

                                //. Check selectorCount condition - count cards matching selector
                                if (cond.field === 'selectorCount' && cond.selector) {
                                    const selector = ability.selectors?.[cond.selector];
                                    if (!selector) return false;

                                    //. Evaluate selector to count matching cards
                                    const selectorSide = selector.side === 'self' ? side : (side === 'player' ? 'opponent' : 'player');
                                    const sideLoc = getSideLocation(selectorSide);
                                    let matchCount = 0;

                                    //. Check zones specified in selector
                                    const zones = selector.zones || [];
                                    if (zones.includes('character') && sideLoc?.char) {
                                        for (let i = 0; i < sideLoc.char.length; i++) {
                                            const char = sideLoc.char[i];
                                            if (!char?.id) continue;

                                            //. Apply filters
                                            let matches = true;
                                            for (const filter of (selector.filters || [])) {
                                                if (filter.field === 'power') {
                                                    const charPower = getTotalPower(selectorSide, 'char', 'char', i, char.id);
                                                    if (filter.op === '>=' && charPower < filter.value) matches = false;
                                                    if (filter.op === '<=' && charPower > filter.value) matches = false;
                                                    if (filter.op === '>' && charPower <= filter.value) matches = false;
                                                    if (filter.op === '<' && charPower >= filter.value) matches = false;
                                                    if (filter.op === '=' && charPower !== filter.value) matches = false;
                                                }
                                            }
                                            if (matches) matchCount++;
                                        }
                                    }

                                    //. Evaluate the comparison
                                    if (cond.op === '>=' && matchCount < cond.value) return false;
                                    if (cond.op === '<=' && matchCount > cond.value) return false;
                                    if (cond.op === '>' && matchCount <= cond.value) return false;
                                    if (cond.op === '<' && matchCount >= cond.value) return false;
                                    if (cond.op === '=' && matchCount !== cond.value) return false;
                                }

                                return true;
                            });
                        }

                        if (conditionMet) {
                            totalMod += action.amount || 0;
                        }
                    }
                }
            }

            return totalMod;
        } catch {
            return 0;
        }
    }, [metaById, getSideLocation, getTotalPower]);

    const getCardCost = useCallback((id, side = null, section = null, keyName = null, index = null) => {
        if (!id) return 0;
        const meta = metaById.get(id);
        //. v2 schema: use top-level cost only
        const baseCost = _.get(meta, 'cost', 0);
        const cost = _.isNumber(baseCost) && baseCost > 0 ? baseCost : 0;

        if (side !== null && section !== null && keyName !== null && index !== null) {
            const auraMod = getAuraCostMod(id, side, section, keyName, index); //. Continuous abilities (e.g., Uta ST23-001)
            return Math.max(0, cost + auraMod);
        }

        return cost;
    }, [metaById, getAuraCostMod]);

    const playSelectedCard = useCallback(() => {
        //. Cannot play cards until opening hand is finalized
        if (!canPerformGameAction()) return;
        if (!actionCard) return;

        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';

        //. Enforce timing: only during your Main and no battle
        if (!canPlayNow(side)) return;

        //. RULE ENFORCEMENT: Only the turn player can play cards (6-5-3)
        if (side !== turnSide) {
            appendLog(`Cannot play ${actionCard.id}: not ${side}'s turn.`);
            return;
        }

        const section = actionSource?.section || 'bottom';
        const keyName = actionSource?.keyName || 'hand';
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = getCardCost(actionCard.id, side, section, keyName, index);

        if (!hasEnoughDonFor(side, cost)) {
            appendLog(`Cannot play ${actionCard.id}: need ${cost} DON (${side}).`);
            return;
        }

        let placedFieldIndex = -1;

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const isPlayer = side === 'player';

            const hand = _.get(next, isPlayer ? 'player.bottom.hand' : 'opponent.top.hand', []);
            const cardIndex = actionCardIndex >= 0
                ? actionCardIndex
                : _.findIndex(hand, ['id', actionCard.id]);
            const chars = _.get(next, isPlayer ? 'player.char' : 'opponent.char', []);

            //. Can only play if we found the card and have room
            if (cardIndex === -1 || chars.length >= 5) {
                return next;
            }

            //. Pay DON cost
            if (cost > 0) {
                const pool = isPlayer ? (next.player.bottom.cost || []) : (next.opponent.top.cost || []);
                let remainingCost = cost;

                for (let i = 0; i < pool.length && remainingCost > 0; i++) {
                    const don = pool[i];
                    if (don.id === 'DON' && !don.rested) {
                        don.rested = true;
                        remainingCost--;
                    }
                }
            }

            //. Remove from hand and place on field
            const [cardToPlay] = hand.splice(cardIndex, 1);
            if (isPlayer) {
                next.player.bottom.hand = hand;
            } else {
                next.opponent.top.hand = hand;
            }

            placedFieldIndex = chars.length;
            const placedCard = { ...cardToPlay, rested: false, enteredTurn: turnNumber };

            if (isPlayer) {
                next.player.char = [...chars, placedCard];
            } else {
                next.opponent.char = [...chars, placedCard];
            }

            return next;
        });

        appendLog(`[${side}] Played ${actionCard.id}${cost ? ` by resting ${cost} DON` : ''}.`);

        //. Open Actions to allow On Play resolution
        setTimeout(() => {
            setAreas((currentAreas) => {
                const isPlayer = side === 'player';
                const chars = isPlayer ? (currentAreas.player.char || []) : (currentAreas.opponent.char || []);
                const placedCard = chars[placedFieldIndex];

                if (placedCard) {
                    openCardAction(placedCard, placedFieldIndex, {
                        side,
                        section: 'char',
                        keyName: 'char',
                        index: placedFieldIndex,
                        justPlayed: true
                    });
                }

                return currentAreas; //. Don't modify areas, just read from it
            });
        }, 0);
    }, [
        actionCard,
        actionCardIndex,
        actionSource,
        canPerformGameAction,
        canPlayNow,
        turnSide,
        appendLog,
        getCardCost,
        hasEnoughDonFor,
        setAreas,
        openCardAction,
        turnNumber
    ]);

    const {
        canCharacterAttack,
        canLeaderAttack,
        beginAttackForLeader,
        beginAttackForCard,
        applyBlocker,
        skipBlock,
        addCounterFromHand,
        playCounterEventFromHand,
        endCounterStep,
        getBattleStatus,
        getDefenderPower
    } = useBattleSystem({
        battle,
        setBattle,
        currentAttack,
        setCurrentAttack,
        setBattleArrow,
        areas,
        setAreas,
        appendLog,
        startTargeting,
        cancelTargeting,
        closeActionPanel,
        canPerformGameAction,
        getTotalPower,
        getOpposingSide,
        getCharArray,
        getLeaderArray,
        getHandCostLocation,
        getHandCostLocationFromNext,
        getSideLocationFromNext,
        hasKeyword,
        getKeywordsFor,
        hasTempKeyword,
        hasDisabledKeyword,
        cancelDonGiving,
        dealOneDamageToLeader,
        returnDonFromCard,
        modKey,
        turnSide,
        phaseLower,
        turnNumber,
        getCardMeta,
        lockCurrentAttack
    });

    //. Game Action Helpers
    const drawCard = useCallback((side) => {
        if (!canPerformGameAction()) return;
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;
        if (!lib.length) return;

        const cardId = lib[lib.length - 1];
        const asset = getAssetForId(cardId);

        setAreas((prevAreas) => {
            const next = cloneAreas(prevAreas);
            const handLoc = isPlayer ? next.player.bottom : next.opponent.top;
            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            handLoc.hand = [...(handLoc.hand || []), asset];
            const currentDeckLength = deckLoc.deck?.length || 0;
            if (currentDeckLength > 0) {
                deckLoc.deck = createCardBacks(currentDeckLength - 1);
            }
            return next;
        });

        (isPlayer ? setLibrary : setOppLibrary)((prev) => prev.slice(0, -1));
    }, [canPerformGameAction, library, oppLibrary, getAssetForId, createCardBacks, setAreas, setLibrary, setOppLibrary]);

    const startDeckSearch = useCallback((config) => { //. Delegate to DeckSearch component
        //. Note: Do NOT close action panel here - the ability resolution needs to continue
        //. The DeckSearch component will handle UI overlay independently

        if (deckSearchRef.current) {
            deckSearchRef.current.start(config);
        }
    }, []);

    const returnCardToDeck = useCallback((side, section, keyName, index, location = 'bottom') => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const isPlayer = side === 'player';
            const sideRoot = getSideLocationFromNext(next, side);

            let sourceArray;
            if (section === 'top' || section === 'middle' || section === 'bottom') {
                const container = sideRoot[section];
                sourceArray = container?.[keyName];
            } else {
                //. For direct arrays, prefer section; fallback to keyName if needed
                sourceArray = sideRoot[section] || sideRoot[keyName];
            }

            if (!sourceArray || index >= sourceArray.length) {
                console.error('[returnCardToDeck] Invalid source:', { side, section, keyName, index });
                return prev;
            }

            const card = sourceArray[index];

            if (section === 'top' || section === 'middle' || section === 'bottom') {
                sideRoot[section][keyName] = sourceArray.filter((_, i) => i !== index);
            } else {
                sideRoot[section] = sourceArray.filter((_, i) => i !== index);
            }

            if (location === 'top') { //. Top of deck (end of array)
                if (isPlayer) {
                    setLibrary(prevLib => [...prevLib, card.id]);
                } else {
                    setOppLibrary(prevLib => [...prevLib, card.id]);
                }
            } else if (location === 'bottom') { //. Bottom of deck (start of array)
                if (isPlayer) {
                    setLibrary(prevLib => [card.id, ...prevLib]);
                } else {
                    setOppLibrary(prevLib => [card.id, ...prevLib]);
                }
            } else if (location === 'shuffle') { //. Add and shuffle
                const currentLib = isPlayer ? library : oppLibrary;
                const newLib = _.shuffle([...currentLib, card.id]);
                if (isPlayer) {
                    setLibrary(newLib);
                } else {
                    setOppLibrary(newLib);
                }
            }

            //. Update deck visual (add one card back)
            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            const currentDeckSize = (deckLoc.deck || []).length;
            deckLoc.deck = createCardBacks(currentDeckSize + 1);

            appendLog(`[Ability Cost] Returned ${card.id} to ${location} of ${side}'s deck.`);

            return next;
        });
    }, [library, oppLibrary, createCardBacks, appendLog, setAreas, setLibrary, setOppLibrary]);

    //. Rest (tap) card; used for ability costs
    const restCard = useCallback((side, section, keyName, index) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
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

    //. Set active (untap) card; used for actions
    const setActive = useCallback((side, section, keyName, index) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            try {
                if (section === 'char' && keyName === 'char') {
                    if (sideLoc?.char?.[index]) {
                        sideLoc.char[index].rested = false;
                        appendLog(`[Effect] Set Character ${sideLoc.char[index].id} active.`);
                    }
                } else if (section === 'middle' && keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = false;
                        appendLog(`[Effect] Set Leader ${sideLoc.middle.leader[0].id} active.`);
                    }
                } else if (section === 'middle' && keyName === 'stage') {
                    if (sideLoc?.middle?.stage?.[0]) {
                        sideLoc.middle.stage[0].rested = false;
                        appendLog(`[Effect] Set Stage ${sideLoc.middle.stage[0].id} active.`);
                    }
                }
            } catch (e) {
                console.warn('[setActive] Failed to set active', { side, section, keyName, index }, e);
                return prev;
            }
            return next;
        });
    }, [setAreas, appendLog]);

    //. Execute Refresh Phase (CR 6-2)
    const executeRefreshPhase = useCallback((side) => {
        appendLog(`[Refresh Phase] Start ${side}'s turn.`);
        cleanupOnRefreshPhase(side); //. Cleanup modifiers and until-next-turn effects
        //. TODO: 6-2-2 - Activate "at the start of your/opponent's turn" effects
        returnAllGivenDon(side); //. 6-2-3: Return DON from leaders/characters

        //. 6-2-4: Set all rested cards to active
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const costLoc = getHandCostLocationFromNext(next, side);

            costLoc.cost = _.map(costLoc.cost || [], (c) =>
                c.id === 'DON' ? { ...c, rested: false } : c
            );

            if (sideLoc?.middle?.leader?.[0]) {
                sideLoc.middle.leader[0].rested = false;
            }

            if (sideLoc?.middle?.stage?.[0]) {
                sideLoc.middle.stage[0].rested = false;
            }

            if (_.isArray(sideLoc?.char)) {
                sideLoc.char = _.map(sideLoc.char, (c) => ({ ...c, rested: false }));
            }

            return next;
        });

        appendLog('[Refresh Phase] Complete.');
    }, [appendLog, cleanupOnRefreshPhase, returnAllGivenDon, setAreas]);

    //. Handle when a player finishes selecting their hand
    const handleHandSelected = useCallback((side) => {
        if (setupPhase === 'hand-first') {
            //. First player done, now second player selects
            const secondPlayer = firstPlayer === 'player' ? 'opponent' : 'player';
            setSetupPhase('hand-second');
            setCurrentHandSide(secondPlayer);
            //. Initialize opening hand for the second player
            const lib = secondPlayer === 'player' ? library : oppLibrary;
            setTimeout(() => {
                openingHandRef?.current?.initialize(lib, secondPlayer);
            }, 100);
        } else if (setupPhase === 'hand-second') {
            //. Both players done, start the game
            setSetupPhase('complete');
            setCurrentHandSide(null);
            
            //. Initialize turn state - first player goes first
            setTurnSide(firstPlayer);
            setTurnNumber(1);
            
            //. Execute Refresh Phase for first turn (rule 6-2)
            executeRefreshPhase(firstPlayer);
            
            setPhase('Draw');
            appendLog(`Game started! ${firstPlayer === 'player' ? 'Bottom Player' : 'Top Player'} goes first.`);
        }
    }, [setupPhase, firstPlayer, library, oppLibrary, executeRefreshPhase, appendLog]);

    //. Pay life as cost (no Trigger check)
    const payLife = useCallback((side, amount) => {
        if (!amount || amount <= 0) return 0;
        let paid = 0;

        setAreas((prev) => {
            const next = cloneAreas(prev);
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

        if (paid > 0) {
            appendLog(`[Ability Cost] ${side} paid ${paid} life (added to hand).`);
        }
        return paid;
    }, [setAreas, appendLog]);

    //. Label for Next Action button based on phase
    const nextActionLabel = useMemo(() => {
        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') {
            const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
            const donDeck = getDonDeckArray(turnSide);
            const availableDon = _.size(donDeck);
            const actualAmount = Math.min(requestedAmount, availableDon);
            return `Gain ${actualAmount} DON!!`;
        }
        return endTurnConfirming ? 'Are you sure?' : 'End Turn';
    }, [phaseLower, turnNumber, turnSide, endTurnConfirming, getDonDeckArray]);

    //. Auto-skip DON phase if deck empty
    useEffect(() => {
        if (!canPerformGameAction() || phaseLower !== 'don') return;

        const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
        const donDeck = getDonDeckArray(turnSide);
        const availableDon = donDeck.length;
        const actualAmount = Math.min(requestedAmount, availableDon);

        if (actualAmount === 0) {
            appendLog('DON!! deck empty: skipping DON phase.');
            setPhase('Main');
        }
    }, [phaseLower, turnNumber, turnSide, canPerformGameAction, getDonDeckArray, appendLog]);

    //. Handle Draw/DON/End Turn button
    const onNextAction = useCallback(() => {
        if (
            battle ||
            resolvingEffect ||
            targeting.active ||
            (deckSearchRef.current?.active) ||
            triggerPending
        ) {
            appendLog('Cannot end turn while resolving effects or selections.');
            return;
        }
        if (!canPerformGameAction()) return;

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

        if (!endTurnConfirming) { //. First click: enter confirmation state
            setEndTurnConfirming(true);
            if (endTurnTimeoutRef.current) {
                clearTimeout(endTurnTimeoutRef.current);
            }
            endTurnTimeoutRef.current = setTimeout(() => {
                setEndTurnConfirming(false);
                endTurnTimeoutRef.current = null;
            }, 3000);

            return;
        }

        if (endTurnTimeoutRef.current) { //. Second click: end turn
            clearTimeout(endTurnTimeoutRef.current);
            endTurnTimeoutRef.current = null;
        }
        setEndTurnConfirming(false);
        appendLog('[End Phase] End turn.');
        const nextSide = getOpposingSide(turnSide);
        cancelDonGiving();
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);

        //. Execute Refresh Phase for the new turn player (rule 6-2)
        executeRefreshPhase(nextSide);

        setPhase('Draw');
    }, [
        battle,
        resolvingEffect,
        targeting.active,
        triggerPending,
        canPerformGameAction,
        turnNumber,
        turnSide,
        phaseLower,
        drawCard,
        appendLog,
        donPhaseGain,
        getOpposingSide,
        cancelDonGiving,
        executeRefreshPhase,
        endTurnConfirming
    ]);

    const [deckOpen, setDeckOpen] = useState(false);

    return (
        <Container
            maxWidth={false}
            disableGutters
            sx={{
                py: 0,
                px: compact ? 1 : 2,
                height: '100vh',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            <Box sx={{ p: 0 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        m: 0,
                        py: 0,
                        minHeight: 48
                    }}
                >
                    <Typography
                        variant='h6'
                        fontWeight={700}
                        sx={{ mb: 0, lineHeight: 1 }}
                    >
                        One Piece TCG Sim
                    </Typography>
                    {isLoggedIn && (
                        <Stack direction='row' spacing={1} alignItems='center'>
                            {gameSetupComplete ? (
                                <>
                                    <Chip color='primary' label={`Turn ${turnNumber}`} />
                                    <Chip
                                        color={turnSide === 'player' ? 'success' : 'warning'}
                                        label={`${turnSide === 'player' ? 'Bottom' : 'Top'} Player's Turn`}
                                    />
                                    <Chip variant='outlined' label={`Phase: ${phase}`} />
                                </>
                            ) : (
                                <Chip
                                    color='info'
                                    label={
                                        setupPhase === 'dice'
                                            ? 'Rolling for first turn...'
                                            : setupPhase === 'hand-first'
                                            ? `${currentHandSide === 'player' ? 'Bottom' : 'Top'} Player: Choose opening hand`
                                            : `${currentHandSide === 'player' ? 'Bottom' : 'Top'} Player: Choose opening hand`
                                    }
                                />
                            )}
                            {donGivingMode.active && (
                                <Chip
                                    color='warning'
                                    label='Select Leader/Character'
                                    onDelete={cancelDonGiving}
                                    sx={{
                                        animation: 'pulse 1.5s ease-in-out infinite',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 1 },
                                            '50%': { opacity: 0.7 }
                                        }
                                    }}
                                />
                            )}
                            {gameSetupComplete && (
                                <Button
                                    size='small'
                                    variant='contained'
                                    color={
                                        phaseLower === 'main' && endTurnConfirming
                                            ? 'error'
                                            : 'primary'
                                    }
                                    onClick={onNextAction}
                                    disabled={
                                        !canPerformGameAction() ||
                                        !!battle ||
                                        resolvingEffect ||
                                        targeting.active ||
                                        (deckSearchRef.current?.active) ||
                                        !!triggerPending
                                    }
                                >
                                    {nextActionLabel}
                                </Button>
                            )}
                        </Stack>
                    )}
                    {isLoggedIn && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1
                            }}
                        >
                            {gameMode && (
                                <Button
                                    size='small'
                                    variant='outlined'
                                    color='warning'
                                    onClick={leaveGame}
                                >
                                    Leave Game
                                </Button>
                            )}
                            <Button
                                size='small'
                                variant='contained'
                                onClick={() => setDeckOpen(true)}
                            >
                                Deck Builder
                            </Button>
                            <Typography
                                variant='body2'
                                sx={{ opacity: 0.9, lineHeight: 1.2 }}
                            >
                                Signed in as: <strong>{user}</strong>
                            </Typography>
                            <Button
                                size='small'
                                variant='outlined'
                                onClick={logout}
                            >
                                Sign out
                            </Button>
                        </Box>
                    )}
                </Box>
                {loading ? (
                    <Typography>Checking session…</Typography>
                ) : !isLoggedIn ? (
                    <LoginRegister compact={compact} />
                ) : !gameMode ? (
                    <GameModeSelect onSelectMode={setGameMode} />
                ) : (
                    <Box sx={{ mt: 0 }}>
                        <Divider sx={{ mt: -0.5, mb: 0 }} />
                        <Box
                            display='flex'
                            flexDirection={{ xs: 'column', md: 'row' }}
                            gap={compact ? 2 : 3}
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden'
                            }}
                        >
                            {/* Play Area Board (CardViewer overlay inside) */}
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
                                getCardCost={(id, side, section, keyName, index) =>
                                    getCardCost(id, side, section, keyName, index)
                                }
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
                                openingHandRef={openingHandRef}
                                openingHandShown={openingHandShown}
                                setOpeningHandShown={setOpeningHandShown}
                                currentHandSide={currentHandSide}
                                onHandSelected={handleHandSelected}
                                firstPlayer={firstPlayer}
                                deckSearchRef={deckSearchRef}
                                library={library}
                                oppLibrary={oppLibrary}
                                setLibrary={setLibrary}
                                setOppLibrary={setOppLibrary}
                                getAssetForId={getAssetForId}
                                createCardBacks={createCardBacks}
                                appendLog={appendLog}
                                getCardMeta={(id) => metaById.get(id) || null}
                                selectedCard={selectedCard}
                                cardError={cardError}
                                loadingCards={loadingCards}
                                log={log}
                                setTurnSide={setTurnSide}
                                setTurnNumber={setTurnNumber}
                                executeRefreshPhase={executeRefreshPhase}
                                setPhase={setPhase}
                            />
                            {/* Activity Log Panel */}
                            <Box
                                sx={{
                                    width: {
                                        xs: '100%',
                                        md: compact ? 380 : 440
                                    },
                                    flexShrink: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: 0
                                }}
                            >
                                <Typography
                                    variant={compact ? 'h6' : 'h5'}
                                    gutterBottom
                                    sx={{ mb: compact ? 1 : 2, flexShrink: 0 }}
                                >
                                    Activity Log
                                </Typography>
                                <Box
                                    sx={{
                                        border: '1px dashed',
                                        borderColor: 'divider',
                                        p: 1,
                                        borderRadius: 1,
                                        flex: 1,
                                        minHeight: 0,
                                        height: 200,
                                        overflow: 'auto',
                                        bgcolor: 'background.default'
                                    }}
                                >
                                    {log.map((entry, i) => (
                                        <Typography
                                            key={i}
                                            variant='caption'
                                            display='block'
                                        >
                                            {entry}
                                        </Typography>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>

            {isLoggedIn && (
                <DeckBuilder
                    open={deckOpen}
                    onClose={() => setDeckOpen(false)}
                />
            )}

            {actionOpen && ( /* Actions Panel */
                <ClickAwayListener
                    onClickAway={() => {
                        if (targeting?.active && sameOrigin(targeting.origin, actionSource)) { //. Suspend targeting if active
                            suspendTargeting();
                        }
                        setResolvingEffect(false);
                        closeActionPanel();
                    }}
                >
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
                            resumeTargeting={resumeTargeting}
                            confirmTargeting={confirmTargeting}
                            targeting={targeting}
                            getCardMeta={(id) => metaById.get(id) || null}
                            applyPowerMod={applyPowerMod}
                            registerUntilNextTurnEffect={registerUntilNextTurnEffect}
                            grantTempKeyword={addTempKeyword}
                            disableKeyword={addDisabledKeyword}
                            giveDonToCard={giveDonToCard}
                            moveDonFromCostToCard={moveDonFromCostToCard}
                            returnDonFromCardToDeck={returnDonToDonDeckFromCard}
                            detachDonFromCard={detachDonFromCard}
                            startDeckSearch={startDeckSearch}
                            returnCardToDeck={returnCardToDeck}
                            restCard={restCard}
                            setActive={setActive}
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
                            drawCards={drawCard}
                            lockCurrentAttack={lockCurrentAttack}
                            abilityUsage={
                                actionSource
                                    ? oncePerTurnUsage[
                                    modKey(
                                        actionSource.side || 'player',
                                        actionSource.section || 'char',
                                        actionSource.keyName || 'char',
                                        _.isNumber(actionSource.index) ? actionSource.index : 0
                                    )
                                    ]
                                    : undefined
                            }
                        >
                            {actionSource && (
                                (actionSource.side === 'player' &&
                                    actionSource.section === 'bottom' &&
                                    actionSource.keyName === 'hand') ||
                                (actionSource.side === 'opponent' &&
                                    actionSource.section === 'top' &&
                                    actionSource.keyName === 'hand')
                            ) ? ( /* Hand Card Actions */
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography
                                        variant='caption'
                                        display='block'
                                        sx={{ mb: 1 }}
                                    >
                                        {(() => {
                                            if (
                                                battle &&
                                                battle.step === 'counter' &&
                                                actionSource.side === battle?.target?.side
                                            ) { //. Counter Step: defending side
                                                return 'Counter Step: use counters or counter events.';
                                            }
                                            const side = actionSource?.side === 'opponent'
                                                ? 'opponent'
                                                : 'player';
                                            if (battle) return 'Cannot play during battle.';
                                            if (!canPlayNow(side)) return 'Cannot play now (must be your Main Phase).';

                                            const section = actionSource?.section || 'bottom';
                                            const keyName = actionSource?.keyName || 'hand';
                                            const index = actionCardIndex >= 0 ? actionCardIndex : 0;
                                            const cost = actionCard
                                                ? getCardCost(actionCard.id, side, section, keyName, index)
                                                : 0;
                                            const ok = hasEnoughDonFor(side, cost);

                                            return ok
                                                ? `Playable now (${side}). Cost: ${cost} DON.`
                                                : `Need ${cost} active DON (${side}).`;
                                        })()}
                                    </Typography>
                                    {(() => {
                                        if (
                                            battle &&
                                            battle.target &&
                                            (battle.step === 'counter' || battle.step === 'block') &&
                                            actionSource.side === battle.target.side
                                        ) {
                                            const meta = metaById.get(actionCard?.id);
                                            if (!meta) return null;

                                            const elements = [];
                                            const counterVal = _.isNumber(meta?.counter)
                                                ? meta.counter
                                                : (meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0);

                                            if (counterVal) {
                                                elements.push(
                                                    <Button
                                                        key='counterDiscard'
                                                        size='small'
                                                        variant='contained'
                                                        color='error'
                                                        onClick={() => { addCounterFromHand(actionCardIndex); }}
                                                    >
                                                        Discard for Counter +{counterVal}
                                                    </Button>
                                                );
                                            }

                                            //. Schema uses cardType; legacy uses category
                                            const cardType = meta.cardType || meta.category;
                                            const isEvent = cardType === 'event' || cardType === 'Event';
                                            const hasCounterKeyword = hasKeyword(meta.keywords, 'counter');

                                            if (isEvent && hasCounterKeyword) {
                                                const cost = _.get(meta, 'cost', _.get(meta, 'stats.cost', 0)) || 0;
                                                const canPay = hasEnoughDonFor(battle.target.side, cost);
                                                elements.push(
                                                    <Button
                                                        key='counterEvent'
                                                        size='small'
                                                        variant='outlined'
                                                        disabled={!canPay}
                                                        onClick={() => {
                                                            playCounterEventFromHand(actionCardIndex);
                                                            closeActionPanel();
                                                        }}
                                                    >
                                                        Play Counter Event (Cost {cost})
                                                    </Button>
                                                );
                                            }

                                            if (!elements.length) {
                                                return (
                                                    <Typography variant='caption'>
                                                        No counter on this card.
                                                    </Typography>
                                                );
                                            }

                                            return (
                                                <Stack direction='row' spacing={1}>
                                                    {elements}
                                                </Stack>
                                            );
                                        }

                                        const side = actionSource?.side === 'opponent'
                                            ? 'opponent'
                                            : 'player';
                                        const section = actionSource?.section || 'bottom';
                                        const keyName = actionSource?.keyName || 'hand';
                                        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
                                        const cost = actionCard
                                            ? getCardCost(actionCard.id, side, section, keyName, index)
                                            : 0;
                                        const ok = canPlayNow(side) && hasEnoughDonFor(side, cost);

                                        return (
                                            <Button
                                                variant='contained'
                                                disabled={!ok}
                                                onClick={playSelectedCard}
                                            >
                                                Play to Character Area
                                            </Button>
                                        );
                                    })()}
                                </>
                            ) : (
                                <Typography
                                    variant='caption'
                                    display='block'
                                    sx={{ mb: 1 }}
                                >
                                    {phaseLower === 'main' && actionSource?.side === turnSide
                                        ? 'Select an action for this card.'
                                        : 'Actions are limited outside the Main Phase or when it\'s not your turn.'}
                                </Typography>
                            )}
                            {(() => { /* Attack Controls */
                                const isOnFieldChar =
                                    actionSource &&
                                    actionSource.side === turnSide &&
                                    actionSource.section === 'char' &&
                                    actionSource.keyName === 'char';
                                const isLeader =
                                    actionSource &&
                                    actionSource.side === turnSide &&
                                    actionSource.section === 'middle' &&
                                    actionSource.keyName === 'leader';

                                if (!isOnFieldChar && !isLeader) return null;

                                const cardObj = actionCard;
                                const idx = actionCardIndex;
                                const attackingSide = actionSource?.side || 'player';
                                const isAttacking = battle && (
                                    (battle.attacker.section === 'char' &&
                                        battle.attacker.index === idx &&
                                        battle.attacker.side === attackingSide) ||
                                    (battle.attacker.section === 'middle' &&
                                        isLeader &&
                                        battle.attacker.side === attackingSide)
                                );

                                //. Hide controls only during battle steps AFTER declaring (block, counter, damage)
                                if (isAttacking && battle.step !== 'declaring') return null;

                                //. Determine if card can attack
                                const canAtk = isLeader
                                    ? canLeaderAttack(cardObj, attackingSide)
                                    : canCharacterAttack(cardObj, attackingSide, idx);
                                
                                //. During declaring phase, show controls for the attacker even if they can't attack (they're rested)
                                const isDeclaring = isAttacking && battle?.step === 'declaring';
                                
                                //. Show controls if: can attack normally, OR is currently declaring an attack
                                if (!canAtk && !isDeclaring) return null;

                                const selecting =
                                    targeting.active &&
                                    currentAttack && ( //. Check if selecting target
                                        (currentAttack.isLeader && isLeader) ||
                                        (currentAttack.index === idx && !currentAttack.isLeader)
                                    );

                                if (selecting) {
                                    return (
                                        <Stack
                                            direction='row'
                                            spacing={1}
                                            sx={{
                                                mt: 1,
                                                alignItems: 'center'
                                            }}
                                        >
                                            {(() => { //. Derive target label
                                                let label = '';
                                                if (
                                                    Array.isArray(targeting.selected) &&
                                                    targeting.selected.length
                                                ) {
                                                    const t = targeting.selected[targeting.selected.length - 1];
                                                    if (t.section === 'middle' && t.keyName === 'leader') {
                                                        label = 'Opponent Leader';
                                                    }
                                                    if (t.section === 'char' && t.keyName === 'char') {
                                                        const arr = areas?.opponent?.char || [];
                                                        const tc = arr[t.index];
                                                        label = tc?.id || 'Opponent Character';
                                                    }
                                                }
                                                return (
                                                    <Chip
                                                        size='small'
                                                        color='warning'
                                                        label={
                                                            label ? `Target: ${label}` : 'Select a target'
                                                        }
                                                    />
                                                );
                                            })()}
                                            <Button
                                                size='small'
                                                variant='contained'
                                                disabled={(targeting.selected?.length || 0) < 1}
                                                onClick={confirmTargeting}
                                            >
                                                Confirm Attack
                                            </Button>
                                            <Button
                                                size='small'
                                                variant='outlined'
                                                onClick={cancelAttack}
                                                disabled={attackLocked}
                                            >
                                                Cancel Attack
                                            </Button>
                                        </Stack>
                                    );
                                }

                                return (
                                    <Stack
                                        direction='row'
                                        spacing={1}
                                        sx={{ mt: 1 }}
                                    >
                                        <Button
                                            size='small'
                                            variant='contained'
                                            onClick={() =>
                                                isLeader
                                                    ? beginAttackForLeader(cardObj, attackingSide)
                                                    : beginAttackForCard(cardObj, idx, attackingSide)
                                            }
                                        >
                                            Attack
                                        </Button>
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

            {triggerPending && ( /* Trigger Activation Modal (CR 4-6-3, 10-1-5) */
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
                        <Typography
                            variant='h6'
                            fontWeight={700}
                            color='warning.main'
                        >
                            [Trigger] Card Revealed!
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <img
                                src={triggerPending.card.full || triggerPending.card.thumb}
                                alt={triggerPending.card.id}
                                style={{
                                    width: 200,
                                    height: 'auto',
                                    borderRadius: 8
                                }}
                            />
                        </Box>
                        <Typography variant='body1'>
                            <strong>
                                {triggerPending.side === 'player' ? 'You' : 'Opponent'}
                            </strong>{' '}
                            revealed <strong>{triggerPending.card.id}</strong> from
                            Life.
                        </Typography>
                        <Typography
                            variant='body2'
                            color='text.secondary'
                        >
                            Choose to activate its [Trigger] effect, or add it to
                            hand.
                        </Typography>
                        <Stack direction='row' spacing={2}>
                            <Button
                                fullWidth
                                variant='contained'
                                color='warning'
                                onClick={onTriggerActivate}
                            >
                                Activate [Trigger]
                            </Button>
                            <Button
                                fullWidth
                                variant='outlined'
                                onClick={onTriggerDecline}
                            >
                                Add to Hand
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}

            {/* Dice Roll for game start (self-vs-self mode) */}
            <DiceRoll
                visible={gameMode === 'self-vs-self' && setupPhase === 'dice' && library.length > 0}
                onComplete={handleDiceRollComplete}
            />
        </Container>
    );
}
