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
import { Paper, Box, Typography, IconButton, Stack, Divider, Button, Chip, Alert } from '@mui/material';
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

/**
 * Memoized component for target selection UI
 */
const TargetSelectionUI = React.memo(({ targeting, areas, getCardMeta, confirmTargeting, cancelTargeting, onCancel }) => {
  const selectionCount = targeting.selected?.length || 0;
  const optionalMode = targeting.min === 0;
  const confirmLabel = optionalMode ? (selectionCount > 0 ? 'Confirm' : 'Skip') : 'Confirm';
  const confirmDisabled = !optionalMode && selectionCount < targeting.min;
  const confirmVariant = optionalMode && selectionCount > 0 ? 'contained' : 'outlined';

  const getTargetName = useCallback((target) => {
    if (target.section === 'middle' && target.keyName === 'leader') {
      return `${target.side === 'player' ? 'Your' : 'Opponent'} Leader`;
    }
    if (target.section === 'char' && target.keyName === 'char') {
      const targetSide = target.side === 'player' ? areas?.player : areas?.opponent;
      const targetCard = targetSide?.char?.[target.index];
      const targetMeta = targetCard ? getCardMeta(targetCard.id) : null;
      return targetMeta?.name || targetCard?.id || 'Character';
    }
    return 'Unknown';
  }, [areas, getCardMeta]);

  const helpText = useMemo(() => {
    if (optionalMode) {
      return targeting.max > 1
        ? `Select up to ${targeting.max} targets (${selectionCount}/${targeting.max})`
        : 'Select a target or choose Skip to pass';
    }
    return selectionCount > 0 ? 'Select more or confirm' : 'Select target(s) on board...';
  }, [optionalMode, targeting.max, selectionCount]);

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {targeting.selected && targeting.selected.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Selected Target{targeting.selected.length > 1 ? 's' : ''}:
          </Typography>
          {targeting.selected.map((target, tidx) => (
            <Chip
              key={tidx}
              label={getTargetName(target)}
              size="small"
              color="warning"
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))}
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {helpText}
        </Typography>
        <Button
          size="small"
          variant={confirmVariant}
          onClick={confirmTargeting}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
        {!optionalMode && (
          <Button
            size="small"
            variant="text"
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

/**
 * Helper to determine chip color for keywords
 */
const getKeywordColor = (keyword) => {
  const lower = keyword.toLowerCase();
  if (lower.includes('rush')) return 'warning';
  if (lower.includes('blocker')) return 'info';
  if (lower.includes('double attack')) return 'error';
  return 'default';
};

export default function Actions({
  // UI Props
  title = 'Actions',
  onClose,
  width = 420,
  height,
  maxHeight = 'calc(100vh - 32px)',
  children,

  // Card Data
  card,
  cardMeta,
  cardIndex,
  actionSource,

  // Game State
  phase,
  turnSide,
  turnNumber,
  isYourTurn,
  areas,
  battle,

  // Targeting System
  startTargeting,
  cancelTargeting,
  suspendTargeting,
  confirmTargeting,
  targeting,

  // Card Metadata
  getCardMeta,

  // Effect Handlers
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

  // Battle Handlers
  battleApplyBlocker,
}) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Track which abilities have been used this turn (for once-per-turn abilities and On Play)
  const [abilityUsed, setAbilityUsed] = useState({});

  useEffect(() => {
    setAbilityUsed(abilityUsage || {});
  }, [abilityUsage]);

  // Currently selected ability index (during targeting/resolution)
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState(null);

  // Tracks whether On Play ability was auto-triggered for this card instance
  const [autoTriggeredOnPlay, setAutoTriggeredOnPlay] = useState(false);

  // Track if we're actively processing a multi-step ability (ref to avoid stale closures)
  const processingActionsRef = useRef(false);

  // Store the action queue and processNext function to persist across renders
  const actionQueueRef = useRef(null);
  const processNextRef = useRef(null);

  // ============================================================================
  // LIFECYCLE & CLEANUP
  // ============================================================================

  /**
   * Helper to compare action source origins for targeting restoration
   */
  const isSameOrigin = useCallback((a, b) => {
    return a && b &&
      a.side === b.side &&
      a.section === b.section &&
      a.keyName === b.keyName &&
      a.index === b.index;
  }, []);

  /**
   * Combined effect for cleanup and targeting state management
   * - Cleans up on unmount
   * - Restores ability selection when targeting is suspended
   * - Cleans up selection state when targeting is cancelled
   */
  useEffect(() => {
    // Restore UI when targeting is suspended from this card's ability
    if (targeting?.active && targeting?.suspended && isSameOrigin(targeting.origin, actionSource)) {
      if (typeof targeting.abilityIndex === 'number') {
        setSelectedAbilityIndex(targeting.abilityIndex);
      }
    }
    // Clean up when targeting is cancelled (but not during multi-step ability processing)
    else if (!targeting?.active && selectedAbilityIndex !== null && !processingActionsRef.current) {
      setSelectedAbilityIndex(null);
      setResolvingEffect?.(false);
    }

    // Cleanup on unmount
    return () => {
      try {
        if (targeting?.active) suspendTargeting?.();
        setResolvingEffect?.(false);
      } catch { }
    };
  }, [targeting?.active, targeting?.suspended, targeting?.origin, targeting?.abilityIndex, actionSource, selectedAbilityIndex, setResolvingEffect, isSameOrigin, suspendTargeting]);

  // ============================================================================
  // CARD DATA EXTRACTION
  // ============================================================================

  const cardData = useMemo(() => ({
    cardId: card?.id,
    abilities: cardMeta?.abilities || [],
    keywords: cardMeta?.keywords || [],
    cardName: cardMeta?.name || card?.id,
    category: cardMeta?.category || 'Unknown',
    basePower: cardMeta?.stats?.power || 0,
    cost: cardMeta?.stats?.cost || 0,
    life: cardMeta?.stats?.life,
    counterValue: cardMeta?.stats?.counter?.present ? cardMeta?.stats?.counter?.value : null
  }), [card?.id, cardMeta]);

  const { cardId, abilities, keywords, cardName, category, basePower, cost, life, counterValue } = cardData;

  /**
   * Filter out ability types from keyword display to avoid duplication.
   * For example, don't show "On Play" as both a keyword chip and an ability type.
   */
  const displayKeywords = useMemo(() => {
    const abilityTypeSet = new Set(abilities.map(a => (a?.type || '').toLowerCase()));
    return keywords.filter(k => !abilityTypeSet.has((k || '').toLowerCase()));
  }, [abilities, keywords]);

  /**
   * Verify this card instance is still on the field at its expected location.
   * Used to prevent activating abilities of cards that have been removed.
   */
  const isOnField = useMemo(() => {
    if (!actionSource || !areas || !card?.id) return false;

    const { side, section, keyName, index } = actionSource;
    const sideLoc = side === 'player' ? areas.player : areas.opponent;

    try {
      let cardInstance = null;

      if (section === 'char' && keyName === 'char') {
        cardInstance = sideLoc?.char?.[index];
      } else if (section === 'middle' && keyName === 'leader') {
        cardInstance = sideLoc?.middle?.leader?.[0];
      }

      return cardInstance?.id === card.id;
    } catch {
      return false;
    }
  }, [actionSource, areas, card?.id]);

  /**
   * Determine if this card was just played this turn.
   * According to Rule 8-1-3-1-3, On Play effects must trigger immediately when played.
   * Checks both the justPlayed flag and enteredTurn marker for validation.
   */
  const wasJustPlayed = useMemo(() =>
    Boolean(actionSource?.justPlayed && card?.enteredTurn === turnNumber),
    [actionSource?.justPlayed, card?.enteredTurn, turnNumber]
  );

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Consolidate utility wrappers into single memoized object
   * This reduces recreation overhead and simplifies dependencies
   */
  const utilityHelpers = useMemo(() => ({
    listValidTargets: (sideSpec, targetType, opts = {}) =>
      listValidTargetsUtil(areas, getCardMeta, getTotalPower, sideSpec, targetType, opts),
    resolveActionTargetSide: (relativeSide) =>
      resolveActionTargetSideUtil(actionSource, relativeSide),
    evaluateAbilityTargetAvailability: (ability) =>
      evaluateAbilityTargetAvailabilityUtil(ability, areas, getCardMeta, getTotalPower, actionSource),
    abilityHasAnySelectableTargets: (ability) =>
      abilityHasAnySelectableTargetsUtil(ability, areas, getCardMeta, getTotalPower, actionSource)
  }), [areas, getCardMeta, getTotalPower, actionSource]);

  const { listValidTargets, resolveActionTargetSide, evaluateAbilityTargetAvailability, abilityHasAnySelectableTargets } = utilityHelpers;

  // ============================================================================
  // ABILITY ACTIVATION LOGIC
  // ============================================================================

  /**
   * Determine which abilities can be activated based on current game state.
   * Evaluates timing, targeting, costs, and conditions for each ability.
   */
  const activatableAbilities = useMemo(() => {
    const isProcessing = processingActionsRef.current && selectedAbilityIndex !== null;
    const tempUsed = isProcessing ? { ...abilityUsed, [selectedAbilityIndex]: true } : abilityUsed;

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
  }, [abilities, phase, isYourTurn, battle, cardId, abilityUsed, isOnField, wasJustPlayed, areas, actionSource, getCardMeta, getTotalPower, selectedAbilityIndex]);

  // Handle ability activation
  const activateAbility = useCallback((abilityIndex) => {
    const ability = activatableAbilities[abilityIndex];
    if (!ability) return;


    // Allow activation even if canActivate is false for auto-triggered On Play abilities
    const abilityType = (ability.typeKey || '');
    const isOnPlay = abilityType === 'On Play';

    // For non-On Play abilities, require canActivate to be true
    if (!isOnPlay && !ability.canActivate) return;

    const effect = ability.effect;
    if (!effect) return;

    // Store cost for later payment (after effect resolves and targets are confirmed)
    const cost = ability.cost;

    /**
     * Complete ability activation by marking as used and paying costs.
     * Per Comprehensive Rules 8-3, activation costs are paid before effect resolution.
     * Standard costs include:
     * - ① symbols: Rest DON!! from cost area (8-3-1-5)
     * - DON!! -X: Return DON!! to deck (8-3-1-6, 10-2-10)
     * - Rest this card
     * - Pay life (move Life cards to hand per 4-6-2)
     * 
     * This function is called AFTER effect resolution and targeting confirmation.
     */
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

    // Check if effect has structured actions array
    const hasStructuredActions = typeof effect === 'object' && effect.actions && Array.isArray(effect.actions);

    // Handle structured actions
    if (hasStructuredActions) {
      // Process actions sequentially so multi-step abilities can chain
      const actionsQueue = [...effect.actions];
      const cumulativeTargets = []; // remember prior selections within this ability resolution
      // Capture the action source at activation start to prevent side changes mid-sequence
      const activationSource = actionSource ? { ...actionSource } : null;

      // Store in refs to persist across renders
      actionQueueRef.current = actionsQueue;

      if (setResolvingEffect) setResolvingEffect(true);
      processingActionsRef.current = true; // Mark that we're processing actions
      // Use shared listValidTargets helper

      const processNext = () => {
        // Use the ref version of actionsQueue that persists across renders
        const queue = actionQueueRef.current;
        if (!queue || queue.length === 0) {
          // All actions complete; finalize ability
          processingActionsRef.current = false; // Clear processing flag
          actionQueueRef.current = null;
          processNextRef.current = null;
          completeAbilityActivation();
          setSelectedAbilityIndex(null);
          if (setResolvingEffect) setResolvingEffect(false);
          return;
        }

        const action = queue.shift();

        switch (action.type) {
          case 'powerMod':
            // Power modification action - use explicit fields (no parsing)
            const amount = action.amount || 0;
            const targetSideRelative = action.targetSide || 'opponent'; // "player" | "opponent" | "both"
            const targetType = action.targetType || 'any'; // "leader" | "character" | "any"
            const minTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const maxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const duration = action.duration || 'thisTurn'; // "thisTurn" | "untilEndOfBattle" | "permanent"

            // Convert relative targetSide to actual game side
            // If card controller is "opponent" and targetSide is "opponent", actual target is "player"
            const actualTargetSide = activationSource ? resolveActionTargetSideUtil(activationSource, targetSideRelative) : resolveActionTargetSide(targetSideRelative);
            // ...removed orphaned object literal from previous console.log

            // Auto-skip if no valid targets exist (handles "up to" 0 cases)
            const preCandidates = listValidTargets(actualTargetSide, targetType, { uniqueAcrossSequence: action.uniqueAcrossSequence, cumulative: cumulativeTargets });
            if ((preCandidates.length === 0) || (minTargets === 0 && preCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: actualTargetSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(targetType, action, cumulativeTargets, getTotalPower, getCardMeta),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              // Apply effects to targets
              let expireOnSide = null;
              if (duration === 'thisTurn') {
                // expires when the next player's Refresh Phase runs
                expireOnSide = (turnSide === 'player') ? 'opponent' : 'player';
              } else if (duration === 'untilOpponentsNextTurn') {
                // expires when the current player's next Refresh Phase runs
                expireOnSide = (turnSide === 'player') ? 'player' : 'opponent';
              }
              targets.forEach(t => {
                if (applyPowerMod) {
                  applyPowerMod(t.side, t.section, t.keyName, t.index, amount, expireOnSide);
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });

              // Determine expiry side for cleanup and register for visibility
              if (registerUntilNextTurnEffect) {
                if (duration === 'thisTurn') {
                  // Expires at start of opponent's upcoming turn
                  const expireOnSide = (turnSide === 'player') ? 'opponent' : 'player';
                  registerUntilNextTurnEffect(expireOnSide, `${cardName}: ${effect.text}`);
                } else if (duration === 'untilOpponentsNextTurn') {
                  // Expires at start of your next turn (after opponent finishes their next turn)
                  const expireOnSide = (turnSide === 'player') ? 'player' : 'opponent';
                  registerUntilNextTurnEffect(expireOnSide, `${cardName}: ${effect.text}`);
                }
              }
              // Continue to next action in sequence
              if (processNextRef.current) processNextRef.current();
            });
            break;
          case 'grantKeyword': {
            const keyword = action.keyword || '';
            const duration = action.duration || 'thisTurn';
            // Determine expiry side
            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = (turnSide === 'player') ? 'opponent' : 'player';
            } else if (duration === 'untilOpponentsNextTurn') {
              expireOnSide = (turnSide === 'player') ? 'player' : 'opponent';
            }
            if (action.targetSelf) {
              // Apply to the source card instance
              if (typeof grantTempKeyword === 'function') {
                const s = actionSource?.side || 'player';
                grantTempKeyword(s, actionSource.section, actionSource.keyName, actionSource.index || 0, keyword, expireOnSide);
              }
              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${typeof effect === 'object' ? effect.text : String(effect || '')}`;
                registerUntilNextTurnEffect(expireOnSide || (turnSide === 'player' ? 'opponent' : 'player'), label);
              }
              processNext();
              break;
            }
            // Targeting variant: grant keyword to selected targets
            const targetSideRelative = action.targetSide || 'player';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const maxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const actualSide = activationSource ? resolveActionTargetSideUtil(activationSource, targetSideRelative) : resolveActionTargetSide(targetSideRelative);
            const preCandidates = listValidTargets(actualSide, targetType, { uniqueAcrossSequence: action.uniqueAcrossSequence, cumulative: cumulativeTargets });
            if ((preCandidates.length === 0) || (minTargets === 0 && preCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(targetType, action, cumulativeTargets, getTotalPower, getCardMeta),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach(t => {
                if (typeof grantTempKeyword === 'function') {
                  grantTempKeyword(t.side, t.section, t.keyName, t.index, keyword, expireOnSide);
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${typeof effect === 'object' ? effect.text : String(effect || '')}`;
                registerUntilNextTurnEffect(expireOnSide || (turnSide === 'player' ? 'opponent' : 'player'), label);
              }
              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'disableKeyword': {
            const keyword = action.keyword || '';
            const duration = action.duration || 'thisTurn';
            // Determine expiry side
            let expireOnSide = null;
            if (duration === 'thisTurn') {
              expireOnSide = (turnSide === 'player') ? 'opponent' : 'player';
            } else if (duration === 'untilOpponentsNextTurn') {
              expireOnSide = (turnSide === 'player') ? 'player' : 'opponent';
            }
            // Targeting: disable keyword on selected targets
            const targetSideRelative = action.targetSide || 'opponent';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const maxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const actualSide = activationSource ? resolveActionTargetSideUtil(activationSource, targetSideRelative) : resolveActionTargetSide(targetSideRelative);
            const preCandidates = listValidTargets(actualSide, targetType, {
              powerLimit: action.powerLimit,
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });
            if ((preCandidates.length === 0) || (minTargets === 0 && preCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: createTargetValidator(targetType, { ...action, powerLimit: action.powerLimit }, cumulativeTargets, getTotalPower, getCardMeta),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach(t => {
                if (typeof disableKeyword === 'function') {
                  disableKeyword(t.side, t.section, t.keyName, t.index, keyword, expireOnSide);
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              if (registerUntilNextTurnEffect && duration !== 'permanent') {
                const label = `${cardName}: ${typeof effect === 'object' ? effect.text : String(effect || '')}`;
                registerUntilNextTurnEffect(expireOnSide || (turnSide === 'player' ? 'opponent' : 'player'), label);
              }
              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'giveDon': {
            // Give DON!! from cost area to a target card (leader or character)
            const quantity = action.quantity || 1;
            const targetSideRelative = action.targetSide || 'player';
            const targetType = action.targetType || 'any';
            const minTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const maxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const onlyRested = action.onlyRested !== undefined ? action.onlyRested : true; // Default to rested DON only
            const actualSide = activationSource ? resolveActionTargetSideUtil(activationSource, targetSideRelative) : resolveActionTargetSide(targetSideRelative);

            // Check if there are enough DON!! in cost area
            // Player's cost area is in areas.player.bottom.cost
            // Opponent's cost area is in areas.opponent.top.cost
            const controllerSide = actionSource?.side || 'player';
            const costLoc = controllerSide === 'player' ? areas?.player?.bottom : areas?.opponent?.top;
            const costArr = costLoc?.cost || [];

            // Filter for DON!! cards (id === 'DON') that match the rested requirement
            const availableDon = costArr.filter(d => d.id === 'DON' && (onlyRested ? d.rested : true));


            if (availableDon.length < quantity) {
              processNext();
              break;
            }

            const preCandidates = listValidTargets(actualSide, targetType, {
              uniqueAcrossSequence: action.uniqueAcrossSequence,
              cumulative: cumulativeTargets
            });


            // If minTargets is 0 and there are no candidates, skip
            if (minTargets === 0 && preCandidates.length === 0) {
              processNext();
              break;
            }

            // If minTargets > 0 and no candidates, this is an error condition but still need to process
            if (minTargets > 0 && preCandidates.length === 0) {
              processNext();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: actualSide,
              multi: true,
              min: minTargets,
              max: maxTargets,
              validator: (card, ctx) => {
                if (targetType === 'leader') return ctx?.section === 'middle' && ctx?.keyName === 'leader';
                if (targetType === 'character') {
                  if (ctx?.section !== 'char' || ctx?.keyName !== 'char') return false;
                  if (action.uniqueAcrossSequence && cumulativeTargets.some(t => t.side === ctx.side && t.section === ctx.section && t.keyName === ctx.keyName && t.index === ctx.index)) return false;
                  return true;
                }
                if (targetType === 'any') {
                  const ok = (ctx?.section === 'middle' && ctx?.keyName === 'leader') || (ctx?.section === 'char' && ctx?.keyName === 'char');
                  if (!ok) return false;
                  if (action.uniqueAcrossSequence && cumulativeTargets.some(t => t.side === ctx.side && t.section === ctx.section && t.keyName === ctx.keyName && t.index === ctx.index)) return false;
                  return true;
                }
                return false;
              },
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {

              // Handle case where user cancels (targets array is empty for optional)
              if (targets.length === 0 && minTargets === 0) {
                if (processNextRef.current) processNextRef.current();
                return;
              }

              // Move DON!! by directly manipulating the areas state
              // We need to use a callback approach since setAreas is not available here
              // For now, we'll need to add this functionality to Home.jsx and pass it down

              targets.forEach(t => {

                // Use the moveDonFromCostToCard callback to move DON!!
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

                  if (success) {
                  } else {
                    console.error('[giveDon] Failed to move DON!!');
                  }
                } else {
                  console.error('[giveDon] ERROR: moveDonFromCostToCard callback not available');
                }

                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });

              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'draw':
            // Draw cards action (handled by game state via Home.jsx)
            const drawQuantity = action.quantity || 1;
            processNext();
            break;

          case 'trashFromHand': {
            // Trash cards from hand - use targeting to select cards
            const minCards = action.minCards !== undefined ? action.minCards : 1;
            const maxCards = action.maxCards !== undefined ? action.maxCards : 1;
            const controllerSide = actionSource?.side || 'player';

            // Get hand for validation
            const handLoc = controllerSide === 'player' ? areas?.player?.bottom : areas?.opponent?.top;
            const hand = handLoc?.hand || [];

            if (hand.length === 0 || (minCards === 0 && hand.length === 0)) {
              // No cards to trash or optional with empty hand
              processNext();
              break;
            }

            setSelectedAbilityIndex(abilityIndex);
            // Use targeting system to let player select from hand
            // Use multi: true even for single selection to enable the Resolve button for optional skipping
            startTargeting({
              side: controllerSide,
              section: controllerSide === 'player' ? 'bottom' : 'top',
              keyName: 'hand',
              multi: true, // Always use multi mode to support optional selection with Resolve button
              min: minCards,
              max: maxCards,
              validator: (card, ctx) => {
                // Can select any card from hand
                return ctx?.section === (controllerSide === 'player' ? 'bottom' : 'top') && ctx?.keyName === 'hand';
              },
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {

              // If optional and user selected 0, continue
              if (targets.length === 0 && minCards === 0) {
                if (processNextRef.current) processNextRef.current();
                return;
              }

              // Trash the selected cards from hand
              if (typeof removeCardByEffect === 'function') {
                // Sort indices in descending order to avoid index shifting issues
                const sortedTargets = [...targets].sort((a, b) => b.index - a.index);
                sortedTargets.forEach(t => {
                  removeCardByEffect(t.side, t.section, t.keyName, t.index, t.side);
                });
              }

              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'ko':
            // KO/destroy action - use explicit fields
            const koTargetSideRelative = action.targetSide || 'opponent';
            const koTargetType = action.targetType || 'character';
            const koMinTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const koMaxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const powerLimit = action.powerLimit || null; // Numeric value or null

            // Convert relative targetSide to actual game side
            const koActualTargetSide = activationSource ? resolveActionTargetSideUtil(activationSource, koTargetSideRelative) : resolveActionTargetSide(koTargetSideRelative);

            // Pre-check candidates for KO; if none and it's optional, auto-skip
            const preKoCandidates = listValidTargets(koActualTargetSide, koTargetType, { powerLimit, uniqueAcrossSequence: action.uniqueAcrossSequence, cumulative: cumulativeTargets });
            if ((preKoCandidates.length === 0) || (koMinTargets === 0 && preKoCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: koActualTargetSide,
              multi: true,
              min: koMinTargets,
              max: koMaxTargets,
              validator: createTargetValidator(koTargetType, { ...action, powerLimit }, cumulativeTargets, getTotalPower, getCardMeta),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach(t => {
                if (removeCardByEffect) {
                  removeCardByEffect(t.side, t.section, t.keyName, t.index, actionSource?.side || 'player');
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              // Continue to next action in sequence
              if (processNextRef.current) processNextRef.current();
            });
            break;

          case 'rest': {
            const restTargetSideRelative = action.targetSide || 'opponent';
            const restTargetType = action.targetType || 'any';
            const restMinTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const restMaxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const restActualSide = activationSource ? resolveActionTargetSideUtil(activationSource, restTargetSideRelative) : resolveActionTargetSide(restTargetSideRelative);
            const preRestCandidates = listValidTargets(restActualSide, restTargetType, { requireActive: true, uniqueAcrossSequence: action.uniqueAcrossSequence, cumulative: cumulativeTargets });
            if ((preRestCandidates.length === 0) || (restMinTargets === 0 && preRestCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: restActualSide,
              multi: true,
              min: restMinTargets,
              max: restMaxTargets,
              validator: createStateValidator(restTargetType, false, action, cumulativeTargets),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              targets.forEach(t => {
                if (t.section === 'char' || (t.section === 'middle' && t.keyName === 'leader')) {
                  if (typeof restCard === 'function') {
                    restCard(t.side, t.section, t.keyName, t.index);
                  }
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'active': {
            // Untap targets (leader/character). DON untap not supported via targeting.
            const actTargetSideRelative = action.targetSide || 'player';
            const actTargetType = action.targetType || 'any';
            const actMinTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const actMaxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const actActualSide = activationSource ? resolveActionTargetSideUtil(activationSource, actTargetSideRelative) : resolveActionTargetSide(actTargetSideRelative);
            const preActCandidates = listValidTargets(actActualSide, actTargetType, { requireRested: true, uniqueAcrossSequence: action.uniqueAcrossSequence, cumulative: cumulativeTargets });
            if ((preActCandidates.length === 0) || (actMinTargets === 0 && preActCandidates.length === 0)) {
              processNext();
              break;
            }
            setSelectedAbilityIndex(abilityIndex);
            startTargeting({
              side: actActualSide,
              multi: true,
              min: actMinTargets,
              max: actMaxTargets,
              validator: createStateValidator(actTargetType, true, action, cumulativeTargets),
              origin: actionSource,
              abilityIndex,
              type: 'ability'
            }, (targets) => {
              // Set active by directly updating rested=false via a minimal handler call path
              // We do not have a generic setActive function; this relies on Home's state updates via callbacks being limited.
              // For now, we log and skip actual untap to avoid desync.
              targets.forEach(t => {
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              if (processNextRef.current) processNextRef.current();
            });
            break;
          }

          case 'search':
            // Deck search action - use explicit fields
            const lookCount = action.lookCount || 5;
            // Use actionSource.side to determine the controller's side, not hardcoded "player"
            // This ensures opponent's cards search opponent's deck/hand
            const sourceSide = actionSource?.side || 'player';
            const filterType = action.filterType || null; // Card type to filter for
            const filterColor = action.filterColor || null; // Card color to filter for
            const filterAttribute = action.filterAttribute || null; // Card attribute to filter for
            const minSelect = action.minSelect !== undefined ? action.minSelect : 0;
            const maxSelect = action.maxSelect !== undefined ? action.maxSelect : 1;
            const destination = action.destination || 'hand'; // "hand" | "deck" | "trash"
            const remainderLocation = action.remainderLocation || 'bottom'; // "top" | "bottom" | "shuffle"

            if (startDeckSearch) {
              startDeckSearch({
                side: sourceSide,
                quantity: lookCount,
                filter: {
                  ...(filterType ? { type: filterType } : {}),
                  ...(filterColor ? { color: filterColor } : {}),
                  ...(filterAttribute ? { attribute: filterAttribute } : {})
                },
                minSelect: minSelect,
                maxSelect: maxSelect,
                returnLocation: remainderLocation,
                effectDescription: effect.text,
                onComplete: (selectedCards, remainder) => {
                  console.log(`[Ability] Deck search complete: ${selectedCards.length} selected, ${remainder.length} returned to ${remainderLocation}`);
                  // Continue after search completes
                  if (processNextRef.current) processNextRef.current();
                }
              });
            }

            setSelectedAbilityIndex(null);
            break;

          default:
            console.log(`[Ability] Unknown action type: ${action.type}`);
            // Skip unknown and continue
            if (processNextRef.current) processNextRef.current();
        }
      };

      // Store processNext in ref so it persists across renders
      processNextRef.current = processNext;

      // Helper function that always calls the latest processNext from ref
      const callProcessNext = () => {
        if (processNextRef.current) {
          processNextRef.current();
        }
      };

      // Kick off sequential processing
      processNext();
    } else {
      // No structured actions - card needs to be updated with action schema
      console.warn(`[Ability] Card ${cardName} has no structured actions - needs update`);
      completeAbilityActivation();
    }
  }, [activatableAbilities, applyPowerMod, registerUntilNextTurnEffect, turnSide, cardName, startTargeting, getCardMeta, startDeckSearch, actionSource, listValidTargets, resolveActionTargetSide, removeCardByEffect, grantTempKeyword, disableKeyword, moveDonFromCostToCard, restCard, setResolvingEffect, getTotalPower, abilityHasAnySelectableTargets, returnCardToDeck, cardIndex, payLife, setAbilityUsed, setSelectedAbilityIndex, confirmTargeting, cancelTargeting, cardMeta, card, markAbilityUsed]);

  // Auto-trigger On Play abilities when card is just played (unless autoResolve === false)
  // According to Rule 8-1-3-1-3, On Play effects are AUTO effects that must trigger immediately
  useEffect(() => {
    if (!wasJustPlayed || autoTriggeredOnPlay) return;
    if (!abilities || abilities.length === 0) return;

    console.log('[Auto-Trigger] Checking for On Play abilities...', { wasJustPlayed, abilities });

    // Find On Play abilities that haven't been used yet
    const abilityIndex = abilities.findIndex((ability, index) => {
      const type = ability.type || '';
      const isOnPlay = type === 'On Play';
      const notUsed = !abilityUsed[index];
      const autoResolve = ability.autoResolve !== false; // default true
      const hasTargets = abilityHasAnySelectableTargets(ability);
      console.log(`[Auto-Trigger] Ability ${index}:`, { type, isOnPlay, notUsed, autoResolve, hasTargets });
      // Auto-trigger if autoResolve is true OR there are no valid targets to choose from
      return isOnPlay && notUsed && (autoResolve || !hasTargets);
    });

    if (abilityIndex === -1) {
      console.log('[Auto-Trigger] No On Play abilities found');
      // Mark as triggered even if no ability found to prevent re-checking
      setAutoTriggeredOnPlay(true);
      return;
    }

    const ability = abilities[abilityIndex];
    console.log(`[Auto-Trigger] Triggering On Play ability for ${cardName} (index ${abilityIndex})`, ability);

    // Mark that we've seen this card's On Play trigger opportunity
    setAutoTriggeredOnPlay(true);

    // Call the standard activateAbility function to handle all action types uniformly
    // This will handle powerMod, search, KO, draw, etc. with proper targeting UI
    // Use setTimeout to ensure the Actions panel is fully rendered before starting targeting
    setTimeout(() => {
      activateAbility(abilityIndex);
    }, 100); // Small delay to ensure UI is ready
  }, [wasJustPlayed, autoTriggeredOnPlay, abilities, abilityUsed, cardName, activateAbility, abilityHasAnySelectableTargets]);

  // NOTE: Removed duplicate auto-confirm effect.
  // Auto-confirm timing is now handled centrally in Home.jsx targeting system.
  // This prevents stale timers from previous action steps firing after a new step starts.

  // If no card provided, render as simple container
  if (!card || !cardMeta) {
    return (
      <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
        <Paper elevation={6} sx={{ width, height: height || 'auto', maxHeight, display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden' }}>
          <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
            {onClose && (
              <IconButton size="small" onClick={onClose} aria-label="close actions">
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Box sx={{ p: 1, flex: 1, minHeight: 0, overflow: 'auto', bgcolor: 'background.paper' }}>
            {children}
          </Box>
        </Paper>
      </Box>
    );
  }

  // Render with card abilities
  return (
    <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
      <Paper elevation={6} sx={{ width, height: height || 'auto', maxHeight, display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {cardId}{cardName && cardName !== cardId ? ` — ${cardName}` : ''}
          </Typography>
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="close actions">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflow: 'auto', bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            {/* Card Type Info */}
            <Typography variant="caption" color="text.secondary">
              {category}
              {cardMeta.attribute && ` • ${cardMeta.attribute}`}
              {cardMeta.types && cardMeta.types.length > 0 && ` • ${cardMeta.types.join('/')}`}
              {cost !== null && cost !== undefined && ` • Cost ${cost}`}
              {basePower > 0 && ` • Power ${basePower}`}
              {life && ` • Life ${life}`}
            </Typography>

            {/* Keywords Display (exclude ability-type labels like "On Play") */}
            {displayKeywords.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {displayKeywords.map((keyword, idx) => (
                  <Chip
                    key={idx}
                    label={keyword}
                    size="small"
                    color={getKeywordColor(keyword)}
                  />
                ))}
              </Stack>
            )}

            {/* Counter Value */}
            {counterValue !== null && (
              <Chip label={`Counter +${counterValue}`} size="small" color="success" />
            )}

            {/* Abilities Section */}
            {abilities.length > 0 ? (
              <Box>
                <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>Abilities</Typography>
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
                      {/* Ability Type */}
                      <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip
                          label={ability.type || 'Unknown'}
                          size="small"
                          color="primary"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {ability.frequency && (
                          <Chip label={ability.frequency} size="small" variant="outlined" />
                        )}
                        {ability.condition?.don > 0 && (
                          <Chip label={`DON!! x${ability.condition.don}`} size="small" color="secondary" />
                        )}
                      </Stack>

                      {/* Effect Text */}
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {typeof ability.effect === 'string' ? ability.effect : ability.effect?.text || 'No description'}
                      </Typography>

                      {/* Activation Controls */}
                      {ability.canActivate && !(selectedAbilityIndex === idx && targeting?.active) ? (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => activateAbility(idx)}
                          disabled={selectedAbilityIndex !== null && selectedAbilityIndex !== idx}
                        >
                          Activate
                        </Button>
                      ) : !ability.canActivate ? (
                        <Alert
                          severity={
                            (ability.reason || '').toLowerCase().includes('resolving') ? 'warning' :
                              ability.reason?.toLowerCase().includes('already') ? 'info' :
                                'info'
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
                        <TargetSelectionUI
                          targeting={targeting}
                          areas={areas}
                          getCardMeta={getCardMeta}
                          confirmTargeting={confirmTargeting}
                          cancelTargeting={cancelTargeting}
                          onCancel={() => setSelectedAbilityIndex(null)}
                        />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No special abilities
              </Typography>
            )}

            {/* Full Card Text (hide if structured abilities are present to avoid duplication) */}
            {cardMeta.text && (abilities?.length === 0) && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {cardMeta.text}
                </Typography>
              </>
            )}

            {/* Trigger Text */}
            {cardMeta.trigger && (
              <Box sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={700}>
                  [Trigger]: {cardMeta.trigger.text}
                </Typography>
              </Box>
            )}

            {/* Blocker Activation Button - shown during Block Step for cards with Blocker keyword */}
            {useMemo(() => {
              // Check if we're in the block step
              if (!battle || battle.step !== 'block') return null;

              // Check if this card's side is defending
              const defendingSide = battle.target?.side;
              const cardSide = actionSource?.side;
              if (cardSide !== defendingSide) return null;

              // Check if target is not already a character (only show if leader is being attacked)
              if (battle.target?.section === 'char') return null;

              // Check if card is in the char area
              if (actionSource?.section !== 'char' || actionSource?.keyName !== 'char') return null;

              // Check if card has Blocker keyword
              const hasBlocker = keywords.some(k => /blocker/i.test(k));
              if (!hasBlocker) return null;

              // Check if card is active (not rested)
              if (card?.rested) return null;

              // All conditions met - show the blocker button
              return (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Box>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                      This card can be used as a blocker to redirect the attack.
                    </Typography>
                    <Button
                      fullWidth
                      variant="contained"
                      color="error"
                      size="medium"
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
            }, [battle, actionSource, keywords, card?.rested, cardIndex, battleApplyBlocker, onClose])}

            {/* Additional children (play controls, attack controls, etc.) */}
            {children}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
