import _ from 'lodash';

//. Returns valid targets for a given side and type based on current board state
export function listValidTargets(
  areas,
  getCardMeta,
  getTotalPower,
  sideSpec,
  targetType,
  opts = {}
) {
  const results = [];
  const sides = sideSpec === 'both' ? ['player', 'opponent'] : [sideSpec];

  const uniqueAcrossSequence = !!opts.uniqueAcrossSequence;
  const cumulative = Array.isArray(opts.cumulative) ? opts.cumulative : [];
  const requireActive = !!opts.requireActive;
  const requireRested = !!opts.requireRested;
  const powerLimit = _.isNumber(opts.powerLimit) ? opts.powerLimit : null;
  const pendingPowerDeltas = Array.isArray(opts.pendingPowerDeltas) ? opts.pendingPowerDeltas : [];

  //. Returns accumulated pending power delta for given context
  const getPendingDelta = (ctx) => {
    if (!pendingPowerDeltas.length || !ctx) return 0;

    return _.reduce(
      pendingPowerDeltas,
      (sum, entry) => {
        if (
          entry &&
          entry.side === ctx.side &&
          entry.section === ctx.section &&
          entry.keyName === ctx.keyName &&
          entry.index === ctx.index
        ) {
          return sum + (entry.delta || 0);
        }
        return sum;
      },
      0
    );
  };

  sides.forEach((side) => {
    const sideLoc = side === 'player' ? _.get(areas, 'player') : _.get(areas, 'opponent');
    if (!sideLoc) return;

    //. Check for leader targets
    if (targetType === 'leader' || targetType === 'any') {
      const leader = _.get(sideLoc, 'middle.leader[0]');
      if (leader) {
        const ctx = { side, section: 'middle', keyName: 'leader', index: 0, card: leader };

        const skipRested = requireActive && ctx.card.rested;
        const skipActive = requireRested && !ctx.card.rested;
        const isDuplicate = uniqueAcrossSequence && _.some(
          cumulative,
          (t) =>
            t.side === side &&
            t.section === 'middle' &&
            t.keyName === 'leader' &&
            t.index === 0
        );

        if (!skipRested && !skipActive && !isDuplicate) {
          if (powerLimit !== null) {
            let livePower = 0;
            if (typeof getTotalPower === 'function') {
              livePower = getTotalPower(side, 'middle', 'leader', 0, leader.id);
            } else if (typeof getCardMeta === 'function') {
              livePower = _.get(getCardMeta(leader.id), 'stats.power', 0);
            }
            const effectivePower = livePower + getPendingDelta(ctx);
            if (effectivePower > powerLimit) {
              return;
            }
          }
          results.push(ctx);
        }
      }
    }

    //. Check for character targets
    if (targetType === 'character' || targetType === 'any') {
      const charArr = _.get(sideLoc, 'char', []);
      _.forEach(charArr, (c, idx) => {
        if (!c) return;

        const ctx = { side, section: 'char', keyName: 'char', index: idx, card: c };

        if (
          uniqueAcrossSequence &&
          _.some(
            cumulative,
            (t) =>
              t.side === side &&
              t.section === 'char' &&
              t.keyName === 'char' &&
              t.index === idx
          )
        ) {
          return;
        }

        if (requireActive && c.rested) return;
        if (requireRested && !c.rested) return;

        if (powerLimit !== null) {
          const livePower = getTotalPower
            ? getTotalPower(side, 'char', 'char', idx, c.id)
            : _.get(getCardMeta?.(c.id), 'stats.power', 0);

          const effectivePower = livePower + getPendingDelta(ctx);
          if (effectivePower > powerLimit) return;
        }

        results.push(ctx);
      });
    }
  });

  return results;
}

//. Converts relative targeting ('player', 'opponent', 'both') to absolute game sides
export function resolveActionTargetSide(actionSource, relativeSide) {
  const controller = _.get(actionSource, 'side', 'player');
  if (relativeSide === 'both') return 'both';
  if (relativeSide === 'opponent') {
    return controller === 'player' ? 'opponent' : 'player';
  }
  return controller;
}

