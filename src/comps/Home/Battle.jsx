// src/comps/Home/Battle.jsx
/**
 * Battle.jsx
 *
 * Battle system integration with the engine.
 * Delegates battle execution to BattleHelpers.runBattle.
 */

import { useCallback, useRef } from 'react';
import { 
  convertAreasToGameState, 
  convertGameStateToAreas, 
  getInstanceIdFromAreas 
} from './hooks/engineAdapter.js';
import { runBattle } from './BattleHelpers.js'; // new helper
import engine from '../../engine/index.js';

export function useBattleSystem({
  battle,
  setBattle,
  currentAttack,
  setCurrentAttack,
  setBattleArrow,
  areas,
  setAreas,
  mutateAreas,
  appendLog,
  turnSide = 'player',
  turnNumber = 1,
  phase = 'Main',
  getTotalPower: getTotalPowerFromParent,
}) {
  const battleInProgressRef = useRef(false);

  const isBattleStep = useCallback((step) => battle?.step === step, [battle]);

  const canCharacterAttack = useCallback((card, side = 'player') => {
    if (!card) return false;
    if (battleInProgressRef.current) return false;
    if (turnSide !== side) return false;
    if (phase?.toLowerCase() !== 'main') return false;
    if (card.state === 'rested') return false;
    return true;
  }, [turnSide, phase]);

  const canLeaderAttack = useCallback((side = 'player') => {
    if (battleInProgressRef.current) return false;
    if (turnSide !== side) return false;
    if (phase?.toLowerCase() !== 'main') return false;
    const leader = areas?.[side]?.middle?.leader?.[0];
    if (!leader || leader.state === 'rested') return false;
    return true;
  }, [turnSide, phase, areas]);

  const _runBattle = useCallback(async (attackerInstanceId, targetInstanceId, attackingSide, opts = {}) => {
    if (battleInProgressRef.current) {
      appendLog?.('[Battle] Battle already in progress');
      return null;
    }
    if (!areas) {
      appendLog?.('[Battle] No areas state available');
      return null;
    }
    battleInProgressRef.current = true;
    setBattle?.({ step: 'attacking', attackerInstanceId, targetInstanceId });

    try {
      appendLog?.(`[Battle] Starting attack: ${attackerInstanceId} -> ${targetInstanceId}`);

      // Use BattleHelpers.runBattle: it will dispatch via dispatchAction if provided or run local engine otherwise.
      const resultWrap = await runBattle(areas, attackerInstanceId, targetInstanceId, {
        turnSide,
        turnNumber,
        phase,
        appendLog,
        // Optionally, if the caller passes dispatchAction in opts, runBattle will forward:
        dispatchAction: opts.dispatchAction
      });

      if (!resultWrap) {
        appendLog?.('[Battle] No result from runBattle');
        return null;
      }

      if (resultWrap.success) {
        // If runBattle provided newAreas (local flow or host returned state), update UI
        if (resultWrap.newAreas) {
          setAreas?.(resultWrap.newAreas);
        } else if (resultWrap.result && resultWrap.result.gameState) {
          // If host returned engine gameState in result, convert and set
          const newAreas = convertGameStateToAreas(resultWrap.result.gameState);
          setAreas?.(newAreas);
        }

        const res = resultWrap.result || {};
        const attackerName = res.attackerName || attackerInstanceId;
        const defenderName = res.defenderName || targetInstanceId;
        appendLog?.(`[Battle] ${attackerName} (${res.attackerPower}) vs ${defenderName} (${res.defenderPower})`);

        if (res.blockedBy) appendLog?.(`[Battle] Blocked by: ${res.blockedBy.printedName || res.blockedBy.instanceId}`);
        if (res.defenderKOd) appendLog?.(`[Battle] ${defenderName} was K.O.'d`);
        if (res.leaderDamage) appendLog?.(`[Battle] Leader took ${res.leaderDamage} damage`);
        if (res.defeat) appendLog?.(`[Battle] Game Over - ${res.defeat.loser} lost!`);

        return res;
      } else {
        appendLog?.(`[Battle] Failed: ${resultWrap.error || (resultWrap.result && resultWrap.result.error) || 'Unknown'}`);
        return resultWrap.result || resultWrap;
      }
    } catch (e) {
      appendLog?.(`[Battle] Error: ${e?.message || e}`);
      return { success: false, error: String(e) };
    } finally {
      battleInProgressRef.current = false;
      setBattle?.(null);
      setCurrentAttack?.(null);
      setBattleArrow?.(null);
    }
  }, [areas, setAreas, turnSide, turnNumber, phase, appendLog, setBattle, setCurrentAttack, setBattleArrow]);

  const beginAttackForLeader = useCallback(async (leaderCard, attackingSide = 'player', targetInfo = null, opts = {}) => {
    const attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'middle', 'leader', 0);
    if (!attackerInstanceId) {
      appendLog?.('[Battle] Could not find leader instance ID');
      return;
    }
    let targetInstanceId = targetInfo?.instanceId;
    if (!targetInstanceId) {
      const oppSide = attackingSide === 'player' ? 'opponent' : 'player';
      targetInstanceId = getInstanceIdFromAreas(areas, oppSide, 'middle', 'leader', 0);
    }
    if (!targetInstanceId) {
      appendLog?.('[Battle] Could not find target instance ID');
      return;
    }
    await _runBattle(attackerInstanceId, targetInstanceId, attackingSide, opts);
  }, [areas, appendLog, _runBattle]);

  const beginAttackForCard = useCallback(async (card, attackingSide, cardIndex, isLeader = false, targetInfo = null, opts = {}) => {
    let attackerInstanceId;
    if (isLeader) attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'middle', 'leader', 0);
    else attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'char', null, cardIndex);

    if (!attackerInstanceId) {
      appendLog?.('[Battle] Could not find attacker instance ID');
      return;
    }

    let targetInstanceId = targetInfo?.instanceId;
    if (!targetInstanceId) {
      const oppSide = attackingSide === 'player' ? 'opponent' : 'player';
      targetInstanceId = getInstanceIdFromAreas(areas, oppSide, 'middle', 'leader', 0);
    }
    if (!targetInstanceId) {
      appendLog?.('[Battle] Could not find target instance ID');
      return;
    }

    await _runBattle(attackerInstanceId, targetInstanceId, attackingSide, opts);
  }, [areas, appendLog, _runBattle]);

  const applyBlocker = useCallback((blockerInfo) => {
    appendLog?.('[Battle] Blocker selection is handled via prompt dialog (engine)');
  }, [appendLog]);

  const skipBlock = useCallback(() => {
    appendLog?.('[Battle] Skip block is handled via prompt dialog');
  }, [appendLog]);

  const addCounterFromHand = useCallback((cardIndex) => {
    appendLog?.('[Battle] Counter selection is handled via prompt dialog');
  }, [appendLog]);

  const playCounterEventFromHand = useCallback((cardIndex) => {
    appendLog?.('[Battle] Event counter is handled via prompt dialog');
  }, [appendLog]);

  const endCounterStep = useCallback(() => {
    appendLog?.('[Battle] Counter step ends via prompt dialog');
  }, [appendLog]);

  const resolveDefense = useCallback(() => {
    appendLog?.('[Battle] Defense resolution is automatic via engine');
  }, [appendLog]);

  const getBattleStatus = useCallback(() => {
    if (!battle) return null;
    return {
      attackerPower: battle.attackerPower || 0,
      defenderPower: battle.defenderPower || 0,
      step: battle.step || 'unknown',
      attackerInstanceId: battle.attackerInstanceId,
      targetInstanceId: battle.targetInstanceId
    };
  }, [battle]);

  const getAttackerPower = useCallback(() => {
    if (!battle?.attackerInstanceId || !areas) return 0;
    try {
      const gameState = convertAreasToGameState(areas, { turnSide, turnNumber, phase });
      return engine.getTotalPower(gameState, battle.attackerInstanceId, { isOwnerTurn: true });
    } catch (e) {
      return 0;
    }
  }, [battle, areas, turnSide, turnNumber, phase]);

  const getDefenderPower = useCallback(() => {
    if (!battle?.targetInstanceId || !areas) return 0;
    try {
      const gameState = convertAreasToGameState(areas, { turnSide, turnNumber, phase });
      return engine.getTotalPower(gameState, battle.targetInstanceId, { isOwnerTurn: false });
    } catch (e) {
      return 0;
    }
  }, [battle, areas, turnSide, turnNumber, phase]);

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
    resolveDefense,
    getBattleStatus,
    getAttackerPower,
    getDefenderPower
  };
}
