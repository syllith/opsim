/**
 * Actions.jsx
 * 
 * Universal panel for displaying and activating card abilities.
 * Displays a fixed panel in the bottom-right corner showing card information,
 * keywords, abilities, and activation controls based on game state.
 * 
 * Key Features:
 * - Auto-triggers On Play abilities when cards enter the field
 * - Validates ability activation based on phase, turn, and game conditions
 * - Handles structured action sequences (modifyStat, keywordEffect, search, etc.)
 * - Manages targeting UI and multi-step ability resolution
 * - Tracks once-per-turn ability usage
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import _ from 'lodash';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Stack,
  Divider,
  Button,
  Chip,
  Alert
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TargetSelectionUI from './TargetSelectionUI';
import AbilityList from './AbilityList';
import {
  listValidTargets as listValidTargetsUtil,
  resolveActionTargetSide as resolveActionTargetSideUtil,
  evaluateAbilityTargetAvailability as evaluateAbilityTargetAvailabilityUtil,
  abilityHasAnySelectableTargets as abilityHasAnySelectableTargetsUtil,
  evaluateActivatableAbilities as evaluateActivatableAbilitiesUtil,
  completeAbilityActivation as completeAbilityActivationUtil,
  createTargetValidator,
  createStateValidator
} from './actionMechanics';

//. Helper to determine chip color for keywords
const getKeywordColor = (keyword) => {
  const lower = _.toLower(keyword || '');
  if (lower.includes('rush')) return 'warning';
  if (lower.includes('blocker')) return 'info';
  if (lower.includes('double attack')) return 'error';
  return 'default';
};

export default function Actions({
  //. UI Props
  title = 'Actions',
  onClose,
  width = 420,
  height,
  maxHeight = 'calc(100vh - 32px)',
  children,

  //. Card Data
  card,
  cardMeta,
  cardIndex,
  actionSource,

  //. Game State
  phase,
  turnSide,
  turnNumber,
  isYourTurn,
  areas,
  battle,

  //. Targeting System
  startTargeting,
  cancelTargeting,
  suspendTargeting,
  resumeTargeting,
  confirmTargeting,
  targeting,

  //. Card Metadata
  getCardMeta,

  //. Effect Handlers
  applyPowerMod,
  registerUntilNextTurnEffect,
  grantTempKeyword,
  disableKeyword,
  moveDonFromCostToCard,
  startDeckSearch,
  returnCardToDeck,
  restCard,
  setActive,
  payLife,
  removeCardByEffect,
  setResolvingEffect,
  getTotalPower,
  markAbilityUsed,
  abilityUsage,
  drawCards,
  returnDonFromCardToDeck,
  detachDonFromCard,

  //. Battle Handlers
  battleApplyBlocker,

  //. Attack Lock (for When Attacking abilities)
  lockCurrentAttack
}) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  //. Track which abilities have been used this turn (for once-per-turn abilities and On Play)
  const [abilityUsed, setAbilityUsed] = useState({});

  useEffect(() => {
    setAbilityUsed(abilityUsage || {});
  }, [abilityUsage]);

  //. Currently selected ability index (during targeting/resolution)
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState(null);

  //. Track current action being processed for multi-action abilities
  const [currentActionStep, setCurrentActionStep] = useState(null);

  //. Tracks whether On Play ability was auto-triggered for this card instance
  const [autoTriggeredOnPlay, setAutoTriggeredOnPlay] = useState(false);

  //. Track if we're actively processing a multi-step ability (ref to avoid stale closures)
  const processingActionsRef = useRef(false);

  //. Store the action queue and processNext function to persist across renders
  const actionQueueRef = useRef(null);
  const processNextRef = useRef(null);
  const cancelProcessingRef = useRef(false);

  // ============================================================================
  // LIFECYCLE & CLEANUP
  // ============================================================================

  //. Helper to compare action source origins for targeting restoration
  const isSameOrigin = useCallback((a, b) => {
    if (!a || !b) return false;
    const keys = ['side', 'section', 'keyName', 'index'];
    return _.isEqual(_.pick(a, keys), _.pick(b, keys));
  }, []);

  //. Abort ability processing and reset related state
  const abortAbilityProcessing = useCallback(() => {
    cancelProcessingRef.current = true;
    processingActionsRef.current = false;
    actionQueueRef.current = null;
    processNextRef.current = null;
    setSelectedAbilityIndex(null);
    setCurrentActionStep(null);
    setResolvingEffect?.(false);
  }, [setResolvingEffect]);

  //. Handles panel close with targeting cleanup
  const handlePanelClose = useCallback(() => {
    try {
      //. Don't cancel attack targeting when action panel closes - attacks should persist
      if (targeting?.type === 'attack') {
        //. Attack targeting should continue even when panel closes
        onClose?.();
        return;
      }

      if (targeting?.active && isSameOrigin(targeting.origin, actionSource)) {
        cancelTargeting?.();
      } else if (targeting?.active) {
        suspendTargeting?.();
      }
    } catch { /* noop */ }

    abortAbilityProcessing();
    onClose?.();
  }, [
    targeting?.active,
    targeting?.origin,
    targeting?.type,
    actionSource,
    cancelTargeting,
    suspendTargeting,
    isSameOrigin,
    abortAbilityProcessing,
    onClose
  ]);

  //. Restore selection / cleanup based on targeting lifecycle
  useEffect(() => {
    if (targeting?.active && targeting?.suspended && isSameOrigin(targeting.origin, actionSource)) {
      if (typeof targeting.abilityIndex === 'number') {
        setSelectedAbilityIndex(targeting.abilityIndex);
      }
    } else if (!targeting?.active && selectedAbilityIndex !== null && !processingActionsRef.current) {
      setSelectedAbilityIndex(null);
      setResolvingEffect?.(false);
    }
  }, [
    targeting?.active,
    targeting?.suspended,
    targeting?.origin,
    targeting?.abilityIndex,
    actionSource,
    selectedAbilityIndex,
    setResolvingEffect,
    isSameOrigin
  ]);

  //. Keep latest targeting / actionSource for unmount cleanup
  const latestTargetingRef = useRef(targeting);
  const latestActionSourceRef = useRef(actionSource);

  useEffect(() => {
    latestTargetingRef.current = targeting;
  }, [targeting]);

  useEffect(() => {
    latestActionSourceRef.current = actionSource;
  }, [actionSource]);

  //. Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        const currentTargeting = latestTargetingRef.current;
        const currentSource = latestActionSourceRef.current;

        //. Don't cancel attack targeting when action panel closes - attacks should persist
        if (currentTargeting?.type === 'attack') {
          //. Attack targeting should continue even when panel closes
          return;
        }

        if (currentTargeting?.active && isSameOrigin(currentTargeting.origin, currentSource)) {
          cancelTargeting?.();
        } else if (currentTargeting?.active) {
          suspendTargeting?.();
        }

        abortAbilityProcessing();
      } catch { /* noop */ }
    };
  }, [abortAbilityProcessing, cancelTargeting, suspendTargeting, isSameOrigin]);

  //. Ensure resolving flag is cleared if ability selection disappears unexpectedly
  useEffect(() => {
    if (selectedAbilityIndex === null && !processingActionsRef.current && setResolvingEffect) {
      setResolvingEffect(false);
    }
  }, [selectedAbilityIndex, setResolvingEffect]);

  // ============================================================================
  // CARD DATA EXTRACTION
  // ============================================================================

  //. Extract core card data with safe defaults
  const cardData = useMemo(() => ({
    cardId: _.get(card, 'id', null),
    abilities: _.get(cardMeta, 'abilities', []) || [],
    keywords: _.get(cardMeta, 'keywords', []) || [],
    printedText: _.get(cardMeta, 'printedText', ''),
    cardName: _.get(cardMeta, 'cardName', _.get(cardMeta, 'name', _.get(card, 'id', ''))),
    category: (() => {
      const ct = _.get(cardMeta, 'cardType');
      if (!ct) return _.get(cardMeta, 'category', 'Unknown');
      return ct === 'leader' ? 'Leader' : ct === 'character' ? 'Character' : ct === 'event' ? 'Event' : ct === 'stage' ? 'Stage' : ct === 'don' ? 'DON!!' : 'Unknown';
    })(),
    basePower: _.get(cardMeta, 'power', _.get(cardMeta, 'stats.power', 0)) || 0,
    cost: _.get(cardMeta, 'cost', _.get(cardMeta, 'stats.cost', 0)),
    life: _.get(cardMeta, 'life', _.get(cardMeta, 'stats.life', null)),
    counterValue: (() => {
      const c = _.get(cardMeta, 'counter');
      if (_.isNumber(c) && c > 0) return c;
      return _.get(cardMeta, 'stats.counter.present')
        ? _.get(cardMeta, 'stats.counter.value', null)
        : null;
    })()
  }), [card, cardMeta]);

  const {
    cardId,
    abilities,
    keywords,
    cardName,
    printedText,
    category,
    basePower,
    cost,
    life,
    counterValue
  } = cardData;

  //. Filter out ability types from keyword display to avoid duplication
  const displayKeywords = useMemo(() => {
    const abilityTypeSet = new Set(
      _.map(abilities, (a) => _.toLower(a?.type || a?.typeKey || ''))
    );

    return _.filter(keywords, (k) => {
      const lower = _.toLower(k || '');
      return !abilityTypeSet.has(lower);
    });
  }, [abilities, keywords]);

  //. Derive a best-effort description for an ability using schema printedText only
  const getAbilityDescription = useCallback((ability, index) => {
    if (!ability) return '';
    const text = typeof printedText === 'string' ? printedText : '';
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const timingLabel = _.get(ability, 'timing');

    //. Map schema timing to likely printed tokens (looser for opponent attack variants)
    const timingTokens = {
      onPlay: ['[On Play]'],
      whenAttacking: ['[When Attacking]'],
      onOpponentsAttack: [
        "[On Opponent's Attack]",
        "[On Opponents Attack]",
        "[On Your Opponent's Attack]"
      ],
      counter: ['[Counter]', 'Counter'],
      trigger: ['[Trigger]', 'Trigger'],
      static: []
    };

    const candidates = timingTokens[timingLabel] || [];

    //. Try to find a line containing any of the expected tokens
    for (const token of candidates) {
      const match = lines.find((line) =>
        token && line.toLowerCase().includes(token.toLowerCase())
      );
      if (match) return match;
    }

    //. Fallback: if the first line looks like a pure keyword (e.g., [Blocker]),
    //. prefer the next non-empty line for the first ability.
    const nonEmpty = lines.filter(Boolean);
    if (index === 0 && nonEmpty.length > 1) {
      const first = nonEmpty[0];
      if (/^\[[^\]]+\]$/.test(first)) {
        return nonEmpty[1];
      }
    }

    return nonEmpty[index] || nonEmpty[0] || '';
  }, [printedText]);

  //. Verify this card instance is still on the field at its expected location
  const isOnField = useMemo(() => {
    if (!actionSource || !areas || !card?.id) return false;

    const { side, section, keyName, index } = actionSource;
    const sideLoc = side === 'player'
      ? _.get(areas, 'player')
      : _.get(areas, 'opponent');

    let cardInstance = null;

    if (section === 'char' && keyName === 'char') {
      cardInstance = _.get(sideLoc, ['char', index]);
    } else if (section === 'middle' && keyName === 'leader') {
      cardInstance = _.get(sideLoc, ['middle', 'leader', 0]);
    }

    return cardInstance?.id === card.id;
  }, [actionSource, areas, card?.id]);

  //. Determine if this card was just played this turn (for On Play auto-trigger)
  const wasJustPlayed = useMemo(
    () => Boolean(actionSource?.justPlayed && card?.enteredTurn === turnNumber),
    [actionSource?.justPlayed, card?.enteredTurn, turnNumber]
  );

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  //. Consolidated utility wrapper object
  const utilityHelpers = useMemo(() => ({
    listValidTargets: (sideSpec, targetType, opts = {}) =>
      listValidTargetsUtil(areas, getCardMeta, getTotalPower, sideSpec, targetType, opts),
    resolveActionTargetSide: (relativeSide) =>
      resolveActionTargetSideUtil(actionSource, relativeSide),
    evaluateAbilityTargetAvailability: (ability) =>
      evaluateAbilityTargetAvailabilityUtil(
        ability,
        areas,
        getCardMeta,
        getTotalPower,
        actionSource
      ),
    abilityHasAnySelectableTargets: (ability) =>
      abilityHasAnySelectableTargetsUtil(
        ability,
        areas,
        getCardMeta,
        getTotalPower,
        actionSource
      )
  }), [areas, getCardMeta, getTotalPower, actionSource]);

  const {
    listValidTargets,
    resolveActionTargetSide,
    abilityHasAnySelectableTargets
  } = utilityHelpers;

  // ============================================================================
  // ABILITY ACTIVATION LOGIC
  // ============================================================================

  //. Determine which abilities can be activated based on current game state
  const activatableAbilities = useMemo(() => {
    const isProcessing = processingActionsRef.current && selectedAbilityIndex !== null;
    const tempUsed = isProcessing
      ? { ...abilityUsed, [selectedAbilityIndex]: true }
      : abilityUsed;

    return evaluateActivatableAbilitiesUtil(abilities, {
      phase,
      isYourTurn,
      battle,
      cardId,
      abilityUsed: tempUsed,
      isOnField,
      wasJustPlayed,
      areas,
      actionSource,
      getCardMeta,
      getTotalPower,
      resolvingAbilityIndex: isProcessing ? selectedAbilityIndex : null
    });
  }, [
    abilities,
    phase,
    isYourTurn,
    battle,
    cardId,
    abilityUsed,
    isOnField,
    wasJustPlayed,
    areas,
    actionSource,
    getCardMeta,
    getTotalPower,
    selectedAbilityIndex
  ]);

  //. Handles activation of a specific ability index
  const activateAbility = useCallback((abilityIndex) => {
    const ability = activatableAbilities[abilityIndex];
    if (!ability) return;

    const abilityType = ability.typeKey || ability.type || '';
    const isOnPlay = abilityType === 'On Play';

    //. For non-On Play abilities, require canActivate
    if (!isOnPlay && !ability.canActivate) return;

    const actionsArray = Array.isArray(ability.actions) ? ability.actions : [];
    if (!Array.isArray(actionsArray)) return;

    //. Store cost for later payment
    const cost = ability.cost;
    const costType = _.get(cost, 'type', '');

    //. Completes ability activation: mark used and pay auto-costs (restThis, etc.)
    const completeAbilityActivation = (effectApplied = false) => {
      completeAbilityActivationUtil({
        ability,
        abilityIndex,
        cost,
        actionSource,
        cardIndex,
        setAbilityUsed,
        returnCardToDeck,
        removeCardByEffect,
        restCard,
        payLife,
        markAbilityUsed,
        effectApplied,
        lockCurrentAttack
      });
    };

    //. Check if effect has structured actions array
    const hasStructuredActions = Array.isArray(actionsArray);

    //. Helper to execute the main ability actions after any interactive costs are paid
    const executeAbilityActions = () => {
      if (!hasStructuredActions || actionsArray.length === 0) {
        completeAbilityActivation();
        return;
      }
      
      cancelProcessingRef.current = false;

      const actionsQueue = [...actionsArray];
      let effectApplied = false; // tracks if any action actually affected a card/state
      const cumulativeTargets = [];   // remember prior selections within this ability resolution
      const pendingPowerDeltas = [];  // track power changes applied earlier in the sequence

      //. Snapshot action source at activation start
      const activationSource = actionSource ? _.cloneDeep(actionSource) : null;

      const selectCandidates = (sideSpec, targetType, extraOpts = {}) =>
        listValidTargets(sideSpec, targetType, {
          ...extraOpts,
          pendingPowerDeltas
        });

      const addPendingPowerDelta = (targetCtx, delta) => {
        if (!targetCtx) return;
        if (typeof delta !== 'number' || delta === 0) return;
        effectApplied = true;
        pendingPowerDeltas.push({
          side: targetCtx.side,
          section: targetCtx.section,
          keyName: targetCtx.keyName,
          index: targetCtx.index,
          delta
        });
      };

      const clearPendingForTarget = (targetCtx) => {
        if (!targetCtx || pendingPowerDeltas.length === 0) return;
        for (let i = pendingPowerDeltas.length - 1; i >= 0; i--) {
          const entry = pendingPowerDeltas[i];
          if (
            entry.side === targetCtx.side &&
            entry.section === targetCtx.section &&
            entry.keyName === targetCtx.keyName &&
            entry.index === targetCtx.index
          ) {
            pendingPowerDeltas.splice(i, 1);
          }
        }
      };

      //. Store in refs to persist across renders
      actionQueueRef.current = actionsQueue;

      //. Check if we're activating an On Attack ability during attack targeting
      const isOnAttackDuringTargeting =
        abilityType === 'On Attack' &&
        targeting?.active &&
        targeting?.type === 'attack' &&
        !targeting?.suspended;

      //. If so, suspend the attack targeting so ability targeting can proceed
      if (isOnAttackDuringTargeting && typeof suspendTargeting === 'function') {
        suspendTargeting();
      }

      if (setResolvingEffect) setResolvingEffect(true);
      processingActionsRef.current = true;

      //. Helper: compute human-readable description for an action
      const getActionDescription = (action) => {
        switch (action.type) {
          case 'modifyStat': {
            const amount = action.amount || 0;
            const sign = amount >= 0 ? '+' : '';
            const tgt = typeof action.target === 'object' ? action.target : {};
            const tt = tgt.type === 'leaderOrCharacter' ? 'card' : (tgt.type || 'card');
            const min = _.isNumber(tgt.min) ? tgt.min : 1;
            const max = _.isNumber(tgt.max) ? tgt.max : 1;
            if (min === 0) return `Give up to ${max} ${tt}${max > 1 ? 's' : ''} ${sign}${amount} power`;
            return `Give ${max} ${tt}${max > 1 ? 's' : ''} ${sign}${amount} power`;
          }
          case 'keywordEffect': {
            const op = action.operation || 'grant';
            const kw = action.keyword || 'keyword';
            if (op === 'grant') return `Grant [${kw}]`;
            if (op === 'revoke') return `Revoke [${kw}]`;
            return `Apply [${kw}] keyword`;
          }
          case 'ko': {
            //. Schema uses target object; legacy uses targetType/maxTargets
            const tgtSel = typeof action.target === 'object' ? action.target : {};
            const targetType = tgtSel.type === 'character' || action.targetType === 'character' ? 'Character' : 'card';
            const max = _.isNumber(tgtSel.max) ? tgtSel.max : (action.maxTargets ?? 1);
            const powerLimit = action.powerLimit || tgtSel.powerLimit;
            const powerLimitStr = powerLimit
              ? ` with ${powerLimit} power or less`
              : '';
            return `K.O. ${max} ${targetType}${max > 1 ? 's' : ''}${powerLimitStr}`;
          }
          case 'giveDon': {
            const qty = action.count || action.quantity || 1;
            return `Give ${qty} DON!!`;
          }
          case 'draw': {
            const qty = action.count || action.amount || action.quantity || 1;
            return `Draw ${qty} card${qty > 1 ? 's' : ''}`;
          }
          case 'returnDon': {
            const qty = action.count || 1;
            return `Return ${qty} DON!! to DON deck`;
          }
          case 'detachDon': {
            const qty = action.count || 1;
            return `Detach ${qty} DON!! to cost area`;
          }
          case 'setState': {
            const state = action.state || 'rested';
            const targetType = action.target?.type || 'card';
            return state === 'rested' ? `Rest ${targetType}` : `Set ${targetType} active`;
          }
          case 'trashFromHand': {
            const min = action.minCards ?? 1;
            const max = action.maxCards ?? 1;
            if (min === 0) {
              return `Trash up to ${max} card${max > 1 ? 's' : ''} from hand`;
            }
            return `Trash ${max} card${max > 1 ? 's' : ''} from hand`;
          }
          case 'restrict': {
            const kind = action.restrictionKind || 'blocker';
            return `Disable [${kind.charAt(0).toUpperCase() + kind.slice(1)}]`;
          }
          case 'search':
            return 'Search deck';
          default:
            return `Process ${action.type}`;
        }
      };

      //. Main processing loop for structured actions
      const processNext = () => {
        if (cancelProcessingRef.current) {
          cancelProcessingRef.current = false;
          processingActionsRef.current = false;
          actionQueueRef.current = null;
          processNextRef.current = null;
          setSelectedAbilityIndex(null);
          if (setResolvingEffect) setResolvingEffect(false);
          return;
        }

        const queue = actionQueueRef.current;
        if (!queue || queue.length === 0) {
          //. All actions complete; finalize ability
          processingActionsRef.current = false;
          actionQueueRef.current = null;
          processNextRef.current = null;
          cancelProcessingRef.current = false;
          completeAbilityActivation(effectApplied);
          setSelectedAbilityIndex(null);
          setCurrentActionStep(null);
          if (setResolvingEffect) setResolvingEffect(false);

          //. If we suspended attack targeting for this On Attack ability, resume
          if (
            abilityType === 'On Attack' &&
            targeting?.suspended &&
            targeting?.type === 'attack' &&
            typeof resumeTargeting === 'function'
          ) {
            resumeTargeting();
          }

          return;
        }

        const action = queue.shift();

        //. Update current action step for display
        const totalActions = actionsArray.length;
        const currentStep = totalActions - queue.length;
        setCurrentActionStep({
          step: currentStep,
          total: totalActions,
          description: getActionDescription(action)
        });

        switch (action.type) {
          //. Handle conditional wrapper - unwrap and queue inner actions
          case 'conditional': {
            //. TODO: Actually evaluate condition against game state
            //. For now, assume condition is met and process inner actions
            const innerActions = action.actions || [];
            if (innerActions.length > 0) {
              //. Prepend inner actions to the queue so they execute next
              actionQueueRef.current = [...innerActions, ...queue];
            }
            processNextRef.current && processNextRef.current();
            break;
          }

          //. Schema keywordEffect: grant/revoke/static keyword to targets
          case 'keywordEffect': {
            const operation = action.operation || 'grant';
            const keyword = action.keyword || '';
            const duration = action.duration || 'thisTurn';

            //. Resolve selector (object or string ref)
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string') {
              if (action.target === 'thisCard') {
                tgtSel = { type: 'thisCard', side: 'self' };
              } else if (ability.selectors?.[action.target]) {
                tgtSel = ability.selectors[action.target];
              }
            }

            //. If targeting self card
            if (tgtSel.type === 'thisCard') {
              if (actionSource) {
                let expireOnSide = null;
                if (duration === 'thisTurn') {
                  expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
                } else if (duration === 'untilEndOfOpponentsNextTurn' || duration === 'untilOpponentsNextTurn') {
                  expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
                }

                if (operation === 'grant' || operation === 'static') {
                  grantTempKeyword?.(
                    actionSource.side,
                    actionSource.section,
                    actionSource.keyName,
                    actionSource.index || 0,
                    keyword,
                    operation === 'static' ? null : expireOnSide
                  );
                } else if (operation === 'revoke') {
                  disableKeyword?.(
                    actionSource.side,
                    actionSource.section,
                    actionSource.keyName,
                    actionSource.index || 0,
                    keyword,
                    expireOnSide
                  );
                }
              }
              processNextRef.current && processNextRef.current();
              break;
            }

            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'character');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : (tgtSel.side || 'opponent');
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;

            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            } else if (duration === 'untilEndOfOpponentsNextTurn' || duration === 'untilOpponentsNextTurn') {
              expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
            }

            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const preCandidates = selectCandidates(actualSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                action,
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach((t) => {
                if (operation === 'grant' || operation === 'static') {
                  grantTempKeyword?.(
                    t.side,
                    t.section,
                    t.keyName,
                    t.index,
                    keyword,
                    operation === 'static' ? null : expireOnSide
                  );
                } else if (operation === 'revoke') {
                  disableKeyword?.(
                    t.side,
                    t.section,
                    t.keyName,
                    t.index,
                    keyword,
                    expireOnSide
                  );
                }
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              if (targets && targets.length) {
                effectApplied = true;
              }
              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'modifyStat': {
            if (action.stat !== 'power') {
              processNextRef.current && processNextRef.current();
              break;
            }
            const amount = action.amount || 0;

            //. Resolve target selector - can be an object or a string reference to ability.selectors
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string' && ability.selectors?.[action.target]) {
              tgtSel = ability.selectors[action.target];
            }

            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'any');
            //. Map schema side to relative side for resolution
            //. 'self' means the card's controller, 'opponent' means the opposing player
            let targetSideRelative = 'opponent'; // default
            if (tgtSel.side === 'self') {
              targetSideRelative = 'player'; // means controller's side
            } else if (tgtSel.side === 'opponent') {
              targetSideRelative = 'opponent';
            }
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;
            const duration = action.duration || 'thisTurn';

            //. Resolve relative side to actual game side based on who controls the card
            const controllerSide = activationSource?.side || actionSource?.side || 'player';
            let actualTargetSide;
            if (targetSideRelative === 'player') {
              actualTargetSide = controllerSide; // 'self' targets controller's side
            } else if (targetSideRelative === 'opponent') {
              actualTargetSide = controllerSide === 'player' ? 'opponent' : 'player';
            } else {
              actualTargetSide = activationSource
                ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
                : resolveActionTargetSide(targetSideRelative);
            }

            const preCandidates = selectCandidates(actualTargetSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: actualTargetSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                action,
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              let expireOnSide = null;
              if (duration === 'thisTurn') {
                expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
              } else if (duration === 'untilEndOfOpponentsNextTurn' || duration === 'untilOpponentsNextTurn') {
                expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
              }

              targets.forEach((t) => {
                applyPowerMod?.(t.side, t.section, t.keyName, t.index, amount, expireOnSide);
                addPendingPowerDelta(t, amount);
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });

              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const expireSide = expireOnSide || (turnSide === 'player' ? 'opponent' : 'player');
                const label = `${cardName}: Power modified`;
                registerUntilNextTurnEffect(expireSide, label);
              }

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          //. Schema restrict action: disable a keyword (e.g., Blocker) on target
          case 'restrict': {
            const restrictionKind = action.restrictionKind || 'blocker';
            const duration = action.duration || 'thisTurn';
            
            //. Resolve target selector
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string' && ability.selectors?.[action.target]) {
              tgtSel = ability.selectors[action.target];
            }
            
            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'character');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : (tgtSel.side || 'opponent');
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;
            
            //. Extract power filter if present
            const powerFilter = tgtSel.filters?.find(f => f.field === 'power');
            const powerLimit = powerFilter?.op === '<=' ? powerFilter.value : null;
            
            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            }
            
            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);
            
            const preCandidates = selectCandidates(actualSide, targetType, {
              powerLimit,
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });
            
            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }
            
            setSelectedAbilityIndex(abilityIndex);
            
            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                { ...action, powerLimit },
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              //. Map restriction kind to keyword for disableKeyword function
              const keywordToDisable = restrictionKind.charAt(0).toUpperCase() + restrictionKind.slice(1);
              
              targets.forEach((t) => {
                disableKeyword?.(
                  t.side,
                  t.section,
                  t.keyName,
                  t.index,
                  keywordToDisable,
                  expireOnSide
                );
                effectApplied = true;
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });
              
              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: Disable [${keywordToDisable}]`;
                const fallbackSide = turnSide === 'player' ? 'opponent' : 'player';
                registerUntilNextTurnEffect(expireOnSide || fallbackSide, label);
              }
              
              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'giveDon': {
            const quantity = action.count || action.quantity || 1;
            const sourceDonState = action.sourceDonState || 'active';

            //. Resolve target selector
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string') {
              if (action.target === 'thisCard') {
                tgtSel = { type: 'thisCard', side: 'self' };
              } else if (ability.selectors?.[action.target]) {
                tgtSel = ability.selectors[action.target];
              }
            }

            //. Determine source side (whose cost area we use)
            const controllerSide = (action.side === 'opponent')
              ? (actionSource?.side === 'player' ? 'opponent' : 'player')
              : (actionSource?.side || 'player');

            const costLoc = controllerSide === 'player'
              ? _.get(areas, 'player.bottom')
              : _.get(areas, 'opponent.top');
            const costArr = _.get(costLoc, 'cost', []);

            const availableDon = costArr.filter((d) => {
              if (d.id !== 'DON') return false;
              if (sourceDonState === 'any') return true;
              if (sourceDonState === 'active') return !d.rested;
              if (sourceDonState === 'rested') return d.rested;
              return !d.rested; //. default to active
            });

            if (availableDon.length < quantity) {
              processNextRef.current && processNextRef.current();
              break;
            }

            //. If target is this card, attach directly without UI
            if (tgtSel.type === 'thisCard' && actionSource) {
              if (typeof moveDonFromCostToCard === 'function') {
                moveDonFromCostToCard(
                  controllerSide,
                  actionSource.side,
                  actionSource.section,
                  actionSource.keyName,
                  actionSource.index || 0,
                  quantity,
                  sourceDonState === 'rested'
                );
              }
              processNextRef.current && processNextRef.current();
              break;
            }

            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'any');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : (tgtSel.side || 'player');
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;

            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const preCandidates = selectCandidates(actualSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: (card, ctx) => {
                if (targetType === 'leader') {
                  return ctx?.section === 'middle' && ctx?.keyName === 'leader';
                }
                if (targetType === 'character') {
                  if (ctx?.section !== 'char' || ctx?.keyName !== 'char') return false;
                  if (
                    action.uniqueAcrossSequence &&
                    cumulativeTargets.some(
                      (t) =>
                        t.side === ctx.side &&
                        t.section === ctx.section &&
                        t.keyName === ctx.keyName &&
                        t.index === ctx.index
                    )
                  ) {
                    return false;
                  }
                  return true;
                }
                if (targetType === 'any') {
                  const ok =
                    (ctx?.section === 'middle' && ctx?.keyName === 'leader') ||
                    (ctx?.section === 'char' && ctx?.keyName === 'char');
                  if (!ok) return false;
                  if (
                    action.uniqueAcrossSequence &&
                    cumulativeTargets.some(
                      (t) =>
                        t.side === ctx.side &&
                        t.section === ctx.section &&
                        t.keyName === ctx.keyName &&
                        t.index === ctx.index
                    )
                  ) {
                    return false;
                  }
                  return true;
                }
                return false;
              },
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              if (targets.length === 0 && minTargets === 0) {
                processNextRef.current && processNextRef.current();
                return;
              }

              targets.forEach((t) => {
                if (typeof moveDonFromCostToCard === 'function') {
                  const success = moveDonFromCostToCard(
                    controllerSide,
                    t.side,
                    t.section,
                    t.keyName,
                    t.index,
                    quantity,
                    sourceDonState === 'rested'
                  );

                  if (!success) {
                    console.error('[giveDon] Failed to move DON!!');
                  }
                } else {
                  console.error('[giveDon] ERROR: moveDonFromCostToCard callback not available');
                }

                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'draw': {
            const drawQuantity = action.count || action.amount || action.quantity || 1;
            let sideToDraw = actionSource?.side || 'player';
            if (action.side) {
              sideToDraw = action.side === 'opponent'
                ? (actionSource?.side === 'player' ? 'opponent' : 'player')
                : (actionSource?.side || 'player');
            }

            if (typeof drawCards === 'function') {
              for (let i = 0; i < drawQuantity; i++) {
                drawCards(sideToDraw);
              }
            }

            processNextRef.current && processNextRef.current();
            break;
          }

          //. Schema setState action: set card to rested or active state
          case 'setState': {
            const targetState = action.state || 'rested';
            
            //. Resolve target selector - can be an object or a string reference to ability.selectors
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string') {
              if (action.target === 'thisCard') {
                tgtSel = { type: 'thisCard' };
              } else if (ability.selectors?.[action.target]) {
                tgtSel = ability.selectors[action.target];
              }
            }
            
            //. If target is 'thisCard', apply to self
            if (tgtSel.type === 'thisCard') {
              if (actionSource) {
                if (targetState === 'rested' && typeof restCard === 'function') {
                  restCard(
                    actionSource.side,
                    actionSource.section,
                    actionSource.keyName,
                    actionSource.index || 0
                  );
                } else if (targetState === 'active' && typeof setActive === 'function') {
                  setActive(
                    actionSource.side,
                    actionSource.section,
                    actionSource.keyName,
                    actionSource.index || 0
                  );
                }
              }
              processNextRef.current && processNextRef.current();
              break;
            }
            
            //. For other targets, use targeting system
            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'character');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : tgtSel.side === 'opponent' ? 'opponent' : 'opponent';
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : 1;
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;
            
            const actualTargetSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);
            
            const preCandidates = selectCandidates(actualTargetSide, targetType, {
              requireRested: targetState === 'active',
              requireActive: targetState === 'rested',
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });
            
            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }
            
            setSelectedAbilityIndex(abilityIndex);
            
            startTargeting({
              side: actualTargetSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                action,
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach((t) => {
                if (targetState === 'rested' && typeof restCard === 'function') {
                  restCard(t.side, t.section, t.keyName, t.index);
                } else if (targetState === 'active' && typeof setActive === 'function') {
                  setActive(t.side, t.section, t.keyName, t.index);
                }
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });
              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'trashFromHand': {
            const minCards = action.minCards ?? 1;
            const maxCards = action.maxCards ?? 1;
            const controllerSide = actionSource?.side || 'player';

            const handLoc = controllerSide === 'player'
              ? _.get(areas, 'player.bottom')
              : _.get(areas, 'opponent.top');
            const hand = _.get(handLoc, 'hand', []);

            if (hand.length === 0 || (minCards === 0 && hand.length === 0)) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: controllerSide,
              section: controllerSide === 'player' ? 'bottom' : 'top',
              keyName: 'hand',
              multi: true,
              min: minCards,
              max: maxCards,
              validator: (card, ctx) =>
                ctx?.section === (controllerSide === 'player' ? 'bottom' : 'top') &&
                ctx?.keyName === 'hand',
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              if (targets.length === 0 && minCards === 0) {
                processNextRef.current && processNextRef.current();
                return;
              }

              if (typeof removeCardByEffect === 'function') {
                const sortedTargets = [...targets].sort((a, b) => b.index - a.index);
                sortedTargets.forEach((t) => {
                  removeCardByEffect(
                    t.side,
                    t.section,
                    t.keyName,
                    t.index,
                    t.side
                  );
                });
              }

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'ko': {
            //. Resolve target selector - can be an object or a string reference to ability.selectors
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string' && ability.selectors?.[action.target]) {
              tgtSel = ability.selectors[action.target];
            }

            const koTargetSideRelative = tgtSel.side === 'self' ? 'player' : tgtSel.side || action.targetSide || 'opponent';
            const koTargetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || action.targetType || 'character');
            const koMinTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : (action.minTargets ?? 1));
            const koMaxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : (action.maxTargets ?? 1);
            const powerLimit = action.powerLimit || tgtSel.powerLimit || null;

            const koActualTargetSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, koTargetSideRelative)
              : resolveActionTargetSide(koTargetSideRelative);

            const preKoCandidates = selectCandidates(koActualTargetSide, koTargetType, {
              powerLimit,
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preKoCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: koActualTargetSide,
              multi: true,
              min: koMinTargets,
              max: koMaxTargets,
              validator: createTargetValidator(
                koTargetType,
                { ...action, powerLimit },
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach((t) => {
                removeCardByEffect?.(
                  t.side,
                  t.section,
                  t.keyName,
                  t.index,
                  actionSource?.side || 'player'
                );
                clearPendingForTarget(t);
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              processNextRef.current && processNextRef.current();
            });
            break;
          }
          case 'returnDon': {
            //. Resolve target selector
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string' && ability.selectors?.[action.target]) {
              tgtSel = ability.selectors[action.target];
            }

            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'character');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : (tgtSel.side || 'player');
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;
            const count = action.count || 1;

            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const preCandidates = selectCandidates(actualSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                action,
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach((t) => {
                returnDonFromCardToDeck?.(t.side, t.section, t.keyName, t.index, count);
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'detachDon': {
            //. Resolve target selector
            let tgtSel = {};
            if (typeof action.target === 'object') {
              tgtSel = action.target;
            } else if (typeof action.target === 'string' && ability.selectors?.[action.target]) {
              tgtSel = ability.selectors[action.target];
            }

            const targetType = tgtSel.type === 'leaderOrCharacter' ? 'any' : (tgtSel.type || 'character');
            const targetSideRelative = tgtSel.side === 'self' ? 'player' : (tgtSel.side || 'player');
            const minTargets = _.isNumber(tgtSel.min) ? tgtSel.min : (tgtSel.upTo ? 0 : 1);
            const maxTargets = _.isNumber(tgtSel.max) ? tgtSel.max : 1;
            const count = action.count || 1;

            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const preCandidates = selectCandidates(actualSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(
                targetType,
                action,
                cumulativeTargets,
                getTotalPower,
                getCardMeta,
                pendingPowerDeltas
              ),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach((t) => {
                detachDonFromCard?.(t.side, t.section, t.keyName, t.index, count);
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              processNextRef.current && processNextRef.current();
            });
            break;
          }


          case 'search': {
            //. Schema format uses topCount, selector, addTo, moveRemainingTo
            //. Legacy format uses lookCount, filterType, destination, remainderLocation
            const lookCount = action.topCount || action.lookCount || 5;
            const sourceSide = actionSource?.side || 'player';
            
            //. Extract filter from selector reference if present
            let filterTraits = null;
            let filterType = action.filterType || null;
            let filterColor = action.filterColor || null;
            
            if (typeof action.selector === 'string' && ability.selectors?.[action.selector]) {
              const selector = ability.selectors[action.selector];
              const traitFilter = selector.filters?.find(f => f.field === 'traits');
              if (traitFilter) {
                filterTraits = traitFilter.value;
              }
            }
            
            const minSelect = action.minSelect ?? 0;
            const maxSelect = action.maxSelect ?? 1;
            const destination = action.addTo || action.destination || 'hand';
            const ordering = action.ordering || 'any';
            const remainingOrdering = action.remainingOrdering || 'keep';
            const reveal = !!action.reveal;
            const remainderLocation = action.moveRemainingTo === 'bottomOfDeck' 
              ? 'bottom' 
              : (action.remainderLocation || 'bottom');

            if (startDeckSearch) {
              console.log('[Ability] Starting deck search with config:', {
                side: sourceSide,
                quantity: lookCount,
                filter: {
                  ...(filterType ? { type: filterType } : {}),
                  ...(filterColor ? { color: filterColor } : {}),
                  ...(filterTraits ? { traits: filterTraits } : {})
                },
                minSelect,
                maxSelect,
                returnLocation: remainderLocation
              });
              startDeckSearch({
                side: sourceSide,
                quantity: lookCount,
                filter: {
                  ...(filterType ? { type: filterType } : {}),
                  ...(filterColor ? { color: filterColor } : {}),
                  ...(filterTraits ? { traits: filterTraits } : {})
                },
                minSelect,
                maxSelect,
                returnLocation: remainderLocation,
                effectDescription: getAbilityDescription(ability, abilityIndex),
                reveal,
                ordering,
                remainingOrdering,
                onSearchComplete: (selectedCards, remainder) => {
                  console.log(
                    `[Ability] Deck search complete: ${selectedCards.length} selected, ${remainder.length} returned to ${remainderLocation}`
                  );
                  processNextRef.current && processNextRef.current();
                }
              });
            }

            setSelectedAbilityIndex(null);
            break;
          }

          default:
            console.log(`[Ability] Unknown action type: ${action.type}`);
            processNextRef.current && processNextRef.current();
        }
      };

      //. Store processNext in ref & kick off processing
      processNextRef.current = processNext;
      processNext();
    };

    //. Check if cost requires interactive payment (trashFromHand, etc.)
    if (costType === 'trashFromHand') {
      const minCards = cost.minCards ?? 1;
      const maxCards = cost.maxCards ?? 1;
      const controllerSide = actionSource?.side || 'player';
      
      const handLoc = controllerSide === 'player'
        ? _.get(areas, 'player.bottom')
        : _.get(areas, 'opponent.top');
      const hand = _.get(handLoc, 'hand', []);
      
      if (hand.length < minCards) {
        //. Cannot pay cost - not enough cards in hand
        console.log(`[Ability] Cannot pay trashFromHand cost - need ${minCards} cards, have ${hand.length}`);
        return;
      }
      
      setSelectedAbilityIndex(abilityIndex);
      if (setResolvingEffect) setResolvingEffect(true);
      
      //. Start targeting for hand cards to trash
      startTargeting({
        side: controllerSide,
        section: controllerSide === 'player' ? 'bottom' : 'top',
        keyName: 'hand',
        multi: true,
        min: minCards,
        max: maxCards,
        validator: () => true, //. All hand cards are valid
        origin: actionSource,
        abilityIndex,
        type: 'cost'
      }, (targets) => {
        //. Trash the selected cards (in reverse order to preserve indices)
        const sortedTargets = [...targets].sort((a, b) => (b.index || 0) - (a.index || 0));
        sortedTargets.forEach((t) => {
          removeCardByEffect?.(
            t.side,
            t.section || (t.side === 'player' ? 'bottom' : 'top'),
            'hand',
            t.index,
            t.side
          );
        });
        
        //. Now execute the ability actions
        executeAbilityActions();
      });
    } else {
      //. No interactive cost - execute actions directly
      executeAbilityActions();
    }
  }, [
    activatableAbilities,
    applyPowerMod,
    registerUntilNextTurnEffect,
    turnSide,
    cardName,
    startTargeting,
    getCardMeta,
    startDeckSearch,
    actionSource,
    listValidTargets,
    resolveActionTargetSide,
    removeCardByEffect,
    grantTempKeyword,
    disableKeyword,
    moveDonFromCostToCard,
    restCard,
    setResolvingEffect,
    getTotalPower,
    abilityHasAnySelectableTargets,
    returnCardToDeck,
    cardIndex,
    payLife,
    setAbilityUsed,
    setSelectedAbilityIndex,
    confirmTargeting,
    cancelTargeting,
    cardMeta,
    card,
    resumeTargeting,
    suspendTargeting,
    areas,
    drawCards,
    markAbilityUsed
  ]);

  //. Auto-trigger On Play abilities when card is just played (unless autoResolve === false)
  useEffect(() => {
    if (!wasJustPlayed || autoTriggeredOnPlay) return;
    if (!abilities || abilities.length === 0) return;

    console.log('[Auto-Trigger] Checking for On Play abilities...', {
      wasJustPlayed,
      abilities
    });

    const abilityIndex = abilities.findIndex((ability, index) => {
      const timing = ability?.timing || null;
      const typeLabel = timing
        ? (timing === 'onPlay' ? 'On Play' : timing)
        : (ability.type || ability.typeKey || '');
      const isOnPlay = timing === 'onPlay' || typeLabel === 'On Play';
      const notUsed = !abilityUsed[index];
      const autoResolve = ability.autoResolve !== false;
      const hasTargets = abilityHasAnySelectableTargets(ability);

      console.log('[Auto-Trigger] Ability %d:', index, {
        type: typeLabel,
        isOnPlay,
        notUsed,
        autoResolve,
        hasTargets
      });

      return isOnPlay && notUsed && (autoResolve || !hasTargets);
    });

    if (abilityIndex === -1) {
      console.log('[Auto-Trigger] No On Play abilities found');
      setAutoTriggeredOnPlay(true);
      return;
    }

    const ability = abilities[abilityIndex];
    console.log(
      `[Auto-Trigger] Triggering On Play ability for ${cardName} (index ${abilityIndex})`,
      ability
    );

    setAutoTriggeredOnPlay(true);

    setTimeout(() => {
      activateAbility(abilityIndex);
    }, 100);
  }, [
    wasJustPlayed,
    autoTriggeredOnPlay,
    abilities,
    abilityUsed,
    cardName,
    activateAbility,
    abilityHasAnySelectableTargets
  ]);

  // ============================================================================
  // RENDERING
  // ============================================================================

  //. Render as simple container when no card data is provided
  if (!card || !cardMeta) {
    return (
      <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
        <Paper
          elevation={6}
          sx={{
            width,
            height: height || 'auto',
            maxHeight,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 1,
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              px: 1.25,
              py: 0.75,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography variant='subtitle2' fontWeight={700}>
              {title}
            </Typography>
            {onClose && (
              <IconButton
                size='small'
                onClick={handlePanelClose}
                aria-label='close actions'
              >
                <CloseIcon fontSize='small' />
              </IconButton>
            )}
          </Box>

          <Box
            sx={{
              p: 1,
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              bgcolor: 'background.paper'
            }}
          >
            {children}
          </Box>
        </Paper>
      </Box>
    );
  }

  //. Render full card action panel
  return (
    <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
      <Paper
        elevation={6}
        sx={{
          width,
          height: height || 'auto',
          maxHeight,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 1.25,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Typography variant='subtitle2' fontWeight={700}>
            {cardId}
            {cardName && cardName !== cardId ? ` — ${cardName}` : ''}
          </Typography>
          {onClose && (
            <IconButton
              size='small'
              onClick={handlePanelClose}
              aria-label='close actions'
            >
              <CloseIcon fontSize='small' />
            </IconButton>
          )}
        </Box>

        {/* Body */}
        <Box
          sx={{
            p: 1.5,
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            bgcolor: 'background.paper'
          }}
        >
          <Stack spacing={1.25}>
            {/* Card Type Info */}
            <Typography variant='caption' color='text.secondary'>
              {category}
              {cardMeta.attribute && ` • ${cardMeta.attribute}`}
              {Array.isArray(cardMeta.types) && cardMeta.types.length > 0 && ` • ${cardMeta.types.join('/')}`}
              {cost !== null && cost !== undefined && ` • Cost ${cost}`}
              {basePower > 0 && ` • Power ${basePower}`}
              {life && ` • Life ${life}`}
            </Typography>

            {/* Keywords Display */}
            {displayKeywords.length > 0 && (
              <Stack
                direction='row'
                spacing={0.5}
                sx={{ flexWrap: 'wrap', gap: 0.5 }}
              >
                {displayKeywords.map((keyword, idx) => (
                  <Chip
                    key={idx}
                    label={keyword}
                    size='small'
                    color={getKeywordColor(keyword)}
                  />
                ))}
              </Stack>
            )}

            {/* Counter Value */}
            {counterValue !== null && (
              <Chip
                label={`Counter +${counterValue}`}
                size='small'
                color='success'
              />
            )}

            <AbilityList
              abilities={abilities}
              activatableAbilities={activatableAbilities}
              selectedAbilityIndex={selectedAbilityIndex}
              currentActionStep={currentActionStep}
              targeting={targeting}
              activateAbility={activateAbility}
              TargetSelectionUI={TargetSelectionUI}
              areas={areas}
              getCardMeta={getCardMeta}
              confirmTargeting={confirmTargeting}
              cancelTargeting={cancelTargeting}
              setSelectedAbilityIndex={setSelectedAbilityIndex}
              getAbilityDescription={getAbilityDescription}
              attackLocked={lockCurrentAttack}
            />

            {/* Full Card Text (hide if structured abilities are present to avoid duplication) */}
            {cardMeta.text && abilities?.length === 0 && (
              <>
                <Divider />
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ fontStyle: 'italic' }}
                >
                  {cardMeta.text}
                </Typography>
              </>
            )}

            {/* Trigger Text */}
            {cardMeta.trigger && (
              <Box sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
                <Typography variant='caption' fontWeight={700}>
                  [Trigger]: {cardMeta.trigger.text}
                </Typography>
              </Box>
            )}

            {/* Blocker Activation Button */}
            {useMemo(() => {
              if (!battle || battle.step !== 'block') return null;

              const defendingSide = battle.target?.side;
              const cardSide = actionSource?.side;
              if (cardSide !== defendingSide) return null;

              if (battle.target?.section === 'char') return null;

              if (actionSource?.section !== 'char' || actionSource?.keyName !== 'char') {
                return null;
              }

              const hasBlocker = keywords.some((k) => /blocker/i.test(k));
              if (!hasBlocker) return null;

              if (card?.rested) return null;

              return (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Box>
                    <Typography
                      variant='caption'
                      display='block'
                      color='text.secondary'
                      sx={{ mb: 1 }}
                    >
                      This card can be used as a blocker to redirect the attack.
                    </Typography>
                    <Button
                      fullWidth
                      variant='contained'
                      color='error'
                      size='medium'
                      onClick={() => {
                        if (battleApplyBlocker && typeof cardIndex === 'number') {
                          battleApplyBlocker(cardIndex);
                          onClose?.();
                        }
                      }}
                    >
                      Use as Blocker
                    </Button>
                  </Box>
                </>
              );
            }, [
              battle,
              actionSource,
              keywords,
              card?.rested,
              cardIndex,
              battleApplyBlocker,
              onClose
            ])}

            {/* Additional children (play controls, attack controls, etc.) */}
            {children}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