//. Evaluates whether an ability has valid targets (structured actions only)
export function evaluateAbilityTargetAvailability(
  ability,
  areas,
  getCardMeta,
  getTotalPower,
  actionSource
) {
  const result = {
    hasTargetRequiringActions: false,
    anyTargets: false,
    allRequiredAvailable: true
  };

  if (!ability) return result;

  const effect = _.get(ability, 'effect');
  const actions = _.isPlainObject(effect) ? _.get(effect, 'actions', []) : [];

  //. Extract targeting parameters from a structured action
  const getActionTargetParams = (action) => {
    const targetingTypes = {
      powerMod: { type: 'any', side: 'opponent', min: 1 },
      ko: { type: 'character', side: 'opponent', min: 1 },
      rest: { type: 'any', side: 'opponent', min: 1 },
      active: { type: 'any', side: 'player', min: 1 }
    };

    const defaults = targetingTypes[action.type];
    if (!defaults) return null;

    return {
      targetType: action.targetType || defaults.type,
      relativeSide: action.targetSide || defaults.side,
      min: action.minTargets !== undefined ? action.minTargets : defaults.min,
      powerLimit: _.isNumber(action.powerLimit) ? action.powerLimit : null,
      requireActive: action.type === 'rest',
      requireRested: action.type === 'active'
    };
  };

  //. Evaluate a single action for target availability
  const checkAction = (action) => {
    const params = getActionTargetParams(action);
    if (!params) return; // Non-targeting action

    result.hasTargetRequiringActions = true;

    const actualSide = resolveActionTargetSide(actionSource, params.relativeSide);
    const candidates = listValidTargets(
      areas,
      getCardMeta,
      getTotalPower,
      actualSide,
      params.targetType,
      {
        powerLimit: params.powerLimit,
        requireActive: params.requireActive,
        requireRested: params.requireRested
      }
    );

    if (candidates.length > 0) result.anyTargets = true;
    if (params.min > 0 && candidates.length < params.min) {
      result.allRequiredAvailable = false;
    }
  };

  actions.forEach(checkAction);

  return result;
}

//. Returns true if an ability has any selectable targets on the board
export function abilityHasAnySelectableTargets(
  ability,
  areas,
  getCardMeta,
  getTotalPower,
  actionSource
) {
  try {
    const effect = _.get(ability, 'effect');
    const actions = _.isPlainObject(effect) ? _.get(effect, 'actions', []) : [];

    //. No structured actions yet -> treat as no selectable targets
    if (!_.isArray(actions) || _.isEmpty(actions)) {
      return false;
    }

    //. Check each action for available targets
    for (const action of actions) {
      const actionType = _.get(action, 'type');

      // Non-targeting actions always pass
      if (actionType === 'search') return true;

      const targetingConfigs = {
        powerMod: {
          targetType: 'any',
          targetSide: 'opponent',
          powerLimit: action.powerLimit
        },
        ko: {
          targetType: 'character',
          targetSide: 'opponent',
          powerLimit: action.powerLimit
        },
        disableKeyword: {
          targetType: 'character',
          targetSide: 'opponent',
          powerLimit: action.powerLimit
        },
        rest: {
          targetType: 'any',
          targetSide: 'opponent',
          requireActive: true
        },
        active: {
          targetType: 'any',
          targetSide: 'player',
          requireRested: true
        }
      };

      const config = targetingConfigs[actionType];
      if (!config) return true; // Unknown actions treated as non-blocking

      const side = resolveActionTargetSide(
        actionSource,
        _.get(action, 'targetSide', config.targetSide)
      );

      const candidates = listValidTargets(
        areas,
        getCardMeta,
        getTotalPower,
        side,
        _.get(action, 'targetType', config.targetType),
        {
          powerLimit: config.powerLimit,
          requireActive: config.requireActive,
          requireRested: config.requireRested
        }
      );

      if (candidates.length > 0) return true;
    }

    return false;
  } catch {
    //. Fail-open to avoid incorrectly blocking activation
    return true;
  }
}

