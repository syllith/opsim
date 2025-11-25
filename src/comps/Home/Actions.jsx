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
 * - Handles structured action sequences (powerMod, KO, search, etc.)
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

//. Memoized component for target selection UI
const TargetSelectionUI = React.memo(({
  targeting,
  areas,
  getCardMeta,
  confirmTargeting,
  cancelTargeting,
  onCancel
}) => {
  const selectionCount = _.get(targeting, 'selected.length', 0);
  const optionalMode = targeting.min === 0;
  const confirmLabel = optionalMode
    ? (selectionCount > 0 ? 'Confirm' : 'Skip')
    : 'Confirm';
  const confirmDisabled = !optionalMode && selectionCount < targeting.min;
  const confirmVariant = optionalMode && selectionCount > 0 ? 'contained' : 'outlined';

  //. Returns human-readable name for a target
  const getTargetName = useCallback((target) => {
    if (target.section === 'middle' && target.keyName === 'leader') {
      return `${target.side === 'player' ? 'Your' : 'Opponent'} Leader`;
    }

    if (target.section === 'char' && target.keyName === 'char') {
      const targetSide = target.side === 'player'
        ? _.get(areas, 'player')
        : _.get(areas, 'opponent');
      const targetCard = _.get(targetSide, ['char', target.index]);
      const targetMeta = targetCard ? getCardMeta(targetCard.id) : null;
      return targetMeta?.name || targetCard?.id || 'Character';
    }

    return 'Unknown';
  }, [areas, getCardMeta]);

  //. Helper text for selection state
  const helpText = useMemo(() => {
    if (optionalMode) {
      return targeting.max > 1
        ? `Select up to ${targeting.max} targets (${selectionCount}/${targeting.max})`
        : 'Select a target or choose Skip to pass';
    }
    return selectionCount > 0
      ? 'Select more or confirm'
      : 'Select target(s) on board...';
  }, [optionalMode, targeting.max, selectionCount]);

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {Array.isArray(targeting.selected) && targeting.selected.length > 0 && (
        <Box>
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mb: 0.5 }}
          >
            Selected Target{targeting.selected.length > 1 ? 's' : ''}:
          </Typography>
          {targeting.selected.map((target, tidx) => (
            <Chip
              key={tidx}
              label={getTargetName(target)}
              size='small'
              color='warning'
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))}
        </Box>
      )}

      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ flex: 1 }}
        >
          {helpText}
        </Typography>

        <Button
          size='small'
          variant={confirmVariant}
          onClick={confirmTargeting}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>

        {!optionalMode && (
          <Button
            size='small'
            variant='text'
            onClick={() => {
              cancelTargeting();
              onCancel();
            }}
          >
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );
});

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
  payLife,
  removeCardByEffect,
  setResolvingEffect,
  getTotalPower,
  markAbilityUsed,
  abilityUsage,

  //. Battle Handlers
  battleApplyBlocker
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
    cardName: _.get(cardMeta, 'name', _.get(card, 'id', '')),
    category: _.get(cardMeta, 'category', 'Unknown'),
    basePower: _.get(cardMeta, 'stats.power', 0) || 0,
    cost: _.get(cardMeta, 'stats.cost', 0),
    life: _.get(cardMeta, 'stats.life', null),
    counterValue: _.get(cardMeta, 'stats.counter.present')
      ? _.get(cardMeta, 'stats.counter.value', null)
      : null
  }), [card, cardMeta]);

  const {
    cardId,
    abilities,
    keywords,
    cardName,
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

    const effect = ability.effect;
    if (!effect) return;

    //. Store cost for later payment
    const cost = ability.cost;

    //. Completes ability activation: mark used and pay costs
    const completeAbilityActivation = () => {
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
        markAbilityUsed
      });
    };

    //. Check if effect has structured actions array
    const hasStructuredActions =
      _.isPlainObject(effect) && Array.isArray(effect.actions);

    //. Handle structured actions
    if (hasStructuredActions) {
      cancelProcessingRef.current = false;

      const actionsQueue = [...effect.actions];
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
          case 'powerMod': {
            const amount = action.amount || 0;
            const sign = amount >= 0 ? '+' : '';
            const targetType = action.targetType === 'leader'
              ? 'Leader'
              : action.targetType === 'character'
                ? 'Character'
                : 'card';
            const min = action.minTargets ?? 1;
            const max = action.maxTargets ?? 1;
            if (min === 0) {
              return `Give up to ${max} ${targetType}${max > 1 ? 's' : ''} ${sign}${amount} power`;
            }
            return `Give ${max} ${targetType}${max > 1 ? 's' : ''} ${sign}${amount} power`;
          }
          case 'ko': {
            const targetType = action.targetType === 'character' ? 'Character' : 'card';
            const max = action.maxTargets ?? 1;
            const powerLimit = action.powerLimit
              ? ` with ${action.powerLimit} power or less`
              : '';
            return `K.O. ${max} ${targetType}${max > 1 ? 's' : ''}${powerLimit}`;
          }
          case 'rest': {
            const max = action.maxTargets ?? 1;
            return `Rest ${max} card${max > 1 ? 's' : ''}`;
          }
          case 'active': {
            const max = action.maxTargets ?? 1;
            return `Set ${max} card${max > 1 ? 's' : ''} active`;
          }
          case 'grantKeyword': {
            const keyword = action.keyword || 'keyword';
            return `Grant [${keyword}]`;
          }
          case 'disableKeyword': {
            const keyword = action.keyword || 'keyword';
            return `Disable [${keyword}]`;
          }
          case 'giveDon': {
            const qty = action.quantity || 1;
            return `Give ${qty} DON!!`;
          }
          case 'draw': {
            const qty = action.quantity || 1;
            return `Draw ${qty} card${qty > 1 ? 's' : ''}`;
          }
          case 'trashFromHand': {
            const min = action.minCards ?? 1;
            const max = action.maxCards ?? 1;
            if (min === 0) {
              return `Trash up to ${max} card${max > 1 ? 's' : ''} from hand`;
            }
            return `Trash ${max} card${max > 1 ? 's' : ''} from hand`;
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
          completeAbilityActivation();
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
        const totalActions = effect.actions.length;
        const currentStep = totalActions - queue.length;
        setCurrentActionStep({
          step: currentStep,
          total: totalActions,
          description: getActionDescription(action)
        });

        switch (action.type) {
          case 'powerMod': {
            const amount = action.amount || 0;
            const targetSideRelative = action.targetSide || 'opponent';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets ?? 1;
            const maxTargets = action.maxTargets ?? 1;
            const duration = action.duration || 'thisTurn';

            const actualTargetSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

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
              } else if (duration === 'untilOpponentsNextTurn') {
                expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
              }

              targets.forEach((t) => {
                applyPowerMod?.(t.side, t.section, t.keyName, t.index, amount, expireOnSide);
                addPendingPowerDelta(t, amount);
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              if (registerUntilNextTurnEffect) {
                if (duration === 'thisTurn') {
                  const expireSide = turnSide === 'player' ? 'opponent' : 'player';
                  registerUntilNextTurnEffect(expireSide, `${cardName}: ${effect.text}`);
                } else if (duration === 'untilOpponentsNextTurn') {
                  const expireSide = turnSide === 'player' ? 'player' : 'opponent';
                  registerUntilNextTurnEffect(expireSide, `${cardName}: ${effect.text}`);
                }
              }

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'grantKeyword': {
            const keyword = action.keyword || '';
            const duration = action.duration || 'thisTurn';

            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            } else if (duration === 'untilOpponentsNextTurn') {
              expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
            }

            if (action.targetSelf) {
              if (typeof grantTempKeyword === 'function' && actionSource) {
                const s = actionSource.side || 'player';
                grantTempKeyword(
                  s,
                  actionSource.section,
                  actionSource.keyName,
                  actionSource.index || 0,
                  keyword,
                  expireOnSide
                );
              }

              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${_.isObject(effect) ? effect.text : String(effect || '')}`;
                const fallbackSide = turnSide === 'player' ? 'opponent' : 'player';
                registerUntilNextTurnEffect(expireOnSide || fallbackSide, label);
              }

              processNextRef.current && processNextRef.current();
              break;
            }

            const targetSideRelative = action.targetSide || 'player';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets ?? 1;
            const maxTargets = action.maxTargets ?? 1;
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
                grantTempKeyword?.(
                  t.side,
                  t.section,
                  t.keyName,
                  t.index,
                  keyword,
                  expireOnSide
                );
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${_.isObject(effect) ? effect.text : String(effect || '')}`;
                const fallbackSide = turnSide === 'player' ? 'opponent' : 'player';
                registerUntilNextTurnEffect(expireOnSide || fallbackSide, label);
              }

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'disableKeyword': {
            const keyword = action.keyword || '';
            const duration = action.duration || 'thisTurn';

            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            } else if (duration === 'untilOpponentsNextTurn') {
              expireOnSide = turnSide === 'player' ? 'player' : 'opponent';
            }

            const targetSideRelative = action.targetSide || 'opponent';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets ?? 1;
            const maxTargets = action.maxTargets ?? 1;
            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const preCandidates = selectCandidates(actualSide, targetType, {
              powerLimit: action.powerLimit,
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
                { ...action, powerLimit: action.powerLimit },
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
                disableKeyword?.(
                  t.side,
                  t.section,
                  t.keyName,
                  t.index,
                  keyword,
                  expireOnSide
                );
                cumulativeTargets.push({
                  side: t.side,
                  section: t.section,
                  keyName: t.keyName,
                  index: t.index
                });
              });

              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${_.isObject(effect) ? effect.text : String(effect || '')}`;
                const fallbackSide = turnSide === 'player' ? 'opponent' : 'player';
                registerUntilNextTurnEffect(expireOnSide || fallbackSide, label);
              }

              processNextRef.current && processNextRef.current();
            });
            break;
          }

          case 'giveDon': {
            const quantity = action.quantity || 1;
            const targetSideRelative = action.targetSide || 'player';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets ?? 1;
            const maxTargets = action.maxTargets ?? 1;
            const onlyRested = action.onlyRested ?? true;

            const actualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, targetSideRelative)
              : resolveActionTargetSide(targetSideRelative);

            const controllerSide = actionSource?.side || 'player';
            const costLoc = controllerSide === 'player'
              ? _.get(areas, 'player.bottom')
              : _.get(areas, 'opponent.top');
            const costArr = _.get(costLoc, 'cost', []);

            const availableDon = costArr.filter(
              (d) => d.id === 'DON' && (onlyRested ? d.rested : true)
            );

            if (availableDon.length < quantity) {
              processNextRef.current && processNextRef.current();
              break;
            }

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
                    onlyRested
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
            const drawQuantity = action.quantity || 1;
            // Actual draw is handled by higher-level state; this just advances sequence
            processNextRef.current && processNextRef.current();
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
            const koTargetSideRelative = action.targetSide || 'opponent';
            const koTargetType = action.targetType || 'character';
            const koMinTargets = action.minTargets ?? 1;
            const koMaxTargets = action.maxTargets ?? 1;
            const powerLimit = action.powerLimit || null;

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

          case 'rest': {
            const restTargetSideRelative = action.targetSide || 'opponent';
            const restTargetType = action.targetType || 'any';
            const restMinTargets = action.minTargets ?? 1;
            const restMaxTargets = action.maxTargets ?? 1;

            const restActualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, restTargetSideRelative)
              : resolveActionTargetSide(restTargetSideRelative);

            const preRestCandidates = selectCandidates(restActualSide, restTargetType, {
              requireActive: true,
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preRestCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: restActualSide,
              multi: true,
              min: restMinTargets,
              max: restMaxTargets,
              validator: createStateValidator(
                restTargetType,
                false,
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
                if (
                  t.section === 'char' ||
                  (t.section === 'middle' && t.keyName === 'leader')
                ) {
                  restCard?.(t.side, t.section, t.keyName, t.index);
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

          case 'active': {
            const actTargetSideRelative = action.targetSide || 'player';
            const actTargetType = action.targetType || 'any';
            const actMinTargets = action.minTargets ?? 1;
            const actMaxTargets = action.maxTargets ?? 1;

            const actActualSide = activationSource
              ? resolveActionTargetSideUtil(activationSource, actTargetSideRelative)
              : resolveActionTargetSide(actTargetSideRelative);

            const preActCandidates = selectCandidates(actActualSide, actTargetType, {
              requireRested: true,
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });

            if (preActCandidates.length === 0) {
              processNextRef.current && processNextRef.current();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);

            startTargeting({
              side: actActualSide,
              multi: true,
              min: actMinTargets,
              max: actMaxTargets,
              validator: createStateValidator(
                actTargetType,
                true,
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
              // TODO: actual "set active" handler wiring; for now, only mark as targeted
              targets.forEach((t) => {
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

          case 'search': {
            const lookCount = action.lookCount || 5;
            const sourceSide = actionSource?.side || 'player';
            const filterType = action.filterType || null;
            const filterColor = action.filterColor || null;
            const filterAttribute = action.filterAttribute || null;
            const minSelect = action.minSelect ?? 0;
            const maxSelect = action.maxSelect ?? 1;
            const destination = action.destination || 'hand';
            const remainderLocation = action.remainderLocation || 'bottom';

            if (startDeckSearch) {
              startDeckSearch({
                side: sourceSide,
                quantity: lookCount,
                filter: {
                  ...(filterType ? { type: filterType } : {}),
                  ...(filterColor ? { color: filterColor } : {}),
                  ...(filterAttribute ? { attribute: filterAttribute } : {})
                },
                minSelect,
                maxSelect,
                returnLocation: remainderLocation,
                effectDescription: effect.text,
                onComplete: (selectedCards, remainder) => {
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
    } else {
      //. No structured actions - card needs schema update
      console.warn(
        `[Ability] Card ${cardName} has no structured actions - needs update`
      );
      completeAbilityActivation();
      if (setResolvingEffect) setResolvingEffect(false);
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
    suspendTargeting
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
      const type = ability.type || ability.typeKey || '';
      const isOnPlay = type === 'On Play';
      const notUsed = !abilityUsed[index];
      const autoResolve = ability.autoResolve !== false;
      const hasTargets = abilityHasAnySelectableTargets(ability);

      console.log('[Auto-Trigger] Ability %d:', index, {
        type,
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

            {/* Abilities Section */}
            {abilities.length > 0 ? (
              <Box>
                <Typography
                  variant='overline'
                  sx={{ display: 'block', mb: 0.5 }}
                >
                  Abilities
                </Typography>

                <Stack spacing={1.5}>
                  {activatableAbilities.map((ability, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1.25,
                        border: '1px solid',
                        borderColor: ability.canActivate ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: ability.canActivate ? 'action.hover' : 'transparent'
                      }}
                    >
                      {/* Ability Type / Badges */}
                      <Stack
                        direction='row'
                        spacing={0.5}
                        sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}
                      >
                        <Chip
                          label={ability.type || 'Unknown'}
                          size='small'
                          color='primary'
                          sx={{ textTransform: 'capitalize' }}
                        />

                        {ability.frequency && (
                          <Chip
                            label={ability.frequency}
                            size='small'
                            variant='outlined'
                          />
                        )}

                        {ability.condition?.don > 0 && (
                          <Chip
                            label={`DON!! x${ability.condition.don}`}
                            size='small'
                            color='secondary'
                          />
                        )}
                      </Stack>

                      {/* Effect Text */}
                      <Typography variant='body2' sx={{ mb: 1 }}>
                        {typeof ability.effect === 'string'
                          ? ability.effect
                          : ability.effect?.text || 'No description'}
                      </Typography>

                      {/* Activation Controls */}
                      {ability.canActivate &&
                        !(selectedAbilityIndex === idx && targeting?.active) ? (
                        <Button
                          size='small'
                          variant='contained'
                          onClick={() => activateAbility(idx)}
                          disabled={
                            selectedAbilityIndex !== null &&
                            selectedAbilityIndex !== idx
                          }
                        >
                          Activate
                        </Button>
                      ) : !ability.canActivate ? (
                        <Alert
                          severity={
                            (ability.reason || '')
                              .toLowerCase()
                              .includes('resolving')
                              ? 'warning'
                              : ability.reason
                                ?.toLowerCase()
                                .includes('already')
                                ? 'info'
                                : 'info'
                          }
                          sx={{
                            py: 0.5,
                            px: 1.5,
                            alignItems: 'center',
                            '& .MuiAlert-message': {
                              py: 0,
                              width: '100%'
                            }
                          }}
                        >
                          {ability.reason || 'Cannot activate now'}
                        </Alert>
                      ) : null}

                      {/* Target Selection UI */}
                      {selectedAbilityIndex === idx && targeting?.active && (
                        <>
                          {currentActionStep && (
                            <Alert
                              severity='info'
                              sx={{
                                mb: 1,
                                py: 0.5,
                                px: 1.5,
                                display: 'flex',
                                alignItems: 'center',
                                '& .MuiAlert-message': {
                                  py: 0,
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center'
                                }
                              }}
                            >
                              <Stack
                                direction='row'
                                spacing={1}
                                alignItems='center'
                                sx={{ width: '100%' }}
                              >
                                <Chip
                                  label={`Step ${currentActionStep.step}/${currentActionStep.total}`}
                                  size='small'
                                  color='info'
                                />
                                <Typography
                                  variant='caption'
                                  sx={{ flex: 1, lineHeight: 1.4 }}
                                >
                                  {currentActionStep.description}
                                </Typography>
                              </Stack>
                            </Alert>
                          )}

                          <TargetSelectionUI
                            targeting={targeting}
                            areas={areas}
                            getCardMeta={getCardMeta}
                            confirmTargeting={confirmTargeting}
                            cancelTargeting={cancelTargeting}
                            onCancel={() => setSelectedAbilityIndex(null)}
                          />
                        </>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant='body2' color='text.secondary'>
                No special abilities
              </Typography>
            )}

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
