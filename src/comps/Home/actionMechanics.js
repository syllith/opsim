import _ from 'lodash';

// Map schema timing to UI labels without a translation file
export function getAbilityTypeLabel(ability) {
  const t = _.get(ability, 'timing');
  if (!t) return String(_.get(ability, 'type', 'Unknown'));
  switch (t) {
    case 'onPlay': return 'On Play';
    case 'activateMain':
    case 'main': return 'Activate Main';
    case 'whenAttacking': return 'On Attack';
    case 'whenAttackingOrOnOpponentsAttack': return 'On Attack or Opponents Attack';
    case 'onOpponentsAttack': return 'On Opponents Attack';
    case 'counter': return 'Counter';
    case 'static': return 'Continuous';
    default: return String(t);
  }
}

function getAbilityActions(ability) {
  return Array.isArray(ability?.actions) ? ability.actions : [];
}

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
              const meta = getCardMeta(leader.id);
              livePower = _.get(meta, 'power', _.get(meta, 'stats.power', 0));
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
          const meta = getCardMeta?.(c.id);
          const livePower = getTotalPower
            ? getTotalPower(side, 'char', 'char', idx, c.id)
            : _.get(meta, 'power', _.get(meta, 'stats.power', 0));

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

  const actions = getAbilityActions(ability);

  //. Extract targeting parameters from a structured action (new schema only)
  const getActionTargetParams = (action) => {
    // Schema action: modifyStat (power only)
    if (action?.type === 'modifyStat') {
      if (action.stat && action.stat !== 'power') return null;
      let sel = typeof action.target === 'object' ? action.target : {};
      if (typeof action.target === 'string' && _.get(ability, ['selectors', action.target])) {
        sel = _.get(ability, ['selectors', action.target]);
      }
      const targetType = sel.type === 'leaderOrCharacter' ? 'any' : (sel.type || 'any');
      const side = sel.side === 'self' ? 'player' : 'opponent';
      const min = _.isNumber(sel.min) ? sel.min : 1;
      const requireActive = false;
      const requireRested = false;
      return { targetType, relativeSide: side, min, requireActive, requireRested };
    }
    return null;
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
    const actions = getAbilityActions(ability);

    //. No structured actions yet -> treat as no selectable targets
    if (!_.isArray(actions) || _.isEmpty(actions)) {
      return false;
    }

    //. Check each action for available targets
    for (const action of actions) {
      const actionType = _.get(action, 'type');

      // Non-targeting actions always pass
      if (actionType === 'search') return true;

      if (actionType === 'modifyStat') {
        const sel = _.get(action, 'target');
        let selector = typeof sel === 'object' ? sel : null;
        if (typeof sel === 'string' && _.get(ability, ['selectors', sel])) {
          selector = _.get(ability, ['selectors', sel]);
        }
        const targetType = selector?.type === 'leaderOrCharacter' ? 'any' : selector?.type || 'any';
        const sideRel = selector?.side === 'self' ? 'player' : 'opponent';

        const pFilter = Array.isArray(selector?.filters)
          ? selector.filters.find(f => f.field === 'power' && (f.op === '<=' || f.op === '<'))
          : null;
        const powerLimit = _.isNumber(pFilter?.value) ? pFilter.value : undefined;

        const side = resolveActionTargetSide(actionSource, sideRel);
        const candidates = listValidTargets(
          areas,
          getCardMeta,
          getTotalPower,
          side,
          targetType,
          { powerLimit }
        );

        if (candidates.length > 0) return true;
      }
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
    //. Detect unsupported action types to report clearly in the UI
    const supportedTypes = new Set([
      'conditional',
      'modifyStat',
      'grantKeyword',
      'disableKeyword',
      'keywordEffect',
      'restrict',
      'giveDon',
      'draw',
      'setState',
      'trashFromHand',
      'ko',
      'rest',
      'active',
      'search',
      'replacementEffect',
      'noop',
      'preventKO'
    ]);

    const collectUnsupported = (actions = []) => {
      const out = [];
      try {
        actions.forEach((a) => {
          const t = _.get(a, 'type');
          if (t === 'conditional' || t === 'replacementEffect') {
            //. Recurse into nested actions for conditional and replacementEffect
            out.push(...collectUnsupported(_.get(a, 'actions', [])));
          }
          if (!supportedTypes.has(String(t))) {
            out.push(String(t || 'unknown'));
          }
        });
      } catch { /* noop */ }
      return _.uniq(out);
    };

    const rawActions = Array.isArray(ability.actions) ? ability.actions : [];
    const unsupportedActions = collectUnsupported(rawActions);
    const typeLabel = getAbilityTypeLabel(ability);
    const type = String(typeLabel);
    const condition = _.get(ability, 'condition', {});
    const rawFreq = _.get(ability, 'frequency', '');
    let frequency = '';
    if (rawFreq) {
      if (rawFreq === 'oncePerTurn' || rawFreq === 'once per turn') {
        frequency = 'Once Per Turn';
      } else {
        const lower = String(rawFreq).toLowerCase().replace(/_/g, ' ');
        frequency = lower.replace(/\b\w/g, (m) => m.toUpperCase());
      }
    }
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

        //. New schema uses cost.type
        const requiresRest = costCfg?.type === 'restThis';

        if (!isOnField) {
          reason = 'Card must be on the field to activate';
        } else if (!canActivate) {
          reason = 'Only during your Main Phase';
        } else if (requiresRest && fieldRested) {
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

      case 'On Opponents Attack': {
        //. Can activate when opponent declares an attack
        if (battle && actionSource?.side) {
          const controllerSide = actionSource.side;
          const opponentSide = controllerSide === 'player' ? 'opponent' : 'player';
          const attackerSide = _.get(battle, 'attacker.side');
          const opponentIsAttacking = attackerSide === opponentSide;
          
          if (opponentIsAttacking && isOnField) {
            const step = _.get(battle, 'step');
            //. Can activate during declaring, block, or counter steps
            canActivate = step === 'declaring' || step === 'block' || step === 'counter';
          } else {
            canActivate = false;
          }
        } else {
          canActivate = false;
        }
        reason = canActivate ? '' : 'Only when opponent attacks';
        break;
      }

      case 'On Attack or Opponents Attack': {
        const step = _.get(battle, 'step');
        const attackerId = _.get(battle, 'attacker.id');
        const blockerUsed = _.get(battle, 'blockerUsed');

        let attackSideOk = false;
        if (!!battle && attackerId === cardId) {
          attackSideOk = step === 'declaring' || step === 'attack' || (step === 'block' && !blockerUsed);
        }

        let opponentAttackOk = false;
        if (battle && actionSource?.side && isOnField) {
          const controllerSide = actionSource.side;
          const opponentSide = controllerSide === 'player' ? 'opponent' : 'player';
          const attackerSide = _.get(battle, 'attacker.side');
          const opponentIsAttacking = attackerSide === opponentSide;
          if (opponentIsAttacking) {
            opponentAttackOk = step === 'declaring' || step === 'block' || step === 'counter';
          }
        }

        canActivate = attackSideOk || opponentAttackOk;
        reason = canActivate ? '' : 'Only when attacking or opponent attacks';
        break;
      }

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

    //. If there are unsupported actions, report and block activation
    if (unsupportedActions.length > 0) {
      canActivate = false;
      reason = `Unimplemented action: ${unsupportedActions.join(', ')}`;
    }

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
      condition,
      frequency
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

    //. Apply power limit, if specified (new schema uses filters; engine passes powerLimit)
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
        const meta = getCardMeta(card.id);
        const basePower = _.get(meta, 'power', _.get(meta, 'stats.power', 0));
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

  //. Completes ability activation: mark used flags and pay costs post-resolution (new schema costs)
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
    markAbilityUsed,
    lockCurrentAttack
  } = params;

  const typeKey = _.get(ability, 'typeKey', '');
  const isOnPlay = typeKey === 'On Play';
  const freqLabel = _.toLower(_.get(ability, 'frequency', ''));
  const isOncePerTurn = freqLabel === 'once per turn';
  const isWhenAttacking = typeKey === 'On Attack' || typeKey === 'On Attack or Opponents Attack';

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
    const costType = _.get(cost, 'type', '');

    //. moveFromField: move this card from field to deck
    if (costType === 'moveFromField' && returnCardToDeck && actionSource) {
      const destination = cost.destination || 'bottomOfDeck';
      const position = destination === 'bottomOfDeck' ? 'bottom' : (destination === 'topOfDeck' ? 'top' : 'shuffle');
      returnCardToDeck(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex,
        position
      );
    }

    //. returnThisToDeck: move card to deck (top/bottom/shuffle)
    if (costType === 'returnThisToDeck' && returnCardToDeck && actionSource) {
      const position = cost.position || 'top';
      returnCardToDeck(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex,
        position
      );
    }

    //. trashThis: move card to trash
    if (costType === 'trashThis' && actionSource && removeCardByEffect) {
      removeCardByEffect(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex,
        actionSource.side
      );
    }

    //. restThis: rest/tap this card
    if (costType === 'restThis' && actionSource && typeof restCard === 'function') {
      restCard(
        actionSource.side,
        actionSource.section,
        actionSource.keyName,
        actionSource.index ?? cardIndex
      );
    }

    //. payLife: move Life cards to hand without Trigger
    const lifeAmount = costType === 'payLife' ? (cost.amount || 1) : 0;
    if (lifeAmount > 0) {
      try {
        const side = _.get(actionSource, 'side', 'player');
        if (typeof payLife === 'function') {
          payLife(side, lifeAmount);
        }
      } catch { /* noop */ }
    }
  }

  //. Lock current attack only when a When Attacking ability actually applied an effect
  const effectApplied = _.get(params, 'effectApplied', false);
  if (isWhenAttacking && effectApplied && typeof lockCurrentAttack === 'function') {
    try {
      lockCurrentAttack(actionSource, abilityIndex);
    } catch { /* noop */ }
  }
}
