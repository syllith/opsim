/**
 * actionMechanics.js
 * 
 * Core mechanics and helper functions for card ability activation and targeting.
 * Extracted from Actions.jsx to separate business logic from presentation.
 * 
 * Key Functions:
 * - listValidTargets: Find valid targets for abilities based on filters
 * - resolveActionTargetSide: Convert relative targeting to absolute sides
 * - evaluateAbilityTargetAvailability: Check if ability has valid targets
 * - abilityHasAnySelectableTargets: Determine if targeting UI should show
 * - evaluateActivatableAbilities: Calculate which abilities can be activated
 * - processAbilityActivation: Handle the full activation flow including costs
 */

/**
 * List valid targets for a given side and type based on current board state.
 * 
 * @param {object} areas - Game state areas (player/opponent)
 * @param {function} getCardMeta - Function to get card metadata
 * @param {function} getTotalPower - Function to calculate live power with mods
 * @param {string} sideSpec - 'player', 'opponent', or 'both'
 * @param {string} targetType - 'leader', 'character', or 'any'
 * @param {object} opts - Optional filters: requireActive, requireRested, powerLimit, uniqueAcrossSequence, cumulative
 * @returns {Array} Array of target contexts {side, section, keyName, index, card}
 */
export function listValidTargets(areas, getCardMeta, getTotalPower, sideSpec, targetType, opts = {}) {
  const results = [];
  const sides = sideSpec === 'both' ? ['player', 'opponent'] : [sideSpec];

  for (const side of sides) {
    const sideLoc = side === 'player' ? areas?.player : areas?.opponent;
    if (!sideLoc) continue;

    // Check for leader targets
    if (targetType === 'leader' || targetType === 'any') {
      const leader = sideLoc?.middle?.leader?.[0];
      if (leader) {
        const ctx = { side, section: 'middle', keyName: 'leader', index: 0, card: leader };

        // Apply filters
        const skipRested = opts.requireActive && ctx.card.rested;
        const skipActive = opts.requireRested && !ctx.card.rested;
        const isDuplicate = opts.uniqueAcrossSequence &&
          opts.cumulative?.some(t => t.side === side && t.section === 'middle' && t.keyName === 'leader' && t.index === 0);

        if (!skipRested && !skipActive && !isDuplicate) {
          results.push(ctx);
        }
      }
    }

    // Check for character targets
    if (targetType === 'character' || targetType === 'any') {
      const charArr = sideLoc?.char || [];
      for (let i = 0; i < charArr.length; i++) {
        const c = charArr[i];
        if (!c) continue;

        const ctx = { side, section: 'char', keyName: 'char', index: i, card: c };

        // Apply filters
        if (opts.uniqueAcrossSequence && opts.cumulative?.some(t =>
          t.side === side && t.section === 'char' && t.keyName === 'char' && t.index === i
        )) continue;

        if (opts.requireActive && c.rested) continue;
        if (opts.requireRested && !c.rested) continue;

        if (typeof opts.powerLimit === 'number') {
          const livePower = getTotalPower ?
            getTotalPower(side, 'char', 'char', i, c.id) :
            (getCardMeta(c.id)?.stats?.power || 0);
          if (livePower > opts.powerLimit) continue;
        }

        results.push(ctx);
      }
    }
  }
  return results;
}

/**
 * Convert relative targeting ('player', 'opponent', 'both') to absolute game sides.
 * Relative to the card's controller, not necessarily the active player.
 * 
 * @param {object} actionSource - The source of the ability (contains side information)
 * @param {string} relativeSide - 'player', 'opponent', or 'both'
 * @returns {string} Absolute side reference
 */
export function resolveActionTargetSide(actionSource, relativeSide) {
  const controller = actionSource?.side || 'player';
  if (relativeSide === 'both') return 'both';
  if (relativeSide === 'opponent') {
    return controller === 'player' ? 'opponent' : 'player';
  }
  return controller;
}

/**
 * Evaluate whether an ability has valid targets available.
 * Checks structured actions only.
 * 
 * @param {object} ability - The ability to evaluate
 * @param {object} areas - Game state areas
 * @param {function} getCardMeta - Function to get card metadata
 * @param {function} getTotalPower - Function to calculate live power
 * @param {object} actionSource - The source of the ability
 * @returns {object} {hasTargetRequiringActions, anyTargets, allRequiredAvailable}
 */
