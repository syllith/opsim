/**
 * Don.jsx
 * 
 * DON!! card management placeholder.
 * Core DON mechanics (attach, detach, power bonus) will be in the engine.
 * This file provides stub hooks and constants for UI compatibility.
 */
import { useCallback, useState } from 'react';
import _ from 'lodash';
import { getHandCostRoot, getSideRoot } from './hooks/areasUtils';

// DON!! card constants - used by UI for rendering
export const DON_FRONT_CONSTANT = {
  id: 'DON',
  full: '/api/cards/assets/Don/Don.png',
  thumb: '/api/cards/assets/Don/Don.png'
};

export const DON_BACK_CONSTANT = {
  id: 'DON_BACK',
  full: '/api/cards/assets/Card%20Backs/CardBackDon.png',
  thumb: '/api/cards/assets/Card%20Backs/CardBackDon.png'
};

/**
 * Stub DON management hook.
 * Preserves essential DON deck initialization for game setup.
 * Other operations are stubs pending engine implementation.
 */
export const useDonManagement = ({
  areas,
  setAreas,
  mutateAreas,
  turnSide,
  phase,
  battle,
  appendLog,
  canPerformGameAction
}) => {
  // Safe mutation helper
  const mutateAreasSafe = useCallback((recipeFn, { onErrorLabel } = {}) => {
    if (typeof mutateAreas === 'function') {
      mutateAreas(recipeFn, { onErrorLabel });
      return;
    }
    setAreas((prev) => {
      const next = _.cloneDeep(prev);
      try {
        recipeFn(next, prev);
        return next;
      } catch (error) {
        console.warn(onErrorLabel || '[mutateAreasSafe] Failed', error);
        return prev;
      }
    });
  }, [mutateAreas, setAreas]);

  // DON giving mode state (UI state, kept for panel interaction)
  const [donGivingMode, setDonGivingMode] = useState({
    active: false,
    side: null,
    selectedDonIndex: null
  });

  // Get DON deck array for a side
  const getDonDeckArray = useCallback((side) => {
    return side === 'player'
      ? (areas?.player?.bottom?.don || [])
      : (areas?.opponent?.top?.don || []);
  }, [areas]);

  // Check if side has enough active DON to pay a cost
  const hasEnoughDonFor = useCallback((side, cost) => {
    if (!cost || cost <= 0) return true;
    const costLoc = getHandCostRoot(areas, side);
    const pool = costLoc?.cost || [];
    const activeCount = pool.filter(d => d?.id === 'DON' && !d.rested).length;
    return activeCount >= cost;
  }, [areas]);

  // Get DON power bonus for a card (count attached DON * 1000)
  const getDonPowerBonus = useCallback((side, section, keyName, index) => {
    try {
      const sideLoc = getSideRoot(areas, side);
      let attachedDon = [];

      if (section === 'middle' && keyName === 'leader') {
        attachedDon = sideLoc?.middle?.leaderDon || [];
      } else if (section === 'char' && keyName === 'char') {
        attachedDon = sideLoc?.charDon?.[index] || [];
      }

      return attachedDon.length * 1000;
    } catch {
      return 0;
    }
  }, [areas]);

  // Initialize DON decks (10 each) - essential for game setup
  const initializeDonDecks = useCallback(() => {
    mutateAreasSafe((next) => {
      next.player.bottom.don = Array.from(
        { length: 10 },
        () => ({ ...DON_BACK_CONSTANT })
      );
      next.opponent.top.don = Array.from(
        { length: 10 },
        () => ({ ...DON_BACK_CONSTANT })
      );
      next.player.bottom.cost = [];
      next.opponent.top.cost = [];
    }, { onErrorLabel: '[initializeDonDecks] Failed' });
  }, [mutateAreasSafe]);

  // Stub: Start DON giving mode
  const startDonGiving = useCallback((side, donIndex) => {
    appendLog?.('[DON] DON giving not yet implemented (engine rewrite in progress)');
    setDonGivingMode({ active: false, side: null, selectedDonIndex: null });
  }, [appendLog]);

  // Cancel DON giving mode
  const cancelDonGiving = useCallback(() => {
    setDonGivingMode({ active: false, side: null, selectedDonIndex: null });
  }, []);

  // Stub: Give DON to card
  const giveDonToCard = useCallback(() => {
    appendLog?.('[DON] DON giving not yet implemented');
    return false;
  }, [appendLog]);

  // Stub: Move DON from cost to card
  const moveDonFromCostToCard = useCallback(() => {
    appendLog?.('[DON] DON movement not yet implemented');
    return false;
  }, [appendLog]);

  // DON phase gain - basic implementation for game flow
  const donPhaseGain = useCallback((side, amount) => {
    let gained = 0;
    mutateAreasSafe((next) => {
      const handCostLoc = getHandCostRoot(next, side);
      const donDeckArr = handCostLoc?.don || [];
      const costArr = handCostLoc?.cost || [];

      const toGain = Math.min(amount, donDeckArr.length);
      for (let i = 0; i < toGain; i++) {
        donDeckArr.pop();
        costArr.push({ ...DON_FRONT_CONSTANT, rested: false });
        gained++;
      }

      handCostLoc.don = donDeckArr;
      handCostLoc.cost = costArr;
    }, { onErrorLabel: '[donPhaseGain] Failed' });

    return gained;
  }, [mutateAreasSafe]);

  // Stub: Return all given DON
  const returnAllGivenDon = useCallback((side) => {
    // TODO: Implement via engine
    appendLog?.(`[DON] DON return for ${side} not yet implemented`);
  }, [appendLog]);

  // Stub: Return DON from specific card
  const returnDonFromCard = useCallback(() => {
    appendLog?.('[DON] DON return not yet implemented');
    return 0;
  }, [appendLog]);

  // Stub: Return DON to DON deck
  const returnDonToDonDeckFromCard = useCallback(() => {
    appendLog?.('[DON] DON deck return not yet implemented');
    return 0;
  }, [appendLog]);

  // Stub: Detach DON from card
  const detachDonFromCard = useCallback(() => {
    appendLog?.('[DON] DON detach not yet implemented');
    return 0;
  }, [appendLog]);

  return {
    donGivingMode,
    startDonGiving,
    cancelDonGiving,
    giveDonToCard,
    moveDonFromCostToCard,
    donPhaseGain,
    returnAllGivenDon,
    getDonPowerBonus,
    returnDonFromCard,
    returnDonToDonDeckFromCard,
    detachDonFromCard,
    initializeDonDecks,
    getDonDeckArray,
    hasEnoughDonFor
  };
};
