/**
 * Battle.jsx
 * 
 * Battle system integration with the engine.
 * Provides hooks that call engine.conductBattle and manage battle state/UI sync.
 */
import { useCallback, useRef } from 'react';
import engine from '../../engine/index.js';
import { 
  convertAreasToGameState, 
  convertGameStateToAreas, 
  getInstanceIdFromAreas 
} from './hooks/engineAdapter.js';

/**
 * useBattleSystem - Hook for battle mechanics via engine integration.
 * 
 * Calls engine.conductBattle for attack resolution, which handles:
 * - Blocker step (prompts for blocker selection)
 * - Counter step (prompts for counter card selection)
 * - Damage resolution and K.O. handling
 * 
 * The engine emits prompts via engine.emit('prompt'), which are handled
 * by PromptProvider in the component tree.
 */
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
  // ... other params
}) {
  // Track ongoing battles to prevent concurrent attacks
  const battleInProgressRef = useRef(false);

  // Step helpers
  const isBattleStep = useCallback((step) => battle?.step === step, [battle]);

  // Attack permissions
  const canCharacterAttack = useCallback((card, side = 'player') => {
    if (!card) return false;
    if (battleInProgressRef.current) return false;
    if (turnSide !== side) return false;
    if (phase?.toLowerCase() !== 'main') return false;
    // Character must be active (not rested)
    if (card.state === 'rested') return false;
    return true;
  }, [turnSide, phase]);

  const canLeaderAttack = useCallback((side = 'player') => {
    if (battleInProgressRef.current) return false;
    if (turnSide !== side) return false;
    if (phase?.toLowerCase() !== 'main') return false;
    // Check leader is active
    const leader = areas?.[side]?.middle?.leader?.[0];
    if (!leader || leader.state === 'rested') return false;
    return true;
  }, [turnSide, phase, areas]);

  /**
   * _runBattle - Internal helper to execute battle via engine
   */
  const _runBattle = useCallback(async (attackerInstanceId, targetInstanceId, attackingSide) => {
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
      // Convert UI areas to engine gameState
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      appendLog?.(`[Battle] Starting attack: ${attackerInstanceId} -> ${targetInstanceId}`);

      // Execute battle through engine (handles blocker/counter prompts internally)
      const result = await engine.conductBattle(gameState, attackerInstanceId, targetInstanceId);

      if (result.success) {
        // Convert mutated gameState back to UI areas
        const newAreas = convertGameStateToAreas(gameState);
        setAreas?.(newAreas);

        // Log battle result
        const attackerName = result.attackerName || attackerInstanceId;
        const defenderName = result.defenderName || targetInstanceId;
        appendLog?.(`[Battle] ${attackerName} (${result.attackerPower}) vs ${defenderName} (${result.defenderPower})`);

        if (result.blockedBy) {
          appendLog?.(`[Battle] Blocked by: ${result.blockedBy.printedName || result.blockedBy.instanceId}`);
        }
        if (result.defenderKOd) {
          appendLog?.(`[Battle] ${defenderName} was K.O.'d`);
        }
        if (result.leaderDamage) {
          appendLog?.(`[Battle] Leader took ${result.leaderDamage} damage`);
        }
        if (result.defeat) {
          appendLog?.(`[Battle] Game Over - ${result.defeat.loser} lost!`);
        }
      } else {
        appendLog?.(`[Battle] Failed: ${result.error || 'Unknown error'}`);
      }

      return result;
    } catch (e) {
      appendLog?.(`[Battle] Error: ${e.message || e}`);
      return { success: false, error: String(e) };
    } finally {
      battleInProgressRef.current = false;
      setBattle?.(null);
      setCurrentAttack?.(null);
      setBattleArrow?.(null);
    }
  }, [areas, setAreas, turnSide, turnNumber, phase, appendLog, setBattle, setCurrentAttack, setBattleArrow]);

  /**
   * beginAttackForLeader - Start an attack with the leader
   */
  const beginAttackForLeader = useCallback(async (leaderCard, attackingSide = 'player', targetInfo = null) => {
    const attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'middle', 'leader', 0);
    if (!attackerInstanceId) {
      appendLog?.('[Battle] Could not find leader instance ID');
      return;
    }

    // Target: if not provided, default to opponent leader
    let targetInstanceId = targetInfo?.instanceId;
    if (!targetInstanceId) {
      const oppSide = attackingSide === 'player' ? 'opponent' : 'player';
      targetInstanceId = getInstanceIdFromAreas(areas, oppSide, 'middle', 'leader', 0);
    }

    if (!targetInstanceId) {
      appendLog?.('[Battle] Could not find target instance ID');
      return;
    }

    await _runBattle(attackerInstanceId, targetInstanceId, attackingSide);
  }, [areas, appendLog, _runBattle]);

  /**
   * beginAttackForCard - Start an attack with a character
   */
  const beginAttackForCard = useCallback(async (card, attackingSide, cardIndex, isLeader = false, targetInfo = null) => {
    let attackerInstanceId;
    
    if (isLeader) {
      attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'middle', 'leader', 0);
    } else {
      attackerInstanceId = getInstanceIdFromAreas(areas, attackingSide, 'char', null, cardIndex);
    }

    if (!attackerInstanceId) {
      appendLog?.('[Battle] Could not find attacker instance ID');
      return;
    }

    // Determine target
    let targetInstanceId = targetInfo?.instanceId;
    if (!targetInstanceId) {
      // Default to opponent leader if no target specified
      const oppSide = attackingSide === 'player' ? 'opponent' : 'player';
      targetInstanceId = getInstanceIdFromAreas(areas, oppSide, 'middle', 'leader', 0);
    }

    if (!targetInstanceId) {
      appendLog?.('[Battle] Could not find target instance ID');
      return;
    }

    await _runBattle(attackerInstanceId, targetInstanceId, attackingSide);
  }, [areas, appendLog, _runBattle]);

  // Block/counter - these are now handled via engine prompts during conductBattle
  // These stubs remain for UI compatibility but the actual logic runs in the engine
  const applyBlocker = useCallback((blockerInfo) => {
    // Blocker selection is handled via engine.prompt('blocker') during conductBattle
    appendLog?.('[Battle] Blocker selection is handled via prompt dialog');
  }, [appendLog]);

  const skipBlock = useCallback(() => {
    // Skip block is handled via the prompt response
    appendLog?.('[Battle] Skip block is handled via prompt dialog');
  }, [appendLog]);

  const addCounterFromHand = useCallback((cardIndex) => {
    // Counter selection is handled via engine.prompt('counter') during conductBattle
    appendLog?.('[Battle] Counter selection is handled via prompt dialog');
  }, [appendLog]);

  const playCounterEventFromHand = useCallback((cardIndex) => {
    // Event counter is handled via engine.prompt('counter') during conductBattle
    appendLog?.('[Battle] Event counter is handled via prompt dialog');
  }, [appendLog]);

  const endCounterStep = useCallback(() => {
    // Counter step ends when prompt is resolved
    appendLog?.('[Battle] Counter step ends via prompt dialog');
  }, [appendLog]);

  const resolveDefense = useCallback(() => {
    // Defense resolution happens automatically after prompts
    appendLog?.('[Battle] Defense resolution is automatic via engine');
  }, [appendLog]);

  // Battle status helpers
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
    // Use engine to compute power if we have a gameState
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