export function evaluateAbilityTargetAvailability(ability, areas, getCardMeta, getTotalPower, actionSource) {
  const result = {
    hasTargetRequiringActions: false,
    anyTargets: false,
    allRequiredAvailable: true
  };

  if (!ability) return result;

  const effect = ability.effect;
  const actions = effect && typeof effect === 'object' ? (effect.actions || []) : [];

  // Helper to extract targeting parameters from an action
  const getActionTargetParams = (action) => {
    const targetingTypes = {
      'powerMod': { type: 'any', side: 'opponent', min: 1 },
      'ko': { type: 'character', side: 'opponent', min: 1 },
      'rest': { type: 'any', side: 'opponent', min: 1 },
      'active': { type: 'any', side: 'player', min: 1 }
    };

    const defaults = targetingTypes[action.type];
    if (!defaults) return null;

    return {
      targetType: action.targetType || defaults.type,
      relativeSide: action.targetSide || defaults.side,
      min: action.minTargets !== undefined ? action.minTargets : defaults.min,
      powerLimit: action.powerLimit || null,
      requireActive: action.type === 'rest',
      requireRested: action.type === 'active'
    };
  };

  const checkAction = (action) => {
    const params = getActionTargetParams(action);
    if (!params) return; // Non-targeting action

    result.hasTargetRequiringActions = true;
    const actualSide = resolveActionTargetSide(actionSource, params.relativeSide);
    const candidates = listValidTargets(areas, getCardMeta, getTotalPower, actualSide, params.targetType, {
      powerLimit: params.powerLimit,
      requireActive: params.requireActive,
      requireRested: params.requireRested
    });

    if (candidates.length > 0) result.anyTargets = true;
    if (params.min > 0 && candidates.length < params.min) result.allRequiredAvailable = false;
  };

  actions.forEach(checkAction);
  
  return result;
}

/**
 * Check if an ability has any selectable targets on the board.
 * Used to determine if targeting UI should be shown.
 * 
 * @param {object} ability - The ability to check
 * @param {object} areas - Game state areas
 * @param {function} getCardMeta - Function to get card metadata
 * @param {function} getTotalPower - Function to calculate live power
 * @param {object} actionSource - The source of the ability
 * @returns {boolean} True if targets are available or action doesn't require targets
 */
export function abilityHasAnySelectableTargets(ability, areas, getCardMeta, getTotalPower, actionSource) {
  try {
    const effect = ability?.effect;
    const actions = effect && typeof effect === 'object' ? (effect.actions || []) : [];
    
    // No structured actions - card will be updated later
    if (!Array.isArray(actions) || actions.length === 0) {
      return false;
    }

    // Check each action for available targets
    for (const action of actions) {
      const actionType = action?.type;

      // Non-targeting actions always pass
      if (actionType === 'search') return true;

      // Define targeting requirements per action type
      const targetingConfigs = {
        'powerMod': { targetType: 'any', targetSide: 'opponent', powerLimit: action.powerLimit },
        'ko': { targetType: 'character', targetSide: 'opponent', powerLimit: action.powerLimit },
        'disableKeyword': { targetType: 'character', targetSide: 'opponent', powerLimit: action.powerLimit },
        'rest': { targetType: 'any', targetSide: 'opponent', requireActive: true },
        'active': { targetType: 'any', targetSide: 'player', requireRested: true }
      };

      const config = targetingConfigs[actionType];
      if (!config) return true; // Unknown actions treated as non-blocking

      const side = resolveActionTargetSide(actionSource, action.targetSide || config.targetSide);
      const candidates = listValidTargets(areas, getCardMeta, getTotalPower, side, action.targetType || config.targetType, {
        powerLimit: config.powerLimit,
        requireActive: config.requireActive,
        requireRested: config.requireRested
      });

      if (candidates.length > 0) return true;
    }

    // All targeting actions have zero candidates
    return false;
  } catch {
    return true; // Fail-open to avoid incorrectly blocking activation
  }
}

/**
 * Determine which abilities can be activated based on current game state.
 * Evaluates timing, targeting, costs, and conditions for each ability.
 * 
 * @param {Array} abilities - Card abilities to evaluate
 * @param {object} params - Evaluation parameters including game state, card context, etc.
 * @returns {Array} Array of abilities with canActivate and reason fields
 */
