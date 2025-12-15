'use strict';

/**
 * promptManager.js — Server-side prompt / choice manager
 *
 * Responsibilities:
 *  - requestChoice(gameState, playerId, choiceSpec, options) -> { promptId, promise }
 *      * Emits engine 'prompt' event with the prompt object so the UI/transport can deliver it.
 *      * Returns an object containing promptId and a promise that resolves with the player's selection.
 *  - submitChoice(promptId, playerId, selection) -> { success, reason?:string }
 *      * Called by transport / UI handlers to submit a player's choice.
 *  - cancelPrompt(promptId, reason) -> boolean
 *      * Cancel an outstanding prompt.
 *  - getPendingPrompts() -> debug list
 *
 * The prompt object emitted as engine.emit('prompt', { prompt }) is:
 *  {
 *    id, playerId, gameSnapshot, choiceSpec, createdAt, timeoutMs
 *  }
 *
 * The choiceSpec is opaque to the manager (UI decides how to render). It typically
 * follows schema:
 *  { type: 'select'|'number'|'confirm'|..., min, max, selector, message, modes, ... }
 *
 * NOTES:
 *  - This module depends on engine.emit to broadcast events. The UI (or server transport)
 *    should listen for 'prompt' and send the prompt to the player, and call submitChoice
 *    when the player responds.
 *  - For now we match prompt owner strictly by playerId. Later we can support administrator
 *    overrides, spectator controls, etc.
 */

import { emit as engineEmit, getGameStateSnapshot } from '../index.js';

const pendingPrompts = new Map();
let _counter = 0;

/**
 * _makePromptId()
 */
function _makePromptId() {
  const ts = Date.now();
  const id = `prompt-${ts}-${_counter++}`;
  return id;
}

/**
 * requestChoice(gameState, playerId, choiceSpec, options)
 *
 * options:
 *  - timeoutMs: number | null (ms) - auto-cancel if no response after this many ms.
 *  - debug: any
 *
 * Returns: { promptId, promise } where promise resolves to { selection } or rejects on timeout/cancel.
 */
export function requestChoice(gameState, playerId, choiceSpec = {}, options = {}) {
  if (!playerId) throw new Error('requestChoice requires playerId');

  const promptId = _makePromptId();
  const createdAt = Date.now();
  const timeoutMs = (options && Number.isFinite(options.timeoutMs)) ? options.timeoutMs : null;

  const prompt = {
    id: promptId,
    playerId,
    choiceSpec,
    createdAt,
    timeoutMs,
    debug: options.debug || null,
    // include a snapshot for the UI so it can render the state safely (server must still enforce)
    gameSnapshot: (typeof getGameStateSnapshot === 'function' && gameState) ? getGameStateSnapshot(gameState) : null
  };

  let timer = null;
  let resolved = false;

  const promise = new Promise((resolve, reject) => {
    pendingPrompts.set(promptId, {
      prompt,
      resolve: (sel) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        pendingPrompts.delete(promptId);
        resolve({ selection: sel, promptId });
      },
      reject: (err) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        pendingPrompts.delete(promptId);
        reject(err);
      },
      createdAt
    });

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        const pending = pendingPrompts.get(promptId);
        if (!pending) return;
        pendingPrompts.delete(promptId);
        reject(new Error(`Prompt ${promptId} timed out after ${timeoutMs}ms`));
        // emit an event so UI can remove pending prompt if necessary
        try {
          engineEmit('promptTimedOut', { promptId, playerId, choiceSpec, reason: 'timeout' });
        } catch (e) {
          // ignore emitter errors
        }
      }, timeoutMs);
    }
  });

  // Emit event so UI / transport layer can deliver this prompt to the given player.
  try {
    engineEmit('prompt', { prompt });
  } catch (e) {
    // if emit fails, cancel prompt immediately
    const pending = pendingPrompts.get(promptId);
    if (pending) {
      pendingPrompts.delete(promptId);
      pending.reject(new Error('Failed to emit prompt event'));
    }
  }

  return { promptId, promise };
}

/**
 * submitChoice(promptId, playerId, selection)
 *
 * Called by the server transport / UI when a player responds.
 * Returns { success:true } on accepted result; { success:false, reason } otherwise.
 */
export function submitChoice(promptId, playerId, selection) {
  if (!promptId) return { success: false, reason: 'missing promptId' };
  const pending = pendingPrompts.get(promptId);
  if (!pending) return { success: false, reason: 'prompt not found or already resolved' };

  const { prompt, resolve } = pending;
  if (prompt.playerId !== playerId) {
    return { success: false, reason: 'player not authorized to answer this prompt' };
  }

  try {
    resolve(selection);
    // Emit event so UI's prompt acknowledgement can be tracked if needed
    engineEmit('promptAnswered', { promptId, playerId, selection });
    return { success: true };
  } catch (e) {
    return { success: false, reason: `internal error: ${String(e)}` };
  }
}

/**
 * cancelPrompt(promptId, reason)
 *
 * Cancels and rejects a pending prompt (e.g., game ended or replacement chosen elsewhere).
 * Returns true if cancelled; false if not found.
 */
export function cancelPrompt(promptId, reason = 'cancelled') {
  const pending = pendingPrompts.get(promptId);
  if (!pending) return false;
  try {
    pending.reject(new Error(`Prompt ${promptId} cancelled: ${reason}`));
  } catch (e) {
    // swallow
  }
  pendingPrompts.delete(promptId);
  try {
    engineEmit('promptCancelled', { promptId, reason });
  } catch (e) {
    // ignore
  }
  return true;
}

/**
 * getPendingPrompts()
 * Returns a shallow list of pending prompts (for debugging / admin).
 */
export function getPendingPrompts() {
  const out = [];
  for (const [id, p] of pendingPrompts.entries()) {
    out.push({ id, prompt: p.prompt });
  }
  return out;
}

/* Default export */
export default {
  requestChoice,
  submitChoice,
  cancelPrompt,
  getPendingPrompts
};
