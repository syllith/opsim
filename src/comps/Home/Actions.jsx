// Actions.jsx
// Fixed panel anchored bottom-right to show card abilities and actions
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Paper, Box, Typography, IconButton, Stack, Divider, Button, Chip, Alert, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Actions - Universal component for displaying and activating card abilities
 * Now integrated with ability handling from JSON data
 */
export default function Actions({ 
  title = 'Actions', 
  onClose, 
  card,
  cardMeta,
  cardIndex,
  actionSource,
  phase,
  turnSide,
  turnNumber,
  isYourTurn,
  canActivateMain,
  areas,
  startTargeting,
  cancelTargeting,
  confirmTargeting,
  targeting,
  getCardMeta,
  applyPowerMod,
  registerUntilNextTurnEffect,
  giveDonToCard,
  startDeckSearch,
  returnCardToDeck,
  battle,
  battleApplyBlocker,
  battleSkipBlock,
  battleAddCounterFromHand,
  battlePlayCounterEvent,
  battleEndCounterStep,
  battleGetDefPower,
  removeCardByEffect,
  setResolvingEffect,
  getTotalPower,
  children,
  width = 420,
  height,
  maxHeight = 'calc(100vh - 32px)'
}) {
  // Local state for ability activation tracking
  const [abilityUsed, setAbilityUsed] = useState({}); // Track once-per-turn abilities
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState(null);
  const [targetInputs, setTargetInputs] = useState({}); // Store user inputs
  const [autoTriggeredOnPlay, setAutoTriggeredOnPlay] = useState(false); // Track if On Play was auto-triggered

  // Cleanup on unmount: if the panel closes mid-resolution/targeting, clear global state
  useEffect(() => {
    return () => {
      try {
        if (targeting?.active && typeof cancelTargeting === 'function') cancelTargeting();
        if (typeof setResolvingEffect === 'function') setResolvingEffect(false);
      } catch {}
    };
  }, [targeting?.active, cancelTargeting, setResolvingEffect]);

  // Extract card information
  const cardId = card?.id;
  const abilities = cardMeta?.abilities || [];
  const keywords = cardMeta?.keywords || [];
  const cardName = cardMeta?.name || cardId;
  const category = cardMeta?.category || 'Unknown';
  const basePower = cardMeta?.stats?.power || 0;
  const cost = cardMeta?.stats?.cost || 0;
  const life = cardMeta?.stats?.life;
  const counterValue = cardMeta?.stats?.counter?.present ? cardMeta?.stats?.counter?.value : null;

  // Deduplicate badges: hide ability-type labels from top keyword chips
  const abilityTypeSet = useMemo(() => new Set((abilities || []).map(a => String(a?.type || '').toLowerCase())), [abilities]);
  const displayKeywords = useMemo(
    () => (keywords || []).filter(k => !abilityTypeSet.has(String(k || '').toLowerCase())),
    [keywords, abilityTypeSet]
  );

  // Check if this specific card instance is still on the field
  const isOnField = useMemo(() => {
    if (!actionSource || !areas || !card?.id) return false;
    const { side, section, keyName, index } = actionSource;
    const sideLoc = side === 'player' ? areas.player : areas.opponent;
    try {
      if (section === 'char' && keyName === 'char') {
        const arr = sideLoc?.char || [];
        const inst = arr[index];
        return !!(inst && inst.id === card.id);
      }
      if (section === 'middle' && keyName === 'leader') {
        const arr = sideLoc?.middle?.leader || [];
        const inst = arr[0];
        return !!(inst && inst.id === card.id);
      }
    } catch {}
    return false;
  }, [actionSource, areas, card?.id]);

  // Check if this card was just played this turn (for On Play auto-triggering)
  // According to Rule 8-1-3-1-3, On Play must trigger immediately when played
  const wasJustPlayed = useMemo(() => {
    console.log('[wasJustPlayed] Check:', { 
      justPlayed: actionSource?.justPlayed, 
      enteredTurn: card?.enteredTurn, 
      turnNumber,
      actionSource,
      card
    });
    if (!actionSource?.justPlayed) return false;
    // Also verify the card has the expected enteredTurn marker
    if (card?.enteredTurn === turnNumber) return true;
    return false;
  }, [actionSource, card, turnNumber]);

  // Shared helper: list valid targets for a given side/type using current board state
  const listValidTargets = useCallback((sideSpec, targetType, opts = {}) => {
    const results = [];
    const sides = sideSpec === 'both' ? ['player', 'opponent'] : [sideSpec];
    for (const side of sides) {
      const sideLoc = side === 'player' ? areas?.player : areas?.opponent;
      if (!sideLoc) continue;
      if (targetType === 'leader' || targetType === 'any') {
        const leaderArr = sideLoc?.middle?.leader || [];
        if (leaderArr[0]) {
          const ctx = { side, section: 'middle', keyName: 'leader', index: 0, card: leaderArr[0] };
          if (!opts.uniqueAcrossSequence || !opts.cumulative?.some(t => t.side===side && t.section==='middle' && t.keyName==='leader' && t.index===0)) {
            results.push(ctx);
          }
        }
      }
      if (targetType === 'character' || targetType === 'any') {
        const charArr = sideLoc?.char || [];
        for (let i = 0; i < charArr.length; i++) {
          const c = charArr[i];
          if (!c) continue;
          const ctx = { side, section: 'char', keyName: 'char', index: i, card: c };
          if (opts.uniqueAcrossSequence && opts.cumulative?.some(t => t.side===side && t.section==='char' && t.keyName==='char' && t.index===i)) continue;
          if (typeof opts.powerLimit === 'number') {
            // Use live total power if provided
            const liveP = typeof getTotalPower === 'function' ? getTotalPower(side, 'char', 'char', i, c.id) : (getCardMeta(c.id)?.stats?.power || 0);
            if (liveP > opts.powerLimit) continue;
          }
          results.push(ctx);
        }
      }
    }
    return results;
  }, [areas, getCardMeta, getTotalPower]);

  // Helper to compute the actual target side from an action's relative side
  const resolveActionTargetSide = useCallback((relativeSide) => {
    const controller = actionSource?.side || 'player';
    if (relativeSide === 'both') return 'both';
    if (relativeSide === 'opponent') return controller === 'player' ? 'opponent' : 'player';
    return controller; // 'player' => controller's side
  }, [actionSource?.side]);

  // Determine if an ability has any selectable targets (for actions that require targeting)
  const abilityHasAnySelectableTargets = useCallback((ability) => {
    try {
      const effect = ability?.effect;
      const actions = effect && typeof effect === 'object' ? (effect.actions || []) : [];
      if (!Array.isArray(actions) || actions.length === 0) {
        // No structured actions: treat as not requiring board targets
        return true;
      }
      for (const action of actions) {
        if (action?.type === 'powerMod') {
          const side = resolveActionTargetSide(action.targetSide || 'opponent');
          const pre = listValidTargets(side, action.targetType || 'any', { powerLimit: action.powerLimit });
          if (pre.length > 0) return true;
        } else if (action?.type === 'ko') {
          const side = resolveActionTargetSide(action.targetSide || 'opponent');
          const pre = listValidTargets(side, action.targetType || 'character', { powerLimit: action.powerLimit });
          if (pre.length > 0) return true;
        } else if (action?.type === 'search') {
          // Search does not target board objects; it always can proceed
          return true;
        } else {
          // Unknown action types assumed not needing targets
          return true;
        }
      }
      // If all target-requiring actions have zero candidates
      return false;
    } catch {
      return true; // Fail-open to avoid blocking activation incorrectly
    }
  }, [listValidTargets, resolveActionTargetSide]);

  // Get abilities that can be activated based on current game state
  const activatableAbilities = useMemo(() => {
    return abilities.map((ability, index) => {
      const typeLabel = ability.type || 'Unknown';
      const type = String(typeLabel);
      const condition = ability.condition || {};
      const frequency = ability.frequency?.toLowerCase() || '';

      let canActivate = false;
      let reason = '';

      // Core ability type checks
      switch (type) {
        case 'On Play':
          // On Play abilities generally auto-trigger. If marked as optional via autoResolve === false,
          // allow manual activation window immediately after play instead of auto-targeting.
          if (abilityUsed[index]) {
            canActivate = false;
            reason = 'Already resolved when this card was played';
          } else if (!isOnField) {
            canActivate = false;
            reason = 'Resolves only when this card is played';
          } else if (!wasJustPlayed) {
            canActivate = false;
            reason = 'Already resolved!';
          } else {
            const autoResolve = ability.autoResolve !== false; // default true
            // If optional but there are no valid targets, auto-resolve and skip showing Activate
            const hasTargets = abilityHasAnySelectableTargets(ability);
            canActivate = !autoResolve && hasTargets;
            reason = (autoResolve || !hasTargets) ? 'Resolving!' : '';
          }
          break;

        case 'Activate Main':
          // Manual activation during Main Phase
          // Must be on the field (Character area, Leader area, or Stage area)
          canActivate = phase?.toLowerCase() === 'main' && isYourTurn && !battle && isOnField;
          if (!isOnField) {
            reason = 'Card must be on the field to activate';
          } else if (!canActivate) {
            reason = 'Only during your Main Phase';
          }
          break;

        case 'On Attack':
          // Allow activation during Attack Step OR early Block Step before blocker chosen
          canActivate = battle && battle.attacker?.id === cardId && (battle.step === 'attack' || (battle.step === 'block' && !battle.blockerUsed));
          reason = canActivate ? '' : 'Only when this card attacks';
          break;

        case 'On Block':
          // Triggers when this card blocks
          canActivate = battle && battle.step === 'block' && battle.blockerUsed;
          reason = canActivate ? '' : 'Only when this card blocks';
          break;

        case 'Blocker':
          // Blocker is handled separately in battle system
          canActivate = false;
          reason = 'Keyword ability (automatic)';
          break;

        case 'Counter':
          // Counter abilities during Counter Step
          canActivate = battle && battle.step === 'counter';
          reason = canActivate ? '' : 'Only during Counter Step';
          break;

        case 'On KO':
          // Triggers when card is KO'd (handled by game engine)
          canActivate = false;
          reason = 'Triggers automatically when KO\'d';
          break;

        case 'End of Turn':
          // Would trigger at end of turn
          canActivate = false;
          reason = 'Triggers at end of turn';
          break;

        case 'Opponents Turn':
          // Only when your opponent is actively attacking you
          // Require a battle in progress where this card's controller is the target side
          if (battle && actionSource?.side && battle.target?.side === actionSource.side) {
            // Allow during the initial attack declaration and block step windows
            const step = battle.step;
            canActivate = step === 'attack' || step === 'block';
          } else {
            canActivate = false;
          }
          reason = canActivate ? '' : 'Only when you are being attacked';
          break;

        case 'Continuous':
          // Continuous effects are always active
          canActivate = false;
          reason = 'Passive effect (always active)';
          break;

        default:
          // Unknown or special abilities
          canActivate = phase?.toLowerCase() === 'main' && isYourTurn;
          reason = canActivate ? '' : 'Cannot activate now';
      }

      // Check DON!! requirement (condition.don) using live board state
      if (condition.don && condition.don > 0 && isOnField) {
        let donCount = 0;
        try {
          const sideLoc = actionSource?.side === 'opponent' ? areas?.opponent : areas?.player;
          if (actionSource?.section === 'middle' && actionSource?.keyName === 'leader') {
            donCount = (sideLoc?.middle?.leaderDon || []).length;
          } else if (actionSource?.section === 'char' && actionSource?.keyName === 'char') {
            donCount = (sideLoc?.charDon?.[actionSource.index] || []).length;
          }
        } catch {}
        if (donCount < condition.don) {
          canActivate = false;
          reason = `Needs ${condition.don} DON!! attached`;
        }
      }

      // Check Once Per Turn restriction
      if (frequency === 'once per turn' && abilityUsed[index]) {
        canActivate = false;
        reason = 'Already used this turn';
      }

      return {
        ...ability,
        index,
        canActivate,
        reason,
        // Keep type as-is for display and internal checks
        type: typeLabel,
        typeKey: type,
        condition
      };
    });
  }, [abilities, phase, isYourTurn, battle, cardId, abilityUsed, isOnField, wasJustPlayed, abilityHasAnySelectableTargets]);

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
    
    // Helper function to mark ability as used and pay costs
    // This should ONLY be called after targets are selected and effect is applied
    const completeAbilityActivation = () => {
      // Mark as used for Once Per Turn abilities and On Play abilities
      if (ability.frequency?.toLowerCase() === 'once per turn' || isOnPlay) {
        setAbilityUsed(prev => ({ ...prev, [abilityIndex]: true }));
      }
      
      // Pay costs AFTER effect is applied and confirmed
      if (cost) {
        // Handle returnThisToDeck cost (return to top/bottom/shuffle)
        if (cost.returnThisToDeck && returnCardToDeck && actionSource) {
          console.log(`[Ability] Paying cost: Return this card to ${cost.returnThisToDeck} of deck`);
          returnCardToDeck(
            actionSource.side,
            actionSource.section,
            actionSource.keyName,
            actionSource.index || cardIndex,
            cost.returnThisToDeck
          );
        }
        
        // Handle trashThis cost (move card to trash instead of deck)
        if (cost.trashThis && actionSource) {
          console.log('[Ability] Paying cost: Trash this card');
          // TODO: Implement trashCard function similar to returnCardToDeck
          // trashCard(actionSource.side, actionSource.section, actionSource.keyName, actionSource.index || cardIndex);
        }
        
        // Handle restThis cost (rest/tap this card)
        if (cost.restThis && actionSource) {
          console.log('[Ability] Paying cost: Rest this card');
          // TODO: Implement restCard function
          // restCard(actionSource.side, actionSource.section, actionSource.keyName, actionSource.index || cardIndex);
        }
        
        // Handle restDon cost (rest X DON!! cards from cost area)
        if (cost.restDon && typeof cost.restDon === 'number') {
          console.log(`[Ability] Paying cost: Rest ${cost.restDon} DON!!`);
          // TODO: Implement restDon function
          // restDon(actionSource.side, cost.restDon);
        }
        
        // Handle trash cost (trash X cards from hand)
        if (cost.trash && typeof cost.trash === 'number') {
          console.log(`[Ability] Paying cost: Trash ${cost.trash} card(s) from hand`);
          // TODO: Implement hand card selection and trash
          // This would need to open a card selection UI for the player to choose which cards to trash
          // startHandSelection(actionSource.side, cost.trash, (selectedCards) => { trashCards(selectedCards); });
        }
        
        // Handle discardFromLife cost (discard X cards from life)
        if (cost.discardFromLife && typeof cost.discardFromLife === 'number') {
          console.log(`[Ability] Paying cost: Discard ${cost.discardFromLife} card(s) from life`);
          // TODO: Implement life card selection and discard
          // startLifeSelection(actionSource.side, cost.discardFromLife, (selectedCards) => { discardFromLife(selectedCards); });
        }
        
        // Handle payLifeCost (take damage as a cost)
        if (cost.payLife && typeof cost.payLife === 'number') {
          console.log(`[Ability] Paying cost: Pay ${cost.payLife} life`);
          // TODO: Implement life payment
          // payLife(actionSource.side, cost.payLife);
        }
      }
    };

    // Check if effect has structured actions array
    const hasStructuredActions = typeof effect === 'object' && effect.actions && Array.isArray(effect.actions);
    const effectText = (typeof effect === 'string' ? effect : effect.text || '').toLowerCase();

    // Handle structured actions first (preferred method)
    if (hasStructuredActions) {
      // Process actions sequentially so multi-step abilities can chain
      const actionsQueue = [...effect.actions];
      const cumulativeTargets = []; // remember prior selections within this ability resolution
      if (setResolvingEffect) setResolvingEffect(true);
      // Use shared listValidTargets helper

      const processNext = () => {
        const action = actionsQueue.shift();
        if (!action) {
          // All actions complete; finalize ability
          completeAbilityActivation();
          setSelectedAbilityIndex(null);
          if (setResolvingEffect) setResolvingEffect(false);
          return;
        }

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
            const actualTargetSide = resolveActionTargetSide(targetSideRelative);
            
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
              validator: (card, ctx) => {
                // Validate based on targetType
                console.log('[Validator] targetType:', targetType, 'ctx:', ctx);
                if (targetType === 'leader') {
                  return ctx?.section === 'middle' && ctx?.keyName === 'leader';
                }
                if (targetType === 'character') {
                  const isValid = ctx?.section === 'char' && ctx?.keyName === 'char';
                  console.log('[Validator] character check:', isValid, 'section:', ctx?.section, 'keyName:', ctx?.keyName);
                  if (!isValid) return false;
                  if (action.uniqueAcrossSequence && cumulativeTargets.some(t => t.side === ctx.side && t.section === ctx.section && t.keyName === ctx.keyName && t.index === ctx.index)) return false;
                  return true;
                }
                if (targetType === 'any') {
                  const ok = (ctx?.section === 'middle' && ctx?.keyName === 'leader') ||
                             (ctx?.section === 'char' && ctx?.keyName === 'char');
                  if (!ok) return false;
                  if (action.uniqueAcrossSequence && cumulativeTargets.some(t => t.side === ctx.side && t.section === ctx.section && t.keyName === ctx.keyName && t.index === ctx.index)) return false;
                  return true;
                }
                return false;
              }
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
              processNext();
            });
            break;

          case 'draw':
            // Draw cards action
            const drawQuantity = action.quantity || 1;
            console.log(`[Ability] Draw ${drawQuantity} card(s)`);
            // TODO: Implement draw in game state
            break;

          case 'ko':
            // KO/destroy action - use explicit fields
            const koTargetSideRelative = action.targetSide || 'opponent';
            const koTargetType = action.targetType || 'character';
            const koMinTargets = action.minTargets !== undefined ? action.minTargets : 1;
            const koMaxTargets = action.maxTargets !== undefined ? action.maxTargets : 1;
            const powerLimit = action.powerLimit || null; // Numeric value or null
            
            // Convert relative targetSide to actual game side
            const koActualTargetSide = resolveActionTargetSide(koTargetSideRelative);
            
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
              validator: (card, ctx) => {
                // Validate target type
                if (koTargetType === 'character' && ctx?.section !== 'char') return false;
                if (koTargetType === 'leader' && (ctx?.section !== 'middle' || ctx?.keyName !== 'leader')) return false;
                
                // Validate power limit if specified
                if (powerLimit !== null) {
                  const meta = getCardMeta(card.id);
                  return (meta?.stats?.power || 0) <= powerLimit;
                }
                if (action.uniqueAcrossSequence && cumulativeTargets.some(t => t.side === ctx.side && t.section === ctx.section && t.keyName === ctx.keyName && t.index === ctx.index)) return false;
                return true;
              }
            }, (targets) => {
              targets.forEach(t => {
                if (removeCardByEffect) {
                  removeCardByEffect(t.side, t.section, t.keyName, t.index, actionSource?.side || 'player');
                } else {
                  console.log(`[Ability] KO target (no handler): ${t.card?.id}`);
                }
                cumulativeTargets.push({ side: t.side, section: t.section, keyName: t.keyName, index: t.index });
              });
              // Continue to next action in sequence
              processNext();
            });
            break;

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
                  processNext();
                }
              });
            }
            
            setSelectedAbilityIndex(null);
            break;

          default:
            console.log(`[Ability] Unknown action type: ${action.type}`);
            // Skip unknown and continue
            processNext();
        }
      };

      // Kick off sequential processing
      processNext();
      return; // Skip text parsing if we handled structured actions
    }

    // Fallback: Handle different effect types based on keywords in text
    if (effectText.includes('draw')) {
      const match = effectText.match(/draw (\d+)/);
      const quantity = match ? parseInt(match[1]) : 1;
      console.log(`[Ability] Draw ${quantity} card(s)`);
      // TODO: Implement draw in game state
    }

    if (effectText.includes('ko') || effectText.includes('k.o.')) {
      // Start targeting for KO effect
      setSelectedAbilityIndex(abilityIndex);
      const powerMatch = effectText.match(/(\d+)\s*power or less/);
      const powerLimit = powerMatch ? parseInt(powerMatch[1]) : null;
      
      startTargeting({
        side: 'opponent',
        multi: true,
        min: 0,
        max: 1,
        validator: (card, ctx) => {
          if (ctx?.section !== 'char') return false;
          if (powerLimit) {
            const meta = getCardMeta(card.id);
            return (meta?.stats?.power || 0) <= powerLimit;
          }
          return true;
        }
      }, (targets) => {
        targets.forEach(t => {
          console.log(`[Ability] KO target: ${t.card?.id}`);
          // TODO: Implement KO in game state
        });
        
        // Mark ability as used and pay costs AFTER effect is successfully applied
        completeAbilityActivation();
        
        setSelectedAbilityIndex(null);
      });
    }

    if (effectText.includes('power') && (effectText.includes('+') || effectText.includes('-'))) {
      // Power modification effect
      const match = effectText.match(/([+-]\d+)\s*power/);
      const amount = match ? parseInt(match[1]) : 0;
      const textHasThisTurn = effectText.includes('this turn');
      
      setSelectedAbilityIndex(abilityIndex);
      startTargeting({
        side: effectText.includes('opponent') ? 'opponent' : 'player',
        multi: true,
        min: 0,
        max: 1,
        validator: (card, ctx) => {
          if (effectText.includes('leader') && ctx?.section === 'middle' && ctx?.keyName === 'leader') return true;
          if (effectText.includes('character') && ctx?.section === 'char' && ctx?.keyName === 'char') return true;
          return false;
        }
      }, (targets) => {
        targets.forEach(t => {
          if (applyPowerMod) {
            // For text-based parsing, assume 'thisTurn' if the effect includes it
            const expireOnSide = textHasThisTurn ? ((turnSide === 'player') ? 'opponent' : 'player') : null;
            applyPowerMod(t.side, t.section, t.keyName, t.index, amount, expireOnSide);
          }
        });
        
        if (textHasThisTurn && registerUntilNextTurnEffect) {
          registerUntilNextTurnEffect(turnSide, `${cardName}: ${effect}`);
        }
        
        // Mark ability as used and pay costs AFTER effect is successfully applied
        completeAbilityActivation();
        
        setSelectedAbilityIndex(null);
      });
    }

    if (effectText.includes('look at') && effectText.includes('deck')) {
      // Deck search effect - parse parameters from effect text or structured actions
      const effect = ability.effect;
      const actions = typeof effect === 'object' ? effect.actions : null;
      
      let lookCount = 5;
      let filterCriteria = {};
      let minSelect = 0;
      let maxSelect = 1;
      let returnLocation = 'bottom';
      let effectDesc = effectText;
      
      // Try to parse from structured actions first
      if (actions && actions.length > 0) {
        const searchAction = actions.find(a => a.type === 'search');
        if (searchAction) {
          lookCount = searchAction.quantity || 5;
          
          // Parse filter from target field (e.g., "Red Haired Pirates")
          if (searchAction.target) {
            filterCriteria.type = searchAction.target;
          }
          
          // Parse selection limits
          const filterStr = searchAction.filter || '';
          if (filterStr.includes('up to')) {
            const match = filterStr.match(/up to (\d+)/);
            maxSelect = match ? parseInt(match[1]) : 1;
            minSelect = 0;
          }
          
          // Parse return location
          if (searchAction.remainder) {
            if (searchAction.remainder.includes('bottom')) {
              returnLocation = 'bottom';
            } else if (searchAction.remainder.includes('top')) {
              returnLocation = 'top';
            } else if (searchAction.remainder.includes('shuffle')) {
              returnLocation = 'shuffle';
            }
          }
        }
      } else {
        // Fallback: parse from text
        const lookMatch = effectText.match(/top (\d+)/);
        if (lookMatch) lookCount = parseInt(lookMatch[1]);
        
        const selectMatch = effectText.match(/up to (\d+)/);
        if (selectMatch) {
          maxSelect = parseInt(selectMatch[1]);
          minSelect = 0;
        }
        
        // Try to extract type filter from quotes
        const typeMatch = effectText.match(/"([^"]+)"/);
        if (typeMatch) {
          filterCriteria.type = typeMatch[1];
        }
        
        // Determine return location
        if (effectText.includes('bottom')) {
          returnLocation = 'bottom';
        } else if (effectText.includes('top')) {
          returnLocation = 'top';
        } else if (effectText.includes('shuffle')) {
          returnLocation = 'shuffle';
        }
      }
      
      // Determine which side's deck to search
      const searchSide = actionSource?.side || 'player';
      
      if (startDeckSearch) {
        startDeckSearch({
          side: searchSide,
          quantity: lookCount,
          filter: filterCriteria,
          minSelect: minSelect,
          maxSelect: maxSelect,
          returnLocation: returnLocation,
          effectDescription: effectDesc,
          onComplete: (selectedCards, remainder) => {
            console.log(`[Ability] Deck search complete: ${selectedCards.length} selected, ${remainder.length} returned to ${returnLocation}`);
            
            // Mark ability as used and pay costs AFTER effect is successfully applied
            completeAbilityActivation();
          }
        });
      } else {
        console.log(`[Ability] Look at top ${lookCount} cards (startDeckSearch not available)`);
      }
      
      setSelectedAbilityIndex(null);
    }

    if (effectText.includes('add') && effectText.includes('don')) {
      // DON!! manipulation
      const match = effectText.match(/(\d+)\s*don/i);
      const quantity = match ? parseInt(match[1]) : 1;
      console.log(`[Ability] Add ${quantity} DON!!`);
      // TODO: Implement DON!! adding
    }

    console.log(`[Ability] Activated: ${cardName} - ${effect}`);
  }, [activatableAbilities, applyPowerMod, registerUntilNextTurnEffect, turnSide, cardName, startTargeting, getCardMeta, startDeckSearch, actionSource, listValidTargets, resolveActionTargetSide]);

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

  // Auto-confirm targeting for optional targets (minTargets = 0)
  // When user selects a target for "up to X" effects, auto-confirm immediately
  useEffect(() => {
    if (!targeting?.active) return;
    if (!targeting.selected || targeting.selected.length === 0) return;
    
    // Only auto-confirm if minTargets is 0 (optional targeting like "up to 1")
    // If minTargets > 0, user must manually confirm to ensure they want those specific targets
    if (targeting.min === 0) {
      const maxTargets = targeting.max || 1;
      const currentSelections = targeting.selected.length;
      
      // If we've reached the maximum number of targets, auto-confirm and close
      if (currentSelections >= maxTargets) {
        console.log('[Auto-Confirm] Max targets reached, auto-confirming...');
        setTimeout(() => {
          if (confirmTargeting) {
            confirmTargeting();
            setSelectedAbilityIndex(null);
          }
        }, 150);
      } else {
        // For multi-target "up to X", don't auto-close after each selection
        // User can continue selecting or click "Resolve" to finish
        console.log(`[Auto-Select] Target ${currentSelections}/${maxTargets} selected, waiting for more or resolve...`);
      }
    }
  }, [targeting?.active, targeting?.selected?.length, targeting?.min, targeting?.max, confirmTargeting]);

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
                    color={
                      keyword.toLowerCase().includes('rush') ? 'warning' :
                      keyword.toLowerCase().includes('blocker') ? 'info' :
                      keyword.toLowerCase().includes('double attack') ? 'error' :
                      'default'
                    }
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
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          {/* Selected targets display */}
                          {targeting.selected && targeting.selected.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                Selected Target{targeting.selected.length > 1 ? 's' : ''}:
                              </Typography>
                              {targeting.selected.map((target, tidx) => {
                                let targetName = 'Unknown';
                                if (target.section === 'middle' && target.keyName === 'leader') {
                                  targetName = `${target.side === 'player' ? 'Your' : 'Opponent'} Leader`;
                                } else if (target.section === 'char' && target.keyName === 'char') {
                                  const targetSide = target.side === 'player' ? areas?.player : areas?.opponent;
                                  const targetCard = targetSide?.char?.[target.index];
                                  const targetMeta = targetCard ? getCardMeta(targetCard.id) : null;
                                  targetName = targetMeta?.name || targetCard?.id || 'Character';
                                }
                                return (
                                  <Chip 
                                    key={tidx}
                                    label={targetName}
                                    size="small"
                                    color="warning"
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                          {/* Action buttons */}
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                              {targeting.min === 0 
                                ? targeting.max > 1
                                  ? `Select up to ${targeting.max} targets (${targeting.selected?.length || 0}/${targeting.max})`
                                  : 'Click a target or cancel to skip'
                                : targeting.selected && targeting.selected.length > 0 
                                  ? 'Select more or confirm'
                                  : 'Select target(s) on board...'
                              }
                            </Typography>
                            {/* Only show Confirm button if minTargets > 0 (required targeting) */}
                            {targeting.min > 0 && (
                              <Button 
                                size="small" 
                                variant="outlined" 
                                onClick={confirmTargeting}
                                disabled={(targeting.selected?.length || 0) < targeting.min}
                              >
                                Confirm
                              </Button>
                            )}
                            {/* Show "Resolve" for multi-target optional, "Cancel" for single or skip */}
                            <Button 
                              size="small" 
                              variant={targeting.min === 0 && targeting.max > 1 && targeting.selected?.length > 0 ? "contained" : "text"}
                              onClick={() => { 
                                // If we have selections in multi-target mode, confirm them
                                if (targeting.min === 0 && targeting.selected?.length > 0) {
                                  confirmTargeting();
                                } else {
                                  cancelTargeting();
                                }
                                setSelectedAbilityIndex(null); 
                              }}
                            >
                              {targeting.min === 0 && targeting.max > 1 && targeting.selected?.length > 0 
                                ? 'Resolve' 
                                : 'Cancel'}
                            </Button>
                          </Stack>
                        </Stack>
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

            {/* Additional children (play controls, attack controls, etc.) */}
            {children}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