//. Computes which abilities can currently be activated based on game state
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
    const typeLabel = _.get(ability, 'type', 'Unknown');
    const type = String(typeLabel);
    const condition = _.get(ability, 'condition', {});
    const frequency = _.toLower(_.get(ability, 'frequency', ''));
    const costCfg = _.get(ability, 'cost', {});

    let canActivate = false;
    let reason = '';

    //. Determine if this card instance is currently rested on the field
    let fieldRested = false;
    try {
      const sideKey = _.get(actionSource, 'side') === 'opponent' ? 'opponent' : 'player';
      const sideLoc = _.get(areas, sideKey);
      const section = _.get(actionSource, 'section');
      const keyName = _.get(actionSource, 'keyName');
      const idx = _.get(actionSource, 'index', 0);

      if (section === 'char' && keyName === 'char') {
        fieldRested = !!_.get(sideLoc, ['char', idx, 'rested']);
      } else if (section === 'middle') {
        if (keyName === 'leader') {
          fieldRested = !!_.get(sideLoc, 'middle.leader[0].rested');
        } else if (keyName === 'stage') {
          fieldRested = !!_.get(sideLoc, 'middle.stage[0].rested');
        }
      }
    } catch { /* noop */ }

    // ========================================================================
    // ABILITY TYPE ACTIVATION CHECKS
    // ========================================================================

    switch (type) {
      case 'On Play': {
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
          const autoResolve = ability.autoResolve !== false;
          const hasTargets = abilityHasAnySelectableTargets(
            ability,
            areas,
            getCardMeta,
            getTotalPower,
            actionSource
          );
          canActivate = !autoResolve && hasTargets;
          reason = (autoResolve || !hasTargets) ? 'Resolving…' : '';
        }
        break;
      }

      case 'Activate Main': {
        const isMain = _.toLower(phase || '') === 'main';
        canActivate = isMain && isYourTurn && !battle && isOnField;

        if (!isOnField) {
          reason = 'Card must be on the field to activate';
        } else if (!canActivate) {
          reason = 'Only during your Main Phase';
        } else if (costCfg?.restThis && fieldRested) {
          canActivate = false;
          reason = 'Card is rested';
        }
        break;
      }

      case 'On Attack': {
        const step = _.get(battle, 'step');
        const attackerId = _.get(battle, 'attacker.id');
        const blockerUsed = _.get(battle, 'blockerUsed');

        canActivate =
          !!battle &&
          attackerId === cardId &&
          (step === 'declaring' ||
            step === 'attack' ||
            (step === 'block' && !blockerUsed));

        reason = canActivate ? '' : 'Only when this card attacks';
        break;
      }

      case 'On Block': {
        const step = _.get(battle, 'step');
        const blockerUsed = _.get(battle, 'blockerUsed');
        canActivate = !!battle && step === 'block' && blockerUsed;
        reason = canActivate ? '' : 'Only when this card blocks';
        break;
      }

      case 'Blocker':
        canActivate = false;
        reason = 'Keyword ability (automatic)';
        break;

      case 'Counter': {
        const step = _.get(battle, 'step');
        canActivate = !!battle && step === 'counter';
        reason = canActivate ? '' : 'Only during Counter Step';
        break;
      }

      case 'On KO':
        canActivate = false;
        reason = 'Triggers automatically when KO\'d';
        break;

      case 'End of Turn':
        canActivate = false;
        reason = 'Triggers at end of turn';
        break;

      case 'Opponents Turn': {
        if (battle && actionSource?.side) {
          const controllerSide = actionSource.side;
          const opponentSide = controllerSide === 'player' ? 'opponent' : 'player';
          const attackerSide = _.get(battle, 'attacker.side');
          const targetSide = _.get(battle, 'target.side');
          const opponentIsAttacking = attackerSide === opponentSide;
          const youAreTargeted = battle.target ? targetSide === controllerSide : true;
          if (opponentIsAttacking && youAreTargeted) {
            const step = _.get(battle, 'step');
            canActivate = step === 'attack' || step === 'block' || step === 'counter';
          } else {
            canActivate = false;
          }
        } else {
          canActivate = false;
        }
        reason = canActivate ? '' : 'Only when your opponent attacks';
        break;
      }

      case 'Continuous':
        canActivate = false;
        reason = 'Passive effect (always active)';
        break;

      default: {
        const isMain = _.toLower(phase || '') === 'main';
        canActivate = isMain && isYourTurn;
        reason = canActivate ? '' : 'Cannot activate now';
      }
    }

    // ========================================================================
    // ADDITIONAL ACTIVATION REQUIREMENTS
    // ========================================================================

    //. Target availability checks (structured actions)
    try {
      const availability = evaluateAbilityTargetAvailability(
        ability,
        areas,
        getCardMeta,
        getTotalPower,
        actionSource
      );
      const isOnPlay = type === 'On Play';
      const isOptionalOnPlay = ability.autoResolve === false;

      if (!isOnPlay) {
        if (availability.hasTargetRequiringActions) {
          if (!availability.anyTargets || !availability.allRequiredAvailable) {
            canActivate = false;
            reason = 'No valid targets';
          }
        }
      } else if (isOptionalOnPlay) {
        if (availability.hasTargetRequiringActions && !availability.anyTargets) {
          canActivate = false;
          reason = 'No valid targets';
        }
      }
    } catch {
      //. Fail-safe: don't further restrict on evaluation errors
    }

    //. Validate Life cost
    if (canActivate && _.get(costCfg, 'payLife')) {
      const lifeToPayAmount = _.toNumber(_.get(costCfg, 'payLife'));
      if (lifeToPayAmount > 0) {
        try {
          const controllerSide = actionSource?.side === 'opponent' ? 'opponent' : 'player';
          const sideLoc = _.get(areas, controllerSide);
          const lifeCount = _.size(_.get(sideLoc, 'life', []));
          if (lifeCount < lifeToPayAmount) {
            canActivate = false;
            reason = 'Not enough Life to pay';
          }
        } catch { /* noop */ }
      }
    }

    //. Check DON!! requirement from conditions
    if (_.get(condition, 'don') > 0 && isOnField) {
      let donCount = 0;
      try {
        const controllerSide = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        const sideLoc = _.get(areas, controllerSide);

        if (_.get(actionSource, 'section') === 'middle' && _.get(actionSource, 'keyName') === 'leader') {
          donCount = _.size(_.get(sideLoc, 'middle.leaderDon', []));
        } else if (
          _.get(actionSource, 'section') === 'char' &&
          _.get(actionSource, 'keyName') === 'char'
        ) {
          const idx = _.get(actionSource, 'index', 0);
          donCount = _.size(_.get(sideLoc, ['charDon', idx], []));
        }
      } catch { /* noop */ }

      if (donCount < condition.don) {
        canActivate = false;
        reason = `Needs ${condition.don} DON!! attached`;
      }
    }

    //. Check Leader type requirement
    if (_.get(condition, 'leaderHasType') && isOnField) {
      try {
        const controllerSide = actionSource?.side === 'opponent' ? 'opponent' : 'player';
        const sideLoc = _.get(areas, controllerSide);
        const leaderInst = _.get(sideLoc, 'middle.leader[0]');
        const leaderMeta = leaderInst ? getCardMeta(leaderInst.id) : null;
        const requiredType = String(_.get(condition, 'leaderHasType'));
        const hasType = _.includes(_.get(leaderMeta, 'types', []), requiredType);

        if (!hasType) {
          canActivate = false;
          reason = `Leader must have type ${requiredType}`;
        }
      } catch {
        canActivate = false;
        reason = `Leader must have type ${condition.leaderHasType}`;
      }
    }

    //. Once per turn restriction
    if (_.toLower(frequency) === 'once per turn' && abilityUsed[index]) {
      canActivate = false;
      reason = 'Already used this turn';
    }

    //. If this ability is currently resolving, override reason
    if (_.isNumber(resolvingAbilityIndex) && resolvingAbilityIndex === index) {
      canActivate = false;
      reason = 'Resolving…';
    }

    return {
      ...ability,
      index,
      canActivate,
      reason,
      type: typeLabel,
      typeKey: type,
      condition
    };
  });
}

