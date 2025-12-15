/**
 * Battle.jsx
 * 
 * Battle system placeholder.
 * The actual battle mechanics will be implemented in the engine.
 * This file provides stub hooks for UI compatibility during the transition.
 */
import { useCallback } from 'react';

/**
 * Stub battle system hook.
 * Returns no-op functions and default values.
 * TODO: Wire up to src/engine once battle system is implemented.
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
  // ... other params ignored for now
}) {
  // Step helpers - stubs
  const isBattleStep = useCallback((step) => battle?.step === step, [battle]);

  // Attack permissions - disabled until engine ready
  const canCharacterAttack = useCallback(() => {
    // TODO: Implement via engine
    return false;
  }, []);

  const canLeaderAttack = useCallback(() => {
    // TODO: Implement via engine
    return false;
  }, []);

  // Attack entry points - stubs
  const beginAttackForLeader = useCallback((leaderCard, attackingSide = 'player') => {
    appendLog?.('[Battle] Attack system not yet implemented (engine rewrite in progress)');
  }, [appendLog]);

  const beginAttackForCard = useCallback((card, attackingSide, cardIndex, isLeader = false) => {
    appendLog?.('[Battle] Attack system not yet implemented (engine rewrite in progress)');
  }, [appendLog]);

  // Block/counter stubs
  const applyBlocker = useCallback(() => {
    appendLog?.('[Battle] Blocker system not yet implemented');
  }, [appendLog]);

  const skipBlock = useCallback(() => {
    appendLog?.('[Battle] Skip block not yet implemented');
  }, [appendLog]);

  const addCounterFromHand = useCallback(() => {
    appendLog?.('[Battle] Counter system not yet implemented');
  }, [appendLog]);

  const playCounterEventFromHand = useCallback(() => {
    appendLog?.('[Battle] Counter events not yet implemented');
  }, [appendLog]);

  const endCounterStep = useCallback(() => {
    appendLog?.('[Battle] Counter step not yet implemented');
  }, [appendLog]);

  const resolveDefense = useCallback(() => {
    appendLog?.('[Battle] Defense resolution not yet implemented');
  }, [appendLog]);

  // Battle status helpers - stubs
  const getBattleStatus = useCallback(() => {
    if (!battle) return null;
    return {
      attackerPower: 0,
      defenderPower: 0,
      step: battle.step || 'unknown'
    };
  }, [battle]);

  const getAttackerPower = useCallback(() => 0, []);
  const getDefenderPower = useCallback(() => 0, []);

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
