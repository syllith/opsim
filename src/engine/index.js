/**
 * src/engine/index.js
 *
 * Engine entry: exports ability & battle modules and provides applyCommand()
 * which is a pure, deterministic command applier for core gameplay commands.
 *
 * applyCommand(state, command, opts) => { valid, newState, eventType, eventPayload, error }
 *
 * - state: authoritative game state object (cloned before modification)
 *   expected keys used: players (array), setup (object), turn (object), gameState (optional)
 * - command: { commandId, type, payload, clientSocketId, lastKnownStateVersion, timestamp }
 * - opts: { rng: optional PRNG function returning 0..1, now: optional Date.now override }
 *
 * The function implements a minimal set of commands first; add more as you extract logic.
 */

import _ from 'lodash';
import * as ability from './ability.js';
import * as battle from './battle.js';

function deepClone(obj) {
  return _.cloneDeep(obj || {});
}

// Helper: find player index by socketId
function findPlayerIndexBySocketId(state, socketId) {
  if (!state || !Array.isArray(state.players)) return -1;
  return state.players.findIndex((p) => p && p.socketId === socketId);
}

// Helper: draw n cards from a player's deckIds (mutates player object)
function drawFromDeckForPlayer(player, n) {
  const out = [];
  if (!player || !Array.isArray(player.deckIds)) return out;
  for (let i = 0; i < n; i++) {
    const cardId = player.deckIds.pop();
    if (!cardId) break;
    out.push(cardId);
  }
  return out;
}

// Helper: roll dice with no tie (1..6) using optional rng
function rollDiceNoTie(rng = Math.random) {
  let a = 0, b = 0;
  while (a === b) {
    a = Math.floor(rng() * 6) + 1;
    b = Math.floor(rng() * 6) + 1;
  }
  return [a, b];
}