//. Creates a validator for targeting based on action config and target type
export function createTargetValidator(
  targetType,
  action = {},
  cumulativeTargets = [],
  getTotalPower = null,
  getCardMeta = null,
  pendingPowerDeltas = []
) {
  return (card, ctx) => {
    //. Validate target type
    if (targetType === 'leader') {
      if (!(ctx?.section === 'middle' && ctx?.keyName === 'leader')) return false;
    } else if (targetType === 'character') {
      if (ctx?.section !== 'char' || ctx?.keyName !== 'char') return false;

      if (
        action.uniqueAcrossSequence &&
        _.some(
          cumulativeTargets,
          (t) =>
            t.side === ctx.side &&
            t.section === ctx.section &&
            t.keyName === ctx.keyName &&
            t.index === ctx.index
        )
      ) {
        return false;
      }
    } else if (targetType === 'any') {
      const ok =
        (ctx?.section === 'middle' && ctx?.keyName === 'leader') ||
        (ctx?.section === 'char' && ctx?.keyName === 'char');
      if (!ok) return false;

      if (
        action.uniqueAcrossSequence &&
        _.some(
          cumulativeTargets,
          (t) =>
            t.side === ctx.side &&
            t.section === ctx.section &&
            t.keyName === ctx.keyName &&
            t.index === ctx.index
        )
      ) {
        return false;
      }
    } else {
      return false;
    }

    //. Apply power limit, if specified
    if (action.powerLimit !== null && action.powerLimit !== undefined) {
      const pendingDelta = Array.isArray(pendingPowerDeltas)
        ? _.reduce(
          pendingPowerDeltas,
          (sum, entry) => {
            if (
              entry &&
              entry.side === ctx.side &&
              entry.section === ctx.section &&
              entry.keyName === ctx.keyName &&
              entry.index === ctx.index
            ) {
              return sum + (entry.delta || 0);
            }
            return sum;
          },
          0
        )
        : 0;

      if (getTotalPower) {
        const totalPower = getTotalPower(
          ctx.side,
          ctx.section,
          ctx.keyName,
          ctx.index,
          card.id
        );
        if (totalPower + pendingDelta > action.powerLimit) return false;
      } else if (getCardMeta) {
        const basePower = _.get(getCardMeta(card.id), 'stats.power', 0);
        if (basePower + pendingDelta > action.powerLimit) return false;
      }
    }

    return true;
  };
}

