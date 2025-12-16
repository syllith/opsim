// src/comps/Home/ActionHelpers.js
/**
 * ActionHelpers.js
 *
 * Pure JS helpers used by Actions.jsx to activate abilities.
 * - activateAbilityCore(...) is the main exported function tested by unit tests.
 *
 * This file intentionally avoids React/JSX so tests can import it with Node.
 */

import { convertAreasToGameState, convertGameStateToAreas } from './hooks/engineAdapter.js';

/**
 * Basic timing mapping helpers (mirrors Actions.jsx logic)
 */
export function isActivatable(ability) {
  const timing = ability?.timing;
  return timing === 'activateMain' || timing === 'main';
}

export function timingMatchesPhase(ability, phase) {
  const timing = ability?.timing;
  const phaseLower = (phase || '').toLowerCase();
  if (timing === 'activateMain' || timing === 'main') {
    return phaseLower === 'main';
  }
  if (timing === 'counter') {
    return phaseLower === 'counter';
  }
  return false;
}

/**
 * Helper: get a card object from UI areas given a cardLocation object
 * cardLocation: { side, section, keyName, index }
 */
export function getCardFromAreas(areas = {}, side, section, keyName, index) {
  if (!areas || !side || !section) return null;
  const sideRoot = areas[side];
  if (!sideRoot) return null;

  // Common mappings used in UI
  if (section === 'char') {
    return (Array.isArray(sideRoot.char) ? sideRoot.char[index] : null) || null;
  }
  if (section === 'middle') {
    if (keyName === 'leader') return (Array.isArray(sideRoot.middle?.leader) ? sideRoot.middle.leader[0] : null) || null;
    if (keyName === 'stage') return (Array.isArray(sideRoot.middle?.stage) ? sideRoot.middle.stage[0] : null) || null;
    // default: maybe deck
    if (keyName === 'deck') return null; // not a single card
  }
  if (section === 'bottom') {
    if (keyName === 'hand') return (Array.isArray(sideRoot.bottom?.hand) ? sideRoot.bottom.hand[index] : null) || null;
    if (keyName === 'cost') return (Array.isArray(sideRoot.bottom?.cost) ? sideRoot.bottom.cost[index] : null) || null;
  }
  if (section === 'top') {
    if (keyName === 'hand') return (Array.isArray(sideRoot.top?.hand) ? sideRoot.top.hand[index] : null) || null;
    if (keyName === 'don') return (Array.isArray(sideRoot.top?.don) ? sideRoot.top.don[index] : null) || null;
  }

  // Fallback naive searches
  try {
    if (Array.isArray(sideRoot.char) && sideRoot.char[index]) return sideRoot.char[index];
    if (Array.isArray(sideRoot.middle?.leader) && sideRoot.middle.leader[0]) return sideRoot.middle.leader[0];
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Check DON requirement for an ability using UI areas + cardLocation
 * Returns true if either ability has no DON requirement or the card has enough givenDon/don
 */
export function checkDonRequirement(ability, areas, cardLocation) {
  if (!ability?.condition?.don) return true;
  const requiredDon = ability.condition.don;
  if (!areas || !cardLocation) return false;

  const { side, section, keyName, index } = cardLocation;
  const card = getCardFromAreas(areas, side, section, keyName, index);
  if (!card) return false;
  const attachedDon = Number(card.givenDon ?? card.don ?? 0);
  return attachedDon >= requiredDon;
}

/**
 * Activate ability core logic
 *
 * params:
 *  - ability
 *  - abilityIndex
 *  - instanceId
 *  - isOnField
 *  - isYourTurn
 *  - phase
 *  - areas
 *  - setAreas (optional) -- used when falling back to direct engine.executeAction flow
 *  - turnSide
 *  - turnNumber
 *  - cardLocation { side, section, keyName, index }
 *  - appendLog (optional)
 *  - dispatchAction (optional) - function(action, ctx) -> Promise<{success, ...}>
 *  - engine (optional) - engine module fallback (must provide executeAction)
 *
 * Returns: Promise resolving to result object: { success: boolean, error?, newAreas? }
 */
export async function activateAbilityCore(params = {}) {
  const {
    ability,
    abilityIndex,
    instanceId,
    isOnField,
    isYourTurn,
    phase,
    areas,
    setAreas,
    turnSide,
    turnNumber = 1,
    cardLocation,
    appendLog,
    dispatchAction = null,
    engine = null
  } = params;

  if (!instanceId) {
    appendLog?.('[Ability] Cannot activate: card instance not found');
    return { success: false, error: 'missing instanceId' };
  }
  if (!isOnField) {
    appendLog?.('[Ability] Cannot activate: card is not on field');
    return { success: false, error: 'not on field' };
  }
  if (!isYourTurn) {
    appendLog?.('[Ability] Cannot activate: not your turn');
    return { success: false, error: 'not your turn' };
  }
  if (!timingMatchesPhase(ability, phase)) {
    appendLog?.('[Ability] Cannot activate: wrong phase');
    return { success: false, error: 'wrong phase' };
  }
  if (!checkDonRequirement(ability, areas, cardLocation)) {
    appendLog?.(`[Ability] Cannot activate: insufficient DON attached (need ${ability.condition?.don})`);
    return { success: false, error: 'insufficient don' };
  }

  const actions = ability.actions || [];
  if (actions.length === 0) {
    appendLog?.(`[Ability] Activated: ${ability.description || 'Unknown ability'}`);
    return { success: true };
  }

  // If dispatchAction provided, forward each ability action to it (multiplayer guest => forward)
  if (typeof dispatchAction === 'function') {
    for (const action of actions) {
      const actionWithContext = {
        ...action,
        sourceInstanceId: instanceId,
        owner: cardLocation?.side || turnSide
      };
      try {
        const res = await dispatchAction(actionWithContext, {
          activePlayer: turnSide,
          source: instanceId,
          abilityIndex
        });
        if (!res || res.success === false) {
          appendLog?.(`[Ability] Action failed: ${res?.error || 'unknown error'}`);
          return { success: false, error: res?.error || 'action failed' };
        }
      } catch (e) {
        appendLog?.(`[Ability] Action exception: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
    // If dispatchAction succeeded for all actions, we assume engine authoritative state will be applied externally
    appendLog?.(`[Ability] Activated: ${ability.description || ability.name || 'ability'}`);
    return { success: true };
  }

  // Fallback behavior: use engine.executeAction directly with a transient gameState derived from areas
  if (!engine || typeof engine.executeAction !== 'function') {
    const err = 'No dispatchAction or engine.executeAction available';
    appendLog?.(`[Ability] ${err}`);
    return { success: false, error: err };
  }

  try {
    // Convert areas -> gameState, let engine mutate it via executeAction
    const gameState = convertAreasToGameState(areas || {}, {
      turnSide: turnSide || 'player',
      turnNumber,
      phase: (phase || 'main')
    });

    let allSuccess = true;
    for (const action of actions) {
      const actionWithContext = {
        ...action,
        sourceInstanceId: instanceId,
        owner: cardLocation?.side || turnSide
      };

      const res = engine.executeAction(gameState, actionWithContext, {
        activePlayer: turnSide,
        source: instanceId,
        abilityIndex
      });

      if (!res || !res.success) {
        appendLog?.(`[Ability] Action failed: ${res?.error || 'unknown error'}`);
        allSuccess = false;
        return { success: false, error: res?.error || 'engine action failed' };
      }
    }

    if (allSuccess) {
      const newAreas = convertGameStateToAreas(gameState);
      if (typeof setAreas === 'function') setAreas(newAreas);
      appendLog?.(`[Ability] Activated: ${ability.description || ability.name || 'ability'}`);
      return { success: true, newAreas };
    }
    return { success: false, error: 'unknown failure' };
  } catch (e) {
    appendLog?.(`[Ability] Error: ${e.message}`);
    return { success: false, error: e.message };
  }
}
