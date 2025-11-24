import { useCallback, useEffect } from 'react';

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
  const isBattleStep = useCallback((step) => battle && battle.step === step, [battle]);

  const canCharacterAttack = useCallback((card, side, index) => {
    if (!card?.id) return false;
    if (side !== turnSide) return false;
    if (phaseLower !== 'main') return false;

    const fieldArr = getCharArray(side);
    const fieldInst = fieldArr[index];
    const rested = fieldInst ? fieldInst.rested : card.rested;
    if (rested) return false;

    const rushStatic = hasKeyword(getKeywordsFor(card.id), 'rush');
    const rushTemp = hasTempKeyword(side, 'char', 'char', index, 'Rush');
    const rush = rushStatic || rushTemp;

    if (turnNumber <= 2 && !rush) return false;

    const enteredTurnVal = fieldInst ? fieldInst.enteredTurn : card.enteredTurn;
    if (typeof enteredTurnVal === 'number' && enteredTurnVal === turnNumber && !rush) return false;

    return true;
  }, [turnSide, phaseLower, getCharArray, hasKeyword, getKeywordsFor, hasTempKeyword, turnNumber]);

  const canLeaderAttack = useCallback((card, side) => {
    if (!card?.id) return false;
    if (side !== turnSide) return false;
    if (phaseLower !== 'main') return false;

    const leaderArr = getLeaderArray(side);
    const leaderCard = leaderArr[0];
    if (!leaderCard) return false;
    if (leaderCard.rested) return false;

    if (turnNumber <= 2) return false;

    return true;
  }, [turnSide, phaseLower, getLeaderArray, turnNumber]);

  const beginAttackForLeader = useCallback((leaderCard, attackingSide = 'player') => {
    if (!canPerformGameAction()) return;
    if (battle) return;
    if (!canLeaderAttack(leaderCard, attackingSide)) return;

    cancelDonGiving();

    const defendingSide = getOpposingSide(attackingSide);
    const attackerKey = modKey(attackingSide, 'middle', 'leader', 0);
    const attackerPower = getTotalPower(attackingSide, 'middle', 'leader', 0, leaderCard.id);
    setCurrentAttack({ key: attackerKey, cardId: leaderCard.id, index: 0, power: attackerPower, isLeader: true });
    appendLog(`[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"} Leader declares attack (power ${attackerPower}). Choose ${getOpposingSide(defendingSide)} Leader or a rested Character.`);

    startTargeting({
      side: defendingSide,
      multi: true,
      min: 1,
      max: 1,
      validator: (card, ctx) => {
        if (!ctx) return false;
        if (ctx.section === 'middle' && ctx.keyName === 'leader') return true;
        if (ctx.section === 'char' && ctx.keyName === 'char') return !!card?.rested;
        return false;
      },
      origin: { side: attackingSide, section: 'middle', keyName: 'leader', index: 0 },
      abilityIndex: null,
      type: 'attack'
    }, (targets) => {
      const t = (targets || [])[0];
      if (!t) {
        setCurrentAttack(null);
        return;
      }
      setAreas((prev) => {
        const next = structuredClone(prev);
        if (next[attackingSide]?.middle?.leader?.[0]) {
          next[attackingSide].middle.leader[0].rested = true;
        }
        return next;
      });
      const targetArr = (t.section === 'char') ? (areas?.[defendingSide]?.char || []) : (areas?.[defendingSide]?.middle?.leader || []);
      const targetCard = targetArr[t.index];
      if (!targetCard) {
        appendLog('[attack] Target not found.');
        setCurrentAttack(null);
        return;
      }
      closeActionPanel();
      setBattle({
        attacker: { side: attackingSide, section: 'middle', keyName: 'leader', index: 0, id: leaderCard.id, power: attackerPower },
        target: { side: defendingSide, section: t.section, keyName: t.keyName, index: t.index, id: targetCard.id },
        step: 'attack',
        blockerUsed: false,
        counterPower: 0,
        counterTarget: null
      });
    });
  }, [areas, appendLog, battle, canLeaderAttack, canPerformGameAction, cancelDonGiving, closeActionPanel, getOpposingSide, getTotalPower, modKey, setAreas, setBattle, setCurrentAttack, startTargeting]);

  const beginAttackForCard = useCallback((attackerCard, attackerIndex, attackingSide = 'player') => {
    if (!canPerformGameAction()) return;
    if (battle) return;
    if (!canCharacterAttack(attackerCard, attackingSide, attackerIndex)) return;

    cancelDonGiving();

    const defendingSide = getOpposingSide(attackingSide);
    const attackerKey = modKey(attackingSide, 'char', 'char', attackerIndex);
    const attackerPower = getTotalPower(attackingSide, 'char', 'char', attackerIndex, attackerCard.id);
    setCurrentAttack({ key: attackerKey, cardId: attackerCard.id, index: attackerIndex, power: attackerPower });
    appendLog(`[attack] ${attackingSide === 'player' ? 'Your' : "Opponent's"} ${attackerCard.id} declares attack (power ${attackerPower}). Choose ${getOpposingSide(defendingSide)} Leader or a rested Character.`);

    startTargeting({
      side: defendingSide,
      multi: true,
      min: 1,
      max: 1,
      validator: (card, ctx) => {
        if (!ctx) return false;
        if (ctx.section === 'middle' && ctx.keyName === 'leader') return true;
        if (ctx.section === 'char' && ctx.keyName === 'char') return !!card?.rested;
        return false;
      },
      origin: { side: attackingSide, section: 'char', keyName: 'char', index: attackerIndex },
      abilityIndex: null,
      type: 'attack'
    }, (targets) => {
      const t = (targets || [])[0];
      if (!t) {
        setCurrentAttack(null);
        return;
      }
      setAreas((prev) => {
        const next = structuredClone(prev);
        if (next[attackingSide]?.char?.[attackerIndex]) {
          next[attackingSide].char[attackerIndex].rested = true;
        }
        return next;
      });
      const targetArr = (t.section === 'char') ? (areas?.[defendingSide]?.char || []) : (areas?.[defendingSide]?.middle?.leader || []);
      const targetCard = targetArr[t.index];
      if (!targetCard) {
        appendLog('[attack] Target not found.');
        setCurrentAttack(null);
        return;
      }
      closeActionPanel();
      setBattle({
        attacker: { side: attackingSide, section: 'char', keyName: 'char', index: attackerIndex, id: attackerCard.id, power: attackerPower },
        target: { side: defendingSide, section: t.section, keyName: t.keyName, index: t.index, id: targetCard.id },
        step: 'attack',
        blockerUsed: false,
        counterPower: 0,
        counterTarget: null
      });
    });
  }, [areas, appendLog, battle, canCharacterAttack, canPerformGameAction, cancelDonGiving, closeActionPanel, getOpposingSide, getTotalPower, modKey, setAreas, setBattle, setCurrentAttack, startTargeting]);

  useEffect(() => {
    if (!battle) return;
    if (battle.step === 'attack') {
      appendLog('[battle] Attack Step complete. Proceed to Block Step.');
      cancelTargeting();
      setBattle((b) => ({ ...b, step: 'block' }));
    }
  }, [battle, appendLog, cancelTargeting, setBattle]);

  const getDefenderPower = useCallback((b) => {
    if (!b) return 0;
    const basePower = getTotalPower(b.target.side, b.target.section, b.target.keyName, b.target.index, b.target.id);
    const isCounterTarget = b.counterTarget &&
      b.counterTarget.side === b.target.side &&
      b.counterTarget.section === b.target.section &&
      b.counterTarget.keyName === b.target.keyName &&
      b.counterTarget.index === b.target.index;
    return basePower + (isCounterTarget ? (b.counterPower || 0) : 0);
  }, [getTotalPower]);

  const getAttackerPower = useCallback((b) => {
    if (!b) return 0;
    return getTotalPower(b.attacker.side, b.attacker.section, b.attacker.keyName, b.attacker.index, b.attacker.id);
  }, [getTotalPower]);

  const getBattleStatus = useCallback(() => {
    if (!battle) return null;
    const atk = getAttackerPower(battle);
    const def = getDefenderPower(battle);
    const needed = Math.max(0, atk - def + 1000);
    return { atk, def, needed, safe: def > atk };
  }, [battle, getAttackerPower, getDefenderPower]);

  const applyBlocker = useCallback((blockerIndex) => {
    if (!isBattleStep('block')) return;
    const defendingSide = battle.target?.side || 'opponent';
    const chars = getCharArray(defendingSide);
    const card = chars[blockerIndex];
    if (!card) return;
    const hasBlocker = hasKeyword(getKeywordsFor(card.id), 'blocker');
    if (!hasBlocker) return;
    if (card.rested) return;
    const blockerDisabled = hasDisabledKeyword(defendingSide, 'char', 'char', blockerIndex, 'Blocker');
    if (blockerDisabled) {
      appendLog(`[battle] ${card.id} cannot activate [Blocker] (disabled by effect).`);
      return;
    }
    setAreas((prev) => {
      const next = structuredClone(prev);
      const loc = getSideLocationFromNext(next, defendingSide);
      if (loc?.char?.[blockerIndex]) {
        loc.char[blockerIndex].rested = true;
      }
      return next;
    });
    appendLog(`[battle] Blocker ${card.id} rests to block.`);
    setBattle((b) => {
      const newTarget = { side: defendingSide, section: 'char', keyName: 'char', index: blockerIndex, id: card.id };
      const counterTarget = (b.counterPower && b.counterPower > 0) ? newTarget : b.counterTarget;
      return {
        ...b,
        target: newTarget,
        blockerUsed: true,
        step: 'counter',
        counterTarget
      };
    });
  }, [battle, appendLog, getCharArray, getKeywordsFor, getSideLocationFromNext, hasDisabledKeyword, hasKeyword, isBattleStep, setAreas, setBattle]);

  const skipBlock = useCallback(() => {
    if (!isBattleStep('block')) return;
    appendLog('[battle] No blocker used. Proceed to Counter Step.');
    setBattle((b) => ({ ...b, step: 'counter' }));
  }, [appendLog, isBattleStep, setBattle]);

  const addCounterFromHand = useCallback((handIndex) => {
    if (!(isBattleStep('counter') || isBattleStep('block'))) return;
    const defendingSide = battle.target.side;
    const handLoc = getHandCostLocation(defendingSide);
    const card = handLoc?.hand?.[handIndex];
    if (!card) return;
    const meta = getCardMeta(card.id);
    const counterVal = meta?.stats?.counter?.present ? (meta.stats.counter.value || 0) : 0;
    if (!counterVal) return;

    setAreas((prev) => {
      const next = structuredClone(prev);
      const loc = defendingSide === 'player' ? next.player?.bottom : next.opponent?.top;
      const hand = loc?.hand || [];
      hand.splice(handIndex, 1);
      loc.hand = hand;
      const trashArr = loc?.trash || [];
      loc.trash = [...trashArr, card];
      return next;
    });

    setBattle((b) => ({
      ...b,
      counterPower: (b.counterPower || 0) + counterVal,
      counterTarget: {
        side: battle.target.side,
        section: battle.target.section,
        keyName: battle.target.keyName,
        index: battle.target.index
      },
      step: b.step === 'block' && !b.blockerUsed ? 'block' : b.step
    }));

    const targetName = battle.target.section === 'middle' ? 'Leader' : areas?.[battle.target.side]?.char?.[battle.target.index]?.id || 'Character';
    appendLog(`[battle] Counter applied: ${card.id} +${counterVal} to ${targetName}.`);
    closeActionPanel();
  }, [areas, appendLog, battle, closeActionPanel, getCardMeta, getHandCostLocation, isBattleStep, setAreas, setBattle]);

  const playCounterEventFromHand = useCallback((handIndex) => {
    if (!isBattleStep('counter')) return;
    const defendingSide = battle.target.side;
    setAreas((prev) => {
      const next = structuredClone(prev);
      const loc = defendingSide === 'player' ? next.player?.bottom : next.opponent?.top;
      const hand = loc?.hand || [];
      const card = hand[handIndex];
      if (!card) return prev;
      const meta = getCardMeta(card.id);
      if (!meta) return prev;
      const isEvent = meta.category === 'Event';
      const hasCounterKeyword = hasKeyword(meta.keywords, 'counter');
      if (!isEvent || !hasCounterKeyword) return prev;
      const cost = meta?.stats?.cost || 0;
      const costArr = loc?.cost || [];
      const activeDon = costArr.filter((d) => d.id === 'DON' && !d.rested);
      if (activeDon.length < cost) return prev;
      let toRest = cost;
      for (let i = 0; i < costArr.length && toRest > 0; i++) {
        const d = costArr[i];
        if (d.id === 'DON' && !d.rested) {
          d.rested = true;
          toRest--;
        }
      }
      hand.splice(handIndex, 1);
      loc.hand = hand;
      const trashArr = loc?.trash || [];
      loc.trash = [...trashArr, card];
      appendLog(`[battle] Event Counter activated: ${card.id} (cost ${cost}).`);
      return next;
    });
  }, [appendLog, battle, getCardMeta, hasKeyword, isBattleStep, setAreas]);

  const endCounterStep = useCallback(() => {
    if (!isBattleStep('counter')) return;
    appendLog('[battle] Counter Step complete. Proceed to Damage Step.');
    setBattle((b) => ({ ...b, step: 'damage' }));
  }, [appendLog, isBattleStep, setBattle]);

  const resolveDamage = useCallback(() => {
    if (!isBattleStep('damage')) return;
    const atkPower = getAttackerPower(battle);
    const defPower = getDefenderPower(battle);
    const targetIsLeader = battle.target.section === 'middle' && battle.target.keyName === 'leader';
    appendLog(`[battle] Damage Step: Attacker ${battle.attacker.id} ${atkPower} vs Defender ${battle.target.id} ${defPower}.`);
    if (atkPower >= defPower) {
      if (targetIsLeader) {
        appendLog('[result] Leader takes 1 damage.');
        dealOneDamageToLeader(battle.target.side);
      } else {
        const defendingSide = battle.target.side;
        setAreas((prev) => {
          const next = structuredClone(prev);
          const sideLoc = getSideLocationFromNext(next, defendingSide);
          const charArr = sideLoc.char || [];
          const charDonArr = sideLoc.charDon || [];
          const removed = charArr.splice(battle.target.index, 1)[0];
          charDonArr.splice(battle.target.index, 1);
          sideLoc.char = charArr;
          sideLoc.charDon = charDonArr;
          const trashLoc = getHandCostLocationFromNext(next, defendingSide);
          const trashArr = trashLoc?.trash || [];
          trashLoc.trash = [...trashArr, removed];
          return next;
        });
        returnDonFromCard(defendingSide, 'char', 'char', battle.target.index);
        appendLog(`[result] Defender Character ${battle.target.id} K.O.'d.`);
      }
    } else {
      appendLog('[result] Attacker loses battle; no damage.');
    }
    setBattle((b) => ({ ...b, step: 'end' }));
  }, [appendLog, battle, dealOneDamageToLeader, getAttackerPower, getDefenderPower, getHandCostLocationFromNext, getSideLocationFromNext, isBattleStep, returnDonFromCard, setAreas, setBattle]);

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
  }, [appendLog, battle, resolveDamage, setBattle, setBattleArrow, setCurrentAttack]);

  useEffect(() => {
    if (!battle) {
      setBattleArrow(null);
      return;
    }
    const fromKey = modKey(battle.attacker.side, battle.attacker.section, battle.attacker.keyName, battle.attacker.index);
    const toKey = modKey(battle.target.side, battle.target.section, battle.target.keyName, battle.target.index);
    const attackerLabel = battle.attacker.side === 'player' ? '' : ' (Opp)';
    const defenderLabel = battle.target.side === 'player' ? '' : ' (Opp)';
    const label = `${getAttackerPower(battle)}${attackerLabel} ▶ ${getDefenderPower(battle)}${defenderLabel}`;
    setBattleArrow({ fromKey, toKey, label });
  }, [battle, getAttackerPower, getDefenderPower, modKey, setBattleArrow]);

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