export function evaluateActivatableAbilities(abilities, params) {
  const {
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
    resolvingAbilityIndex = null
  } = params;

  return abilities.map((ability, index) => {
    const typeLabel = ability.type || 'Unknown';
    const type = String(typeLabel);
    const condition = ability.condition || {};
    const frequency = ability.frequency?.toLowerCase() || '';
    const costCfg = ability.cost || {};

    let canActivate = false;
    let reason = '';

    // Determine if this card instance is currently rested on the field
    let fieldRested = false;
    try {
      const sideLoc = actionSource?.side === 'opponent' ? areas?.opponent : areas?.player;
      const { section, keyName, index = 0 } = actionSource || {};

      if (section === 'char' && keyName === 'char') {
        fieldRested = !!sideLoc?.char?.[index]?.rested;
      } else if (section === 'middle') {
        if (keyName === 'leader') {
          fieldRested = !!sideLoc?.middle?.leader?.[0]?.rested;
        } else if (keyName === 'stage') {
          fieldRested = !!sideLoc?.middle?.stage?.[0]?.rested;
        }
      }
    } catch { }

    // ========================================================================
    // ABILITY TYPE ACTIVATION CHECKS
    // ========================================================================

    switch (type) {
      case 'On Play':
        // Auto-triggers when card enters field (Rule 8-1-3-1-3)
        // If autoResolve is false, allows manual activation window instead
        if (abilityUsed[index]) {
          canActivate = false;
          reason = 'Already resolved when this card was played';
        } else if (!isOnField) {
          canActivate = false;
          reason = 'Resolves only when this card is played';
        } else if (!wasJustPlayed) {
          canActivate = false;
          reason = 'Already resolved when this card was played';
        } else {
          const autoResolve = ability.autoResolve !== false; // Default: auto-resolve
          const hasTargets = abilityHasAnySelectableTargets(ability, areas, getCardMeta, getTotalPower, actionSource);
          canActivate = !autoResolve && hasTargets;
          reason = (autoResolve || !hasTargets) ? 'Resolving…' : '';
        }
        break;

      case 'Activate Main':
        // Manual activation during your Main Phase only
        canActivate = phase?.toLowerCase() === 'main' && isYourTurn && !battle && isOnField;

        if (!isOnField) {
          reason = 'Card must be on the field to activate';
        } else if (!canActivate) {
          reason = 'Only during your Main Phase';
        } else if (costCfg?.restThis && fieldRested) {
          canActivate = false;
          reason = 'Card is rested';
        }
        break;

      case 'On Attack':
        // Activates during Attack Step or early Block Step (before blocker declared)
        canActivate = battle &&
          battle.attacker?.id === cardId &&
          (battle.step === 'attack' || (battle.step === 'block' && !battle.blockerUsed));
        reason = canActivate ? '' : 'Only when this card attacks';
        break;

      case 'On Block':
        // Activates when this card is declared as blocker
        canActivate = battle && battle.step === 'block' && battle.blockerUsed;
        reason = canActivate ? '' : 'Only when this card blocks';
        break;

      case 'Blocker':
        // Handled by battle system, not manually activated
        canActivate = false;
        reason = 'Keyword ability (automatic)';
        break;

      case 'Counter':
        // Activates during Counter Step of battle
        canActivate = battle && battle.step === 'counter';
        reason = canActivate ? '' : 'Only during Counter Step';
        break;

      case 'On KO':
        // Auto-triggers when card is knocked out (handled by game engine)
        canActivate = false;
        reason = 'Triggers automatically when KO\'d';
        break;

      case 'End of Turn':
        // Auto-triggers at end of turn (handled by game engine)
        canActivate = false;
        reason = 'Triggers at end of turn';
        break;

      case 'Opponents Turn':
        // Activates when you are being attacked during opponent's turn
        if (battle && actionSource?.side && battle.target?.side === actionSource.side) {
          const step = battle.step;
          canActivate = step === 'attack' || step === 'block' || step === 'counter';
        } else {
          canActivate = false;
        }
        reason = canActivate ? '' : 'Only when you are being attacked';
        break;

      case 'Continuous':
        // Passive effects that are always active
        canActivate = false;
        reason = 'Passive effect (always active)';
        break;

      default:
        // Unknown ability types default to Main Phase activation
        canActivate = phase?.toLowerCase() === 'main' && isYourTurn;
        reason = canActivate ? '' : 'Cannot activate now';
    }

    // ========================================================================
    // ADDITIONAL ACTIVATION REQUIREMENTS
    // ========================================================================

    // Check if valid targets exist for targeting abilities
    try {
      const availability = evaluateAbilityTargetAvailability(ability, areas, getCardMeta, getTotalPower, actionSource);
      const isOnPlay = type === 'On Play';

      if (!isOnPlay) {
        // For non-On Play abilities, block activation if required targets are missing
        if (availability.hasTargetRequiringActions) {
          if (!availability.anyTargets || !availability.allRequiredAvailable) {
            canActivate = false;
            reason = 'No valid targets';
          }
        }
      } else {
        // For optional On Play abilities (autoResolve === false), show 'No valid targets'
        const isOptionalOnPlay = ability.autoResolve === false;
        if (isOptionalOnPlay && availability.hasTargetRequiringActions && !availability.anyTargets) {
          canActivate = false;
          reason = 'No valid targets';
        }
      }
    } catch {
      // Fail-safe: don't block activation on evaluation errors
    }

    // Validate cost requirements
    if (canActivate && costCfg?.payLife) {
      const lifeToPayAmount = Number(costCfg.payLife);
      if (lifeToPayAmount > 0) {
        try {
          const controllerSide = actionSource?.side === 'opponent' ? 'opponent' : 'player';
          const sideLoc = controllerSide === 'opponent' ? areas?.opponent : areas?.player;
          const lifeCount = (sideLoc?.life || []).length;

          if (lifeCount < lifeToPayAmount) {
            canActivate = false;
            reason = 'Not enough Life to pay';
          }
        } catch { }
      }
    }

    // Check DON!! requirement from ability conditions
    if (condition.don && condition.don > 0 && isOnField) {
      let donCount = 0;
      try {
        const sideLoc = actionSource?.side === 'opponent' ? areas?.opponent : areas?.player;

        if (actionSource?.section === 'middle' && actionSource?.keyName === 'leader') {
          donCount = (sideLoc?.middle?.leaderDon || []).length;
        } else if (actionSource?.section === 'char' && actionSource?.keyName === 'char') {
          donCount = (sideLoc?.charDon?.[actionSource.index] || []).length;
        }
      } catch { }

      if (donCount < condition.don) {
        canActivate = false;
        reason = `Needs ${condition.don} DON!! attached`;
      }
    }

    // Check Leader type requirement (condition.leaderHasType)
    if (condition.leaderHasType && isOnField) {
      try {
        const controllerSide = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        const sideLoc = controllerSide === 'opponent' ? areas?.opponent : areas?.player;
        const leaderInst = sideLoc?.middle?.leader?.[0];
        const leaderMeta = leaderInst ? getCardMeta(leaderInst.id) : null;
        const requiredType = String(condition.leaderHasType);
        const hasType = leaderMeta?.types?.includes(requiredType);

        if (!hasType) {
          canActivate = false;
          reason = `Leader must have type ${requiredType}`;
        }
      } catch {
        canActivate = false;
        reason = `Leader must have type ${condition.leaderHasType}`;
      }
    }

    // Check once-per-turn frequency restriction
    if (frequency === 'once per turn' && abilityUsed[index]) {
      canActivate = false;
      reason = 'Already used this turn';
    }

    // If this ability is currently resolving, override the reason for clarity
    if (typeof resolvingAbilityIndex === 'number' && resolvingAbilityIndex === index) {
      canActivate = false;
      reason = 'Resolving…';
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
}

/**
 * Create a validator function for targeting based on action type and configuration.
 * This avoids recreating validator functions on every render.
 * 
 * @param {string} targetType - Type of target ('leader', 'character', 'any', etc.)
 * @param {object} action - Action configuration object
 * @param {Array} cumulativeTargets - Array of previously selected targets in sequence
 * @param {function} getTotalPower - Function to calculate live power with mods
 * @param {function} getCardMeta - Function to get card metadata (needed for powerLimit with base power)
 * @returns {function} Validator function for targeting system
 */
export function createTargetValidator(targetType, action = {}, cumulativeTargets = [], getTotalPower = null, getCardMeta = null) {
  return (card, ctx) => {
    // Validate target type
    if (targetType === 'leader') {
      if (!(ctx?.section === 'middle' && ctx?.keyName === 'leader')) return false;
    } else if (targetType === 'character') {
      if (ctx?.section !== 'char' || ctx?.keyName !== 'char') return false;
      
      // Check for duplicate targets in sequence
      if (action.uniqueAcrossSequence && cumulativeTargets.some(t => 
        t.side === ctx.side && t.section === ctx.section && 
        t.keyName === ctx.keyName && t.index === ctx.index
      )) return false;
    } else if (targetType === 'any') {
      const ok = (ctx?.section === 'middle' && ctx?.keyName === 'leader') ||
                 (ctx?.section === 'char' && ctx?.keyName === 'char');
      if (!ok) return false;
      
      // Check for duplicate targets in sequence
      if (action.uniqueAcrossSequence && cumulativeTargets.some(t => 
        t.side === ctx.side && t.section === ctx.section && 
        t.keyName === ctx.keyName && t.index === ctx.index
      )) return false;
    } else {
      return false;
    }
    
    // Apply power limit if specified
    if (action.powerLimit !== null && action.powerLimit !== undefined) {
      if (getTotalPower) {
        // Use live power calculation
        const totalPower = getTotalPower(ctx.side, ctx.section, ctx.keyName, ctx.index, card.id);
        if (totalPower > action.powerLimit) return false;
      } else if (getCardMeta) {
        // Fallback to base power from metadata
        const meta = getCardMeta(card.id);
        const basePower = meta?.stats?.power || 0;
        if (basePower > action.powerLimit) return false;
      }
    }
    
    return true;
  };
}

/**
 * Create a validator for rested/active state targeting.
 * 
 * @param {string} targetType - Type of target ('leader', 'character', 'any')
 * @param {boolean} requireRested - Whether target must be rested
 * @param {object} action - Action configuration object
 * @param {Array} cumulativeTargets - Previously selected targets
 * @returns {function} Validator function
 */
export function createStateValidator(targetType, requireRested, action = {}, cumulativeTargets = []) {
  return (card, ctx) => {
    const baseValidator = createTargetValidator(targetType, action, cumulativeTargets);
    if (!baseValidator(card, ctx)) return false;
    
    // Check rested state
    if (requireRested) {
      return card && !!card.rested;
    } else {
      return card && !card.rested;
    }
  };
}

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
 * 
 * @param {object} params - Parameters including ability, cost callbacks, action source, etc.
 */
export function completeAbilityActivation(params) {
  const {
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
  } = params;

  const isOnPlay = (ability.typeKey || '') === 'On Play';
  const freqLabel = ability.frequency ? String(ability.frequency).toLowerCase() : '';
  const isOncePerTurn = freqLabel === 'once per turn';

  // Mark as used for Once Per Turn abilities and On Play abilities
  if (isOncePerTurn || isOnPlay) {
    setAbilityUsed(prev => ({ ...prev, [abilityIndex]: true }));
    if (isOncePerTurn && typeof markAbilityUsed === 'function' && actionSource) {
      try {
        markAbilityUsed(actionSource, abilityIndex);
      } catch {}
    }
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

    // Handle trashThis cost (move card to trash)
    if (cost.trashThis && actionSource && removeCardByEffect) {
      console.log('[Ability] Paying cost: Trash this card');
      removeCardByEffect(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index || cardIndex,
        actionSource.side
      );
    }

    // Handle restThis cost (rest/tap this card)
    if (cost.restThis && actionSource) {
      console.log('[Ability] Paying cost: Rest this card');
      if (typeof restCard === 'function') {
        restCard(actionSource.side, actionSource.section, actionSource.keyName, actionSource.index || cardIndex);
      }
    }

    // Note: Resting DON!! is automatically handled during play/activation (2-7-2 to 2-7-4)
    // DON!! costs use the ① symbol notation per rules 8-3-1-5

    // Trashing from hand is handled by card effects, not activation costs per rules

    // Note: Life damage is handled through battle system (7-1-4) and damage processing (4-6)

    // Handle payLife cost (move top Life to hand without Trigger)
    if (cost.payLife && typeof cost.payLife === 'number') {
      try {
        const side = actionSource?.side || 'player';
        console.log(`[Ability] Paying cost: Pay ${cost.payLife} life for ${side}`);
        if (typeof payLife === 'function') payLife(side, cost.payLife);
      } catch { }
    }
  }
}