//. Creates a validator for rested/active state targeting
export function createStateValidator(
  targetType,
  requireRested,
  action = {},
  cumulativeTargets = [],
  getTotalPower = null,
  getCardMeta = null,
  pendingPowerDeltas = []
) {
  const baseValidator = createTargetValidator(
    targetType,
    action,
    cumulativeTargets,
    getTotalPower,
    getCardMeta,
    pendingPowerDeltas
  );

  return (card, ctx) => {
    if (!baseValidator(card, ctx)) return false;

    if (requireRested) {
      return !!(card && card.rested);
    }

    return !!(card && !card.rested);
  };
}

//. Completes ability activation: mark used flags and pay costs post-resolution
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

  const typeKey = _.get(ability, 'typeKey', '');
  const isOnPlay = typeKey === 'On Play';
  const freqLabel = _.toLower(_.get(ability, 'frequency', ''));
  const isOncePerTurn = freqLabel === 'once per turn';

  //. Mark as used for Once Per Turn abilities and On Play
  if (isOncePerTurn || isOnPlay) {
    setAbilityUsed((prev) => ({ ...prev, [abilityIndex]: true }));
    if (isOncePerTurn && typeof markAbilityUsed === 'function' && actionSource) {
      try {
        markAbilityUsed(actionSource, abilityIndex);
      } catch { /* noop */ }
    }
  }

  //. Pay costs after effect resolution
  if (cost) {
    //. returnThisToDeck: move card to deck (top/bottom/shuffle)
    if (cost.returnThisToDeck && returnCardToDeck && actionSource) {
      returnCardToDeck(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex,
        cost.returnThisToDeck
      );
    }

    //. trashThis: move card to trash
    if (cost.trashThis && actionSource && removeCardByEffect) {
      removeCardByEffect(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex,
        actionSource.side
      );
    }

    //. restThis: rest/tap this card
    if (cost.restThis && actionSource && typeof restCard === 'function') {
      restCard(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex
      );
    }

    //. payLife: move Life cards to hand without Trigger
    if (_.isNumber(cost.payLife) && cost.payLife > 0) {
      try {
        const side = _.get(actionSource, 'side', 'player');
        if (typeof payLife === 'function') {
          payLife(side, cost.payLife);
        }
      } catch { /* noop */ }
    }
  }
}
