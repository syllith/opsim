/**
 * Don.jsx
 * 
 * DON!! card management with engine integration.
 * Provides hooks that call engine actions for DON attach/detach/give operations.
 */
import { useCallback, useState } from 'react';
import _ from 'lodash';
import { getHandCostRoot, getSideRoot } from './hooks/areasUtils';
import engine from '../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas, getInstanceIdFromAreas } from './hooks/engineAdapter.js';

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
 * DON management hook with engine integration.
 * Preserves essential DON deck initialization for game setup.
 * Operations delegate to engine for state mutations.
 */
export const useDonManagement = ({
  areas,
  setAreas,
  mutateAreas,
  turnSide,
  turnNumber = 1,
  phase,
  battle,
  appendLog,
  canPerformGameAction
}) => {
  // Safe mutation helper (for non-engine operations like initialization)
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

  // DON giving mode state (UI state for panel interaction)
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

  // Start DON giving mode - UI enters selection mode
  const startDonGiving = useCallback((side, donIndex) => {
    if (!canPerformGameAction?.()) {
      appendLog?.('[DON] Cannot give DON right now');
      return;
    }
    setDonGivingMode({ active: true, side, selectedDonIndex: donIndex });
    appendLog?.(`[DON] Select a target for DON`);
  }, [appendLog, canPerformGameAction]);

  // Cancel DON giving mode
  const cancelDonGiving = useCallback(() => {
    setDonGivingMode({ active: false, side: null, selectedDonIndex: null });
  }, []);

  /**
   * Give DON to a card via engine
   * @param {string} targetSide - Target card's side
   * @param {string} targetSection - Target section ('char', 'middle')
   * @param {string} targetKeyName - Target key ('leader', null for char)
   * @param {number} targetIndex - Target index in array
   * @param {number} count - Number of DON to give (default 1)
   */
  const giveDonToCard = useCallback((targetSide, targetSection, targetKeyName, targetIndex, count = 1) => {
    if (!areas) {
      appendLog?.('[DON] No game state available');
      return false;
    }

    const side = donGivingMode.side || turnSide;
    
    // Get target instance ID
    const targetInstanceId = getInstanceIdFromAreas(areas, targetSide, targetSection, targetKeyName, targetIndex);
    if (!targetInstanceId) {
      appendLog?.('[DON] Could not find target card');
      cancelDonGiving();
      return false;
    }

    try {
      // Convert UI state to engine state
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      // Execute giveDon action through engine
      const result = engine.executeAction(gameState, {
        type: 'giveDon',
        count,
        target: targetInstanceId,
        side
      }, { activePlayer: side });

      if (result.success) {
        // Convert back and update UI
        const newAreas = convertGameStateToAreas(gameState);
        setAreas(newAreas);
        appendLog?.(`[DON] Gave ${result.moved} DON to card`);
        cancelDonGiving();
        return true;
      } else {
        appendLog?.(`[DON] Failed to give DON: ${result.error}`);
        cancelDonGiving();
        return false;
      }
    } catch (e) {
      appendLog?.(`[DON] Error: ${e.message}`);
      cancelDonGiving();
      return false;
    }
  }, [areas, setAreas, donGivingMode.side, turnSide, turnNumber, phase, appendLog, cancelDonGiving]);

  /**
   * Move DON from cost area to a specific card (attach DON)
   */
  const moveDonFromCostToCard = useCallback((targetSide, targetSection, targetKeyName, targetIndex, count = 1) => {
    return giveDonToCard(targetSide, targetSection, targetKeyName, targetIndex, count);
  }, [giveDonToCard]);

  // DON phase gain - move DON from DON deck to cost area
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

    if (gained > 0) {
      appendLog?.(`[DON] ${side} gained ${gained} DON`);
    }
    return gained;
  }, [mutateAreasSafe, appendLog]);

  /**
   * Return all given DON from all cards back to cost area
   */
  const returnAllGivenDon = useCallback((side) => {
    if (!areas) return;
    
    try {
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      // Find all cards with attached DON for this side
      const player = gameState.players?.[side];
      if (!player) return;

      let totalReturned = 0;

      // Check leader
      if (player.leader?.attachedDons?.length > 0) {
        const result = engine.executeAction(gameState, {
          type: 'returnDon',
          selector: { instanceId: player.leader.instanceId },
          count: player.leader.attachedDons.length,
          side
        }, { activePlayer: side });
        if (result.success) totalReturned += result.moved;
      }

      // Check characters
      if (Array.isArray(player.char)) {
        for (const char of player.char) {
          if (char?.attachedDons?.length > 0) {
            const result = engine.executeAction(gameState, {
              type: 'returnDon',
              selector: { instanceId: char.instanceId },
              count: char.attachedDons.length,
              side
            }, { activePlayer: side });
            if (result.success) totalReturned += result.moved;
          }
        }
      }

      if (totalReturned > 0) {
        const newAreas = convertGameStateToAreas(gameState);
        setAreas(newAreas);
        appendLog?.(`[DON] Returned ${totalReturned} DON for ${side}`);
      }
    } catch (e) {
      appendLog?.(`[DON] Error returning DON: ${e.message}`);
    }
  }, [areas, setAreas, turnSide, turnNumber, phase, appendLog]);

  /**
   * Return DON from a specific card back to cost area
   */
  const returnDonFromCard = useCallback((cardSide, cardSection, cardKeyName, cardIndex, count = 1) => {
    if (!areas) return 0;

    const instanceId = getInstanceIdFromAreas(areas, cardSide, cardSection, cardKeyName, cardIndex);
    if (!instanceId) {
      appendLog?.('[DON] Could not find card to return DON from');
      return 0;
    }

    try {
      const gameState = convertAreasToGameState(areas, {
        turnSide,
        turnNumber,
        phase: phase?.toLowerCase() || 'main'
      });

      const result = engine.executeAction(gameState, {
        type: 'returnDon',
        selector: { instanceId },
        count,
        side: cardSide
      }, { activePlayer: cardSide });

      if (result.success && result.moved > 0) {
        const newAreas = convertGameStateToAreas(gameState);
        setAreas(newAreas);
        appendLog?.(`[DON] Returned ${result.moved} DON from card`);
        return result.moved;
      }
      return 0;
    } catch (e) {
      appendLog?.(`[DON] Error: ${e.message}`);
      return 0;
    }
  }, [areas, setAreas, turnSide, turnNumber, phase, appendLog]);

  /**
   * Return DON from card to DON deck (not cost area)
   */
  const returnDonToDonDeckFromCard = useCallback((cardSide, cardSection, cardKeyName, cardIndex, count = 1) => {
    // For now, this behaves the same as returnDonFromCard
    // The engine's returnDon action handles the destination
    return returnDonFromCard(cardSide, cardSection, cardKeyName, cardIndex, count);
  }, [returnDonFromCard]);

  /**
   * Detach DON from a card (alias for returnDonFromCard)
   */
  const detachDonFromCard = useCallback((cardSide, cardSection, cardKeyName, cardIndex, count = 1) => {
    return returnDonFromCard(cardSide, cardSection, cardKeyName, cardIndex, count);
  }, [returnDonFromCard]);

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