// Public applyCommand
export function applyCommand(state, command, opts = {}) {
  // Defensive clones
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;

  if (!state || !command || !command.type) {
    return { valid: false, error: 'Invalid args' };
  }

  // Clone top-level to avoid mutating caller
  const next = deepClone(state);

  const players = next.players || [];
  const setup = next.setup = next.setup || {};
  const turn = next.turn = next.turn || { currentPlayerIndex: 0, turnNumber: 1, phase: 'Draw' };

  // Ensure ready maps exist
  setup.readyBySocketId = setup.readyBySocketId || {};
  setup.handConfirmedBySocketId = setup.handConfirmedBySocketId || {};

  const cmdType = String(command.type || '').toUpperCase();
  const payload = command.payload || {};
  const clientSocketId = command.clientSocketId || command.socketId || payload.socketId || null;

  const actorIndex = clientSocketId ? findPlayerIndexBySocketId(next, clientSocketId) : -1;
  const actor = actorIndex >= 0 ? players[actorIndex] : null;

  // Utility to respond invalid
  const invalid = (msg) => ({ valid: false, error: msg || 'Invalid command' });

  try {
    switch (cmdType) {
      // ----------------------------------------
      // SETUP_READY: mark player ready; when both ready, roll dice and deal hands+life
      // payload: none. command.clientSocketId expected.
      // ----------------------------------------
      case 'SETUP_READY': {
        if (!clientSocketId) return invalid('Missing client socket id for SETUP_READY');

        setup.readyBySocketId[clientSocketId] = true;

        // If both players ready, do dice and deal hands + life
        const bothReady = players.length === 2 && players.every(p => setup.readyBySocketId[p.socketId]);
        if (!bothReady) {
          return {
            valid: true,
            newState: next,
            eventType: 'SetupReady',
            eventPayload: { socketId: clientSocketId }
          };
        }

        // Roll dice no tie
        const [r0, r1] = rollDiceNoTie(rng);
        const firstPlayerIndex = r0 > r1 ? 0 : 1;
        const revealAt = now + 600;

        setup.dice = {
          rollsByIndex: [r0, r1],
          firstPlayerIndex,
          revealAt
        };

        // Deal opening hands + life (canonical)
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          p.handIds = drawFromDeckForPlayer(p, 5);
          p.lifeIds = drawFromDeckForPlayer(p, 5);
        }

        // Setup phase progresses to hands
        setup.phase = 'hands';
        for (const p of players) {
          setup.handConfirmedBySocketId[p.socketId] = false;
        }

        // Initialize turn state (game will only start after both confirm)
        turn.currentPlayerIndex = firstPlayerIndex;
        turn.turnNumber = 1;
        turn.phase = 'Draw';

        return {
          valid: true,
          newState: next,
          eventType: 'SetupComplete',
          eventPayload: {
            dice: setup.dice,
            firstPlayerIndex,
            players: players.map(p => ({ socketId: p.socketId, handCount: (p.handIds || []).length, lifeCount: (p.lifeIds || []).length }))
          }
        };
      }

      // ----------------------------------------
      // OPENING_HAND_CONFIRM: player confirms openings; when both confirmed, phase -> complete
      // payload: none. command.clientSocketId expected.
      // ----------------------------------------
      case 'OPENING_HAND_CONFIRM': {
        if (!clientSocketId) return invalid('Missing client socket id for OPENING_HAND_CONFIRM');

        if (setup.phase !== 'hands') {
          return invalid('Not in opening hands phase');
        }

        setup.handConfirmedBySocketId[clientSocketId] = true;
        const allConfirmed = players.every(p => setup.handConfirmedBySocketId[p.socketId]);
        if (allConfirmed) {
          setup.phase = 'complete';
        }

        return {
          valid: true,
          newState: next,
          eventType: 'OpeningHandConfirm',
          eventPayload: { socketId: clientSocketId, allConfirmed }
        };
      }

      // ----------------------------------------
      // DRAW_CARD: draw 1 card for current player during Draw phase
      // payload: none. command.clientSocketId expected.
      // ----------------------------------------
      case 'DRAW_CARD': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');
        if (setup.phase !== 'complete') return invalid('Setup not complete');
        if (String(turn.phase || '').toLowerCase() !== 'draw') return invalid('Not in Draw phase');

        const p = players[actorIndex];
        const drawn = drawFromDeckForPlayer(p, 1);
        if (drawn.length) {
          p.handIds = p.handIds || [];
          p.handIds.push(...drawn);
        }

        // Advance to Don phase
        turn.phase = 'Don';

        return {
          valid: true,
          newState: next,
          eventType: 'DrawCard',
          eventPayload: { socketId: clientSocketId, drawn }
        };
      }

      // ----------------------------------------
      // DRAW_DON: gain DON for current player during Don phase
      // payload: { amount }
      // ----------------------------------------
      case 'DRAW_DON': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');
        if (setup.phase !== 'complete') return invalid('Setup not complete');
        if (String(turn.phase || '').toLowerCase() !== 'don') return invalid('Not in Don phase');

        const amt = Math.max(1, Math.min(2, Number(payload?.amount) || 2));
        const p = players[actorIndex];
        p.donCount = (p.donCount || 0) + amt;

        turn.phase = 'Main';

        return {
          valid: true,
          newState: next,
          eventType: 'DrawDon',
          eventPayload: { socketId: clientSocketId, amount: amt, donCount: p.donCount }
        };
      }

      // ----------------------------------------
      // END_TURN: end current player's turn; swap currentPlayerIndex, increment turnNumber
      // payload: none. command.clientSocketId expected.
      // ----------------------------------------
      case 'END_TURN': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');

        // Advance turn: switch player and increment turnNumber
        turn.currentPlayerIndex = actorIndex === 0 ? 1 : 0;
        turn.turnNumber = (turn.turnNumber || 1) + 1;
        turn.phase = 'Draw';

        return {
          valid: true,
          newState: next,
          eventType: 'EndTurn',
          eventPayload: { nextPlayerIndex: turn.currentPlayerIndex, turnNumber: turn.turnNumber }
        };
      }

      // ----------------------------------------
      // FALLBACK / UNIMPLEMENTED: we intentionally leave advanced commands for later
      // ----------------------------------------
      default: {
        return invalid(`Unsupported command type: ${cmdType}`);
      }
    }
  } catch (err) {
    return { valid: false, error: String(err || 'Engine error') };
  }
}

export { ability, battle };
export default { applyCommand, ability, battle };
