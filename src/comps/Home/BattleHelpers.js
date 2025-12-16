// src/comps/Home/BattleHelpers.js
/**
 * BattleHelpers - pure JS helpers for running battles via engine
 *
 * Exports:
 *  - runLocalBattle(areas, attackerInstanceId, targetInstanceId, opts)
 *      -> runs engine.conductBattle locally (host / single-player) and returns { success, result, newAreas }
 *
 *  - runBattle(areas, attackerInstanceId, targetInstanceId, opts)
 *      -> if opts.dispatchAction present, calls dispatchAction({ type: 'conductBattle', attackerInstanceId, targetInstanceId })
 *         otherwise falls back to runLocalBattle.
 *
 * Note: players using multiplayer should wire dispatchAction so guest requests reach host and host runs engine.conductBattle.
 */
import engine from '../../engine/index.js';
import { convertAreasToGameState, convertGameStateToAreas } from './hooks/engineAdapter.js';

/**
 * runLocalBattle
 *  - Converts UI areas -> engine gameState
 *  - Calls engine.conductBattle(gameState, attackerInstanceId, targetInstanceId)
 *  - If success, converts mutated gameState -> UI areas and returns them
 *
 * opts:
 *  - turnSide, turnNumber, phase, appendLog
 */
export async function runLocalBattle(areas, attackerInstanceId, targetInstanceId, opts = {}) {
  const {
    turnSide = 'player',
    turnNumber = 1,
    phase = 'Main',
    appendLog
  } = opts;

  if (!areas) {
    return { success: false, error: 'missing areas' };
  }
  if (!attackerInstanceId || !targetInstanceId) {
    return { success: false, error: 'missing attacker or target instanceId' };
  }

  try {
    const gameState = convertAreasToGameState(areas, {
      turnSide,
      turnNumber,
      phase: phase?.toLowerCase() || 'main'
    });

    appendLog?.(`[BattleHelpers] Starting local battle: ${attackerInstanceId} -> ${targetInstanceId}`);

    // engine.conductBattle is async (may prompt), engine mutates gameState in-place
    const result = await engine.conductBattle(gameState, attackerInstanceId, targetInstanceId);

    if (result && result.success) {
      const newAreas = convertGameStateToAreas(gameState);
      appendLog?.(`[BattleHelpers] Battle complete: ${attackerInstanceId} -> ${targetInstanceId}`);
      return { success: true, result, newAreas };
    }

    // Failure case
    return { success: false, result };
  } catch (e) {
    appendLog?.(`[BattleHelpers] Error conducting battle: ${e?.message || e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * runBattle
 *  - If dispatchAction provided, forwards the request to dispatchAction
 *    (useful for multiplayer guests where the host must run the battle).
 *  - Otherwise executes the local flow.
 *
 * The action sent to dispatchAction is:
 *   { type: 'conductBattle', attackerInstanceId, targetInstanceId }
 *
 * It's expected that the host (or server) will interpret this special action and call
 * engine.conductBattle accordingly and then broadcast the updated game state.
 */
export async function runBattle(areas, attackerInstanceId, targetInstanceId, opts = {}) {
  const { dispatchAction, appendLog } = opts;

  if (typeof dispatchAction === 'function') {
    appendLog?.('[BattleHelpers] Forwarding battle request via dispatchAction');
    try {
      const res = await dispatchAction({
        type: 'conductBattle',
        attackerInstanceId,
        targetInstanceId
      }, { meta: { via: 'BattleHelpers.runBattle' } });

      // We expect dispatchAction to either:
      // - return { forwarded: true } (in which case the host will broadcast game state later),
      // - or return a structure { success: true, result, gameState } or { success: true, newAreas }
      // If a gameState is returned, convert it; if newAreas returned, pass through.
      if (res && res.success) {
        if (res.gameState) {
          const newAreas = convertGameStateToAreas(res.gameState);
          return { success: true, result: res.result || null, newAreas };
        }
        if (res.newAreas) {
          return { success: true, result: res.result || null, newAreas: res.newAreas };
        }
        // If the host accepted and no state provided, just return the raw response
        return { success: true, result: res.result || null, forwarded: !!res.forwarded };
      } else {
        return { success: false, result: res };
      }
    } catch (e) {
      appendLog?.(`[BattleHelpers] Error forwarding battle: ${e?.message || e}`);
      return { success: false, error: String(e) };
    }
  }

  // No dispatchAction provided - run locally
  return runLocalBattle(areas, attackerInstanceId, targetInstanceId, opts);
}

export default {
  runLocalBattle,
  runBattle
};
