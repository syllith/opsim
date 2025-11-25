import { useCallback, useEffect } from 'react';
import _ from 'lodash';

//. Safely rests a card instance at the given path in the board state
const restInstance = (root, path) => {
  const inst = _.get(root, path);
  if (inst) {
    inst.rested = true;
  }
};

//. Returns the "side zone" object (player.bottom / opponent.top) for hand/cost/trash
const getSideZoneLoc = (root, side) =>
  side === 'player'
    ? _.get(root, ['player', 'bottom'])
    : _.get(root, ['opponent', 'top']);

export function useBattleSystem({
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
  getCardMeta
}) {
  //. Step helpers --------------------------------------------------------

  const isBattleStep = useCallback(
    (step) => !!battle && battle.step === step,
    [battle]
  );

  //. Attack permissions --------------------------------------------------

  const canCharacterAttack = useCallback(
    (card, side, index) => {
      const id = _.get(card, 'id');
      if (!id) { return false; }
      if (side !== turnSide) { return false; }
      if (phaseLower !== 'main') { return false; }

      const fieldArr = getCharArray(side);
      const fieldInst = _.get(fieldArr, index);

      const rested = _.get(fieldInst, 'rested', card?.rested);
      if (rested) { return false; }

      const rushStatic = hasKeyword(getKeywordsFor(id), 'rush');
      const rushTemp = hasTempKeyword(side, 'char', 'char', index, 'Rush');
      const rush = rushStatic || rushTemp;

      //. Cannot attack before turn 3 unless Rush
      if (turnNumber <= 2 && !rush) { return false; }

      const enteredTurnVal = _.get(fieldInst, 'enteredTurn', card?.enteredTurn);
      if (
        typeof enteredTurnVal === 'number' &&
        enteredTurnVal === turnNumber &&
        !rush
      ) {
        return false;
      }

      return true;
    },
    [
      turnSide,
      phaseLower,
      getCharArray,
      hasKeyword,
      getKeywordsFor,
      hasTempKeyword,
      turnNumber
    ]
  );

  const canLeaderAttack = useCallback(
    (card, side) => {
      const id = _.get(card, 'id');
      if (!id) { return false; }
      if (side !== turnSide) { return false; }
      if (phaseLower !== 'main') { return false; }

      const leaderArr = getLeaderArray(side);
      const leaderCard = _.get(leaderArr, 0);
      if (!leaderCard || leaderCard.rested) { return false; }

      //. Leaders also can't attack before turn 3
      if (turnNumber <= 2) { return false; }

      return true;
    },
    [turnSide, phaseLower, getLeaderArray, turnNumber]
  );

  //. Shared attack targeting validator (Leader / Character) --------------

  const attackTargetValidator = useCallback(
    (card, ctx) => {
      if (!ctx) { return false; }
      if (ctx.section === 'middle' && ctx.keyName === 'leader') { return true; }
      if (ctx.section === 'char' && ctx.keyName === 'char') {
        //. Only rested Characters can be attacked
        return !!card?.rested;
      }
      return false;
    },
    []
  );

  //. Attack entry points -------------------------------------------------

  const beginAttackForLeader = useCallback(
    (leaderCard, attackingSide = 'player') => {
      if (!canPerformGameAction()) { return; }
      if (battle) { return; }
      if (!canLeaderAttack(leaderCard, attackingSide)) { return; }

      cancelDonGiving();

      const defendingSide = getOpposingSide(attackingSide);
      const attackerKey = modKey(attackingSide, 'middle', 'leader', 0);
      const attackerPower = getTotalPower(
        attackingSide,
        'middle',
        'leader',
        0,
        leaderCard.id
      );

      setCurrentAttack({
        key: attackerKey,
        cardId: leaderCard.id,
        index: 0,
        power: attackerPower,
        isLeader: true
      });

      appendLog(
        `[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"
        } Leader declares attack (power ${attackerPower}). Choose target.`
      );

      //. Enter "declaring" so On Attack abilities can fire during target selection
      setBattle({
        attacker: {
          side: attackingSide,
          section: 'middle',
          keyName: 'leader',
          index: 0,
          id: leaderCard.id,
          power: attackerPower
        },
        target: null,
        step: 'declaring',
        blockerUsed: false,
        counterPower: 0,
        counterTarget: null
      });

      startTargeting(
        {
          side: defendingSide,
          multi: true,
          min: 0,
          max: 1,
          validator: attackTargetValidator,
          origin: {
            side: attackingSide,
            section: 'middle',
            keyName: 'leader',
            index: 0
          },
          abilityIndex: null,
          type: 'attack'
        },
        (targets) => {
          const t = _.get(targets, 0);
          if (!t) {
            //. Attack cancelled – clear battle state
            setCurrentAttack(null);
            setBattle(null);
            appendLog('[attack] Attack cancelled.');
            return;
          }

          //. Rest attacking Leader
          setAreas((prev) => {
            const next = _.cloneDeep(prev);
            restInstance(next, [attackingSide, 'middle', 'leader', 0]);
            return next;
          });

          //. Resolve target card from current board state
          const targetArr =
            t.section === 'char'
              ? _.get(areas, [defendingSide, 'char'], [])
              : _.get(areas, [defendingSide, 'middle', 'leader'], []);

          const targetCard = _.get(targetArr, t.index);
          if (!targetCard) {
            appendLog('[attack] Target not found.');
            setCurrentAttack(null);
            setBattle(null);
            return;
          }

          closeActionPanel();

          setBattle({
            attacker: {
              side: attackingSide,
              section: 'middle',
              keyName: 'leader',
              index: 0,
              id: leaderCard.id,
              power: attackerPower
            },
            target: {
              side: defendingSide,
              section: t.section,
              keyName: t.keyName,
              index: t.index,
              id: targetCard.id
            },
            step: 'attack',
            blockerUsed: false,
            counterPower: 0,
            counterTarget: null
          });
        }
      );
    },
    [
      areas,
      appendLog,
      battle,
      canLeaderAttack,
      canPerformGameAction,
      cancelDonGiving,
      closeActionPanel,
      getOpposingSide,
      getTotalPower,
      modKey,
      setAreas,
      setBattle,
      setCurrentAttack,
      startTargeting,
      attackTargetValidator
    ]
  );

  const beginAttackForCard = useCallback(
    (attackerCard, attackerIndex, attackingSide = 'player') => {
      if (!canPerformGameAction()) { return; }
      if (battle) { return; }
      if (!canCharacterAttack(attackerCard, attackingSide, attackerIndex)) { return; }

      cancelDonGiving();

      const defendingSide = getOpposingSide(attackingSide);
      const attackerKey = modKey(attackingSide, 'char', 'char', attackerIndex);
      const attackerPower = getTotalPower(
        attackingSide,
        'char',
        'char',
        attackerIndex,
        attackerCard.id
      );

      setCurrentAttack({
        key: attackerKey,
        cardId: attackerCard.id,
        index: attackerIndex,
        power: attackerPower
      });

      appendLog(
        `[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"
        } ${attackerCard.id} declares attack (power ${attackerPower}). Choose target.`
      );

      //. Enter "declaring" so On Attack abilities can fire during target selection
      setBattle({
        attacker: {
          side: attackingSide,
          section: 'char',
          keyName: 'char',
          index: attackerIndex,
          id: attackerCard.id,
          power: attackerPower
        },
        target: null,
        step: 'declaring',
        blockerUsed: false,
        counterPower: 0,
        counterTarget: null
      });

      startTargeting(
        {
          side: defendingSide,
          multi: true,
          min: 0,
          max: 1,
          validator: attackTargetValidator,
          origin: {
            side: attackingSide,
            section: 'char',
            keyName: 'char',
            index: attackerIndex
          },
          abilityIndex: null,
          type: 'attack'
        },
        (targets) => {
          const t = _.get(targets, 0);
          if (!t) {
            //. Attack cancelled – clear battle state
            setCurrentAttack(null);
            setBattle(null);
            appendLog('[attack] Attack cancelled.');
            return;
          }

          //. Rest attacking Character
          setAreas((prev) => {
            const next = _.cloneDeep(prev);
            restInstance(next, [attackingSide, 'char', attackerIndex]);
            return next;
          });

          const targetArr =
            t.section === 'char'
              ? _.get(areas, [defendingSide, 'char'], [])
              : _.get(areas, [defendingSide, 'middle', 'leader'], []);

          const targetCard = _.get(targetArr, t.index);
          if (!targetCard) {
            appendLog('[attack] Target not found.');
            setCurrentAttack(null);
            setBattle(null);
            return;
          }

          closeActionPanel();

          setBattle({
            attacker: {
              side: attackingSide,
              section: 'char',
              keyName: 'char',
              index: attackerIndex,
              id: attackerCard.id,
              power: attackerPower
            },
            target: {
              side: defendingSide,
              section: t.section,
              keyName: t.keyName,
              index: t.index,
              id: targetCard.id
            },
            step: 'attack',
            blockerUsed: false,
            counterPower: 0,
            counterTarget: null
          });
        }
      );
    },
    [
      areas,
      appendLog,
      battle,
      canCharacterAttack,
      canPerformGameAction,
      cancelDonGiving,
      closeActionPanel,
      getOpposingSide,
      getTotalPower,
      modKey,
      setAreas,
      setBattle,
      setCurrentAttack,
      startTargeting,
      attackTargetValidator
    ]
  );

  //. Step transitions (attack → block) ----------------------------------

  useEffect(() => {
    if (!battle) { return; }
    if (battle.step === 'attack') {
      appendLog('[battle] Attack Step complete. Proceed to Block Step.');
      cancelTargeting();
      setBattle((b) => ({ ...b, step: 'block' }));
    }
  }, [battle, appendLog, cancelTargeting, setBattle]);

  //. Power helpers -------------------------------------------------------

  const getDefenderPower = useCallback(
    (b) => {
      if (!b) { return 0; }

      const tSide = _.get(b, 'target.side');
      const tSection = _.get(b, 'target.section');
      const tKey = _.get(b, 'target.keyName');
      const tIndex = _.get(b, 'target.index');
      const tId = _.get(b, 'target.id');

      const basePower = getTotalPower(tSide, tSection, tKey, tIndex, tId);

      const isCounterTarget =
        b.counterTarget &&
        b.counterTarget.side === tSide &&
        b.counterTarget.section === tSection &&
        b.counterTarget.keyName === tKey &&
        b.counterTarget.index === tIndex;

      return basePower + (isCounterTarget ? (b.counterPower || 0) : 0);
    },
    [getTotalPower]
  );

  const getAttackerPower = useCallback(
    (b) => {
      if (!b) { return 0; }
      return getTotalPower(
        b.attacker.side,
        b.attacker.section,
        b.attacker.keyName,
        b.attacker.index,
        b.attacker.id
      );
    },
    [getTotalPower]
  );

  const getBattleStatus = useCallback(
    () => {
      if (!battle) { return null; }
      const atk = getAttackerPower(battle);
      const def = getDefenderPower(battle);
      const needed = Math.max(0, atk - def + 1000);
      return {
        atk,
        def,
        needed,
        safe: def > atk
      };
    },
    [battle, getAttackerPower, getDefenderPower]
  );

  //. Block Step ----------------------------------------------------------

  const applyBlocker = useCallback(
    (blockerIndex) => {
      if (!isBattleStep('block')) { return; }

      const defendingSide = _.get(battle, 'target.side', 'opponent');
      const chars = getCharArray(defendingSide);
      const card = _.get(chars, blockerIndex);
      if (!card) { return; }

      const hasBlocker = hasKeyword(getKeywordsFor(card.id), 'blocker');
      if (!hasBlocker) { return; }
      if (card.rested) { return; }

      const blockerDisabled = hasDisabledKeyword(
        defendingSide,
        'char',
        'char',
        blockerIndex,
        'Blocker'
      );
      if (blockerDisabled) {
        appendLog(
          `[battle] ${card.id} cannot activate [Blocker] (disabled by effect).`
        );
        return;
      }

      //. Rest the blocker on the board
      setAreas((prev) => {
        const next = _.cloneDeep(prev);
        const loc = getSideLocationFromNext(next, defendingSide);
        restInstance(loc, ['char', blockerIndex]);
        return next;
      });

      appendLog(`[battle] Blocker ${card.id} rests to block.`);

      setBattle((b) => {
        const newTarget = {
          side: defendingSide,
          section: 'char',
          keyName: 'char',
          index: blockerIndex,
          id: card.id
        };
        const hasCounterPower = b.counterPower && b.counterPower > 0;
        const counterTarget = hasCounterPower ? newTarget : b.counterTarget;
        return {
          ...b,
          target: newTarget,
          blockerUsed: true,
          step: 'counter',
          counterTarget
        };
      });
    },
    [
      battle,
      appendLog,
      getCharArray,
      getKeywordsFor,
      getSideLocationFromNext,
      hasDisabledKeyword,
      hasKeyword,
      isBattleStep,
      setAreas,
      setBattle
    ]
  );

  const skipBlock = useCallback(
    () => {
      if (!isBattleStep('block')) { return; }
      appendLog('[battle] No blocker used. Proceed to Counter Step.');
      setBattle((b) => ({ ...b, step: 'counter' }));
    },
    [appendLog, isBattleStep, setBattle]
  );

  //. Counter Step --------------------------------------------------------

  const addCounterFromHand = useCallback(
    (handIndex) => {
      if (!(isBattleStep('counter') || isBattleStep('block'))) { return; }
      if (!battle?.target) { return; }

      const defendingSide = battle.target.side;
      const handLoc = getHandCostLocation(defendingSide);
      const card = _.get(handLoc, ['hand', handIndex]);
      if (!card) { return; }

      const meta = getCardMeta(card.id);
      const counterVal = meta?.stats?.counter?.present
        ? meta.stats.counter.value || 0
        : 0;
      if (!counterVal) { return; }

      //. Move the card from hand to trash
      setAreas((prev) => {
        const next = _.cloneDeep(prev);
        const loc = getSideZoneLoc(next, defendingSide);
        if (!loc) { return next; }

        const hand = loc.hand || [];
        const [removed] = hand.splice(handIndex, 1);
        loc.hand = hand;

        const trashArr = loc.trash || [];
        loc.trash = [...trashArr, removed || card];

        return next;
      });

      //. Apply counter power to the defender
      setBattle((b) => ({
        ...b,
        counterPower: (b.counterPower || 0) + counterVal,
        counterTarget: {
          side: battle.target.side,
          section: battle.target.section,
          keyName: battle.target.keyName,
          index: battle.target.index
        },
        //. If we were in Block Step and no blocker ever used, keep it as block; otherwise keep step
        step: b.step === 'block' && !b.blockerUsed ? 'block' : b.step
      }));

      const isLeaderTarget = battle.target.section === 'middle';
      const targetName = isLeaderTarget
        ? 'Leader'
        : _.get(areas, [battle.target.side, 'char', battle.target.index, 'id']) ||
        'Character';

      appendLog(
        `[battle] Counter applied: ${card.id} +${counterVal} to ${targetName}.`
      );
      closeActionPanel();
    },
    [
      areas,
      appendLog,
      battle,
      closeActionPanel,
      getCardMeta,
      getHandCostLocation,
      isBattleStep,
      setAreas,
      setBattle
    ]
  );

  const playCounterEventFromHand = useCallback(
    (handIndex) => {
      if (!isBattleStep('counter')) { return; }
      if (!battle?.target) { return; }

      const defendingSide = battle.target.side;

      setAreas((prev) => {
        const next = _.cloneDeep(prev);
        const loc = getSideZoneLoc(next, defendingSide);
        if (!loc) { return prev; }

        const hand = loc.hand || [];
        const card = _.get(hand, handIndex);
        if (!card) { return prev; }

        const meta = getCardMeta(card.id);
        if (!meta) { return prev; }

        const isEvent = meta.category === 'Event';
        const hasCounterKeyword = hasKeyword(meta.keywords, 'counter');
        if (!isEvent || !hasCounterKeyword) { return prev; }

        const cost = meta?.stats?.cost || 0;
        const costArr = loc.cost || [];

        const activeDon = _.filter(
          costArr,
          (d) => d.id === 'DON' && !d.rested
        );

        if (activeDon.length < cost) { return prev; }

        //. Rest DON to pay cost
        let toRest = cost;
        for (let i = 0; i < costArr.length && toRest > 0; i++) {
          const d = costArr[i];
          if (d.id === 'DON' && !d.rested) {
            d.rested = true;
            toRest--;
          }
        }

        //. Move event from hand to trash
        hand.splice(handIndex, 1);
        loc.hand = hand;

        const trashArr = loc.trash || [];
        loc.trash = [...trashArr, card];

        appendLog(
          `[battle] Event Counter activated: ${card.id} (cost ${cost}).`
        );

        return next;
      });
    },
    [appendLog, battle, getCardMeta, hasKeyword, isBattleStep, setAreas]
  );

  const endCounterStep = useCallback(
    () => {
      if (!isBattleStep('counter')) { return; }
      if (!battle?.target) { return; }
      appendLog('[battle] Counter Step complete. Proceed to Damage Step.');
      setBattle((b) => ({ ...b, step: 'damage' }));
    },
    [appendLog, battle, isBattleStep, setBattle]
  );

  //. Damage Step ---------------------------------------------------------

  const resolveDamage = useCallback(
    () => {
      if (!isBattleStep('damage')) { return; }
      if (!battle?.target || !battle?.attacker) { return; }

      const atkPower = getAttackerPower(battle);
      const defPower = getDefenderPower(battle);
      const targetIsLeader =
        battle.target.section === 'middle' &&
        battle.target.keyName === 'leader';

      appendLog(
        `[battle] Damage Step: Attacker ${battle.attacker.id} ${atkPower} vs Defender ${battle.target.id} ${defPower}.`
      );

      if (atkPower >= defPower) {
        if (targetIsLeader) {
          //. Leader takes 1 damage (life -1)
          appendLog('[result] Leader takes 1 damage.');
          dealOneDamageToLeader(battle.target.side);
        } else {
          const defendingSide = battle.target.side;

          //. KO Character and move to trash, remove attached DON!!
          setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const sideLoc = getSideLocationFromNext(next, defendingSide);
            const charArr = sideLoc.char || [];
            const charDonArr = sideLoc.charDon || [];

            const [removed] = charArr.splice(battle.target.index, 1);
            charDonArr.splice(battle.target.index, 1);

            sideLoc.char = charArr;
            sideLoc.charDon = charDonArr;

            const trashLoc = getHandCostLocationFromNext(next, defendingSide);
            const trashArr = trashLoc?.trash || [];
            trashLoc.trash = [...trashArr, removed];

            return next;
          });

          returnDonFromCard(
            defendingSide,
            'char',
            'char',
            battle.target.index
          );
          appendLog(
            `[result] Defender Character ${battle.target.id} K.O.'d.`
          );
        }
      } else {
        appendLog('[result] Attacker loses battle; no damage.');
      }

      setBattle((b) => ({ ...b, step: 'end' }));
    },
    [
      appendLog,
      battle,
      dealOneDamageToLeader,
      getAttackerPower,
      getDefenderPower,
      getHandCostLocationFromNext,
      getSideLocationFromNext,
      isBattleStep,
      returnDonFromCard,
      setAreas,
      setBattle
    ]
  );

  //. Automatic resolution / cleanup -------------------------------------

  useEffect(() => {
    if (!battle) { return; }

    if (battle.step === 'damage') {
      resolveDamage();
    } else if (battle.step === 'end') {
      appendLog('[battle] Battle ends.');
      setBattle(null);
      setCurrentAttack(null);
      setBattleArrow(null);
    }
  }, [appendLog, battle, resolveDamage, setBattle, setBattleArrow, setCurrentAttack]);

  //. Arrow / visual feedback --------------------------------------------

  useEffect(() => {
    if (!battle) {
      setBattleArrow(null);
      return;
    }

    //. No arrow while declaring or without a target
    if (battle.step === 'declaring' || !battle.target) {
      setBattleArrow(null);
      return;
    }

    const fromKey = modKey(
      battle.attacker.side,
      battle.attacker.section,
      battle.attacker.keyName,
      battle.attacker.index
    );
    const toKey = modKey(
      battle.target.side,
      battle.target.section,
      battle.target.keyName,
      battle.target.index
    );

    const attackerLabel = battle.attacker.side === 'player' ? '' : ' (Opp)';
    const defenderLabel = battle.target.side === 'player' ? '' : ' (Opp)';

    const label = `${getAttackerPower(battle)}${attackerLabel} ▶ ${getDefenderPower(
      battle
    )}${defenderLabel}`;

    setBattleArrow({ fromKey, toKey, label });
  }, [battle, getAttackerPower, getDefenderPower, modKey, setBattleArrow]);

  //. Public API ----------------------------------------------------------

  return {
    isBattleStep,
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
    getAttackerPower,
    getDefenderPower
  };
}
