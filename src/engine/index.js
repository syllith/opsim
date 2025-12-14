/**
 * src/engine/index.js
 *
 * Engine entry: extends applyCommand with PLAY/ATTACK/BLOCK/COUNTER/RESOLVE commands.
 *
 * This file is intentionally self-contained and pure. It mutates a cloned copy
 * of the incoming state and returns the new state + event metadata.
 */
import _ from 'lodash';
import * as ability from './ability.js';
import * as battle from './battle.js';
import schemaEngine from './schemaEngine.js';

function deepClone(obj) {
  return _.cloneDeep(obj || {});
}

function findPlayerIndexBySocketId(state, socketId) {
  if (!state || !Array.isArray(state.players)) return -1;
  return state.players.findIndex((p) => p && p.socketId === socketId);
}

// draw helper
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

// simple dice roll without tie
function rollDiceNoTie(rng = Math.random) {
  let a = 0, b = 0;
  while (a === b) {
    a = Math.floor(rng() * 6) + 1;
    b = Math.floor(rng() * 6) + 1;
  }
  return [a, b];
}

// Minimal initial areas (keeps shape compatible with client)
function createInitialAreas() {
  return {
    opponent: {
      top: { hand: [], trash: [], cost: [], don: [] },
      bottom: { hand: [], don: [], cost: [], trash: [] },
      middle: { deck: [], stage: [], leader: [], leaderDon: [] },
      char: [],
      charDon: [],
      life: []
    },
    player: {
      top: { hand: [], trash: [], cost: [], don: [] },
      bottom: { hand: [], don: [], cost: [], trash: [] },
      life: [],
      char: [],
      charDon: [],
      middle: { leader: [], leaderDon: [], stage: [], deck: [] }
    }
  };
}

export function applyCommand(state, command, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const helpers = opts.helpers || {}; // optional helpers (getCardMeta, getTotalPower, etc.)

  if (!state || !command || !command.type) {
    return { valid: false, error: 'Invalid args' };
  }

  const next = deepClone(state);

  // normalize containers
  next.players = next.players || [];
  next.setup = next.setup || {};
  next.turn = next.turn || { currentPlayerIndex: 0, turnNumber: 1, phase: 'Draw' };

  // Ensure there is a canonical gameState object and that .areas exists
  next.gameState = next.gameState || { areas: createInitialAreas(), battle: null, currentAttack: null };
  next.gameState.areas = next.gameState.areas || createInitialAreas();

  const players = next.players;
  const setup = next.setup;
  const turn = next.turn;

  setup.readyBySocketId = setup.readyBySocketId || {};
  setup.handConfirmedBySocketId = setup.handConfirmedBySocketId || {};

  const cmdType = String(command.type || '').toUpperCase();
  const payload = command.payload || {};
  const clientSocketId = command.clientSocketId || command.socketId || payload.socketId || null;
  const actorIndex = clientSocketId ? findPlayerIndexBySocketId(next, clientSocketId) : -1;
  const actor = actorIndex >= 0 ? players[actorIndex] : null;

  const invalid = (msg) => ({ valid: false, error: msg || 'Invalid command' });

  // Helper: map player index -> canonical side name used in areas
  const sideForIndex = (idx) => (idx === 0 ? 'player' : 'opponent');

  try {
    switch (cmdType) {
      // --- basic commands kept as before ---
      case 'SETUP_READY': {
        if (!clientSocketId) return invalid('Missing client socket id for SETUP_READY');
        setup.readyBySocketId[clientSocketId] = true;
        const bothReady = players.length === 2 && players.every(p => setup.readyBySocketId[p.socketId]);
        if (!bothReady) {
          return { valid: true, newState: next, eventType: 'SetupReady', eventPayload: { socketId: clientSocketId } };
        }
        const [r0, r1] = rollDiceNoTie(rng);
        const firstPlayerIndex = r0 > r1 ? 0 : 1;
        const revealAt = now + 600;
        setup.dice = { rollsByIndex: [r0, r1], firstPlayerIndex, revealAt };

        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          p.handIds = drawFromDeckForPlayer(p, 5);
          p.lifeIds = drawFromDeckForPlayer(p, 5);
        }
        setup.phase = 'hands';
        for (const p of players) setup.handConfirmedBySocketId[p.socketId] = false;
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

      case 'OPENING_HAND_CONFIRM': {
        if (!clientSocketId) return invalid('Missing client socket id for OPENING_HAND_CONFIRM');
        if (setup.phase !== 'hands') return invalid('Not in opening hands phase');
        setup.handConfirmedBySocketId[clientSocketId] = true;
        const allConfirmed = players.every(p => setup.handConfirmedBySocketId[p.socketId]);
        if (allConfirmed) setup.phase = 'complete';
        return { valid: true, newState: next, eventType: 'OpeningHandConfirm', eventPayload: { socketId: clientSocketId, allConfirmed } };
      }

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
        turn.phase = 'Don';
        return { valid: true, newState: next, eventType: 'DrawCard', eventPayload: { socketId: clientSocketId, drawn } };
      }

      case 'DRAW_DON': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');
        if (setup.phase !== 'complete') return invalid('Setup not complete');
        if (String(turn.phase || '').toLowerCase() !== 'don') return invalid('Not in Don phase');

        const amt = Math.max(1, Math.min(2, Number(payload?.amount) || 2));
        const p = players[actorIndex];
        p.donCount = (p.donCount || 0) + amt;
        turn.phase = 'Main';
        return { valid: true, newState: next, eventType: 'DrawDon', eventPayload: { socketId: clientSocketId, amount: amt, donCount: p.donCount } };
      }

      case 'END_TURN': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');

        turn.currentPlayerIndex = actorIndex === 0 ? 1 : 0;
        turn.turnNumber = (turn.turnNumber || 1) + 1;
        turn.phase = 'Draw';
        return { valid: true, newState: next, eventType: 'EndTurn', eventPayload: { nextPlayerIndex: turn.currentPlayerIndex, turnNumber: turn.turnNumber } };
      }

      // --- New gameplay commands ---
      case 'PLAY_CARD': {
        // payload: { cardId?, handIndex?, destination: { section:'char'|'middle', keyName:'char'|'leader'|'stage', index? } }
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');
        if (String(turn.phase || '').toLowerCase() !== 'main') return invalid('Not in Main phase');

        const p = players[actorIndex];
        p.handIds = p.handIds || [];

        // resolve card id from handIndex or cardId
        let cardId = null;
        if (Number.isInteger(payload?.handIndex)) {
          const idx = payload.handIndex;
          if (idx < 0 || idx >= p.handIds.length) return invalid('Invalid hand index');
          cardId = p.handIds.splice(idx, 1)[0];
        } else if (payload?.cardId) {
          const foundIndex = p.handIds.findIndex(id => id === payload.cardId);
          if (foundIndex === -1) return invalid('Card not found in hand');
          cardId = p.handIds.splice(foundIndex, 1)[0];
        } else {
          // default: pop first
          cardId = p.handIds.shift();
          if (!cardId) return invalid('No card in hand to play');
        }

        if (!cardId) return invalid('No card to play');

        // Ensure gameState.areas exists
        next.gameState = next.gameState || { areas: createInitialAreas(), battle: null, currentAttack: null };
        next.gameState.areas = next.gameState.areas || createInitialAreas();
        const areas = next.gameState.areas;

        const side = sideForIndex(actorIndex);
        const dest = payload?.destination || { section: 'char', keyName: 'char' };

        // place card
        if (dest.section === 'char' && dest.keyName === 'char') {
          areas[side].char = areas[side].char || [];
          const placedCard = { id: cardId, rested: false, enteredTurn: turn.turnNumber, justPlayed: true };
          areas[side].char.push(placedCard);
        } else if (dest.section === 'middle' && dest.keyName === 'leader') {
          areas[side].middle = areas[side].middle || {};
          areas[side].middle.leader = areas[side].middle.leader || [];
          const placedCard = { id: cardId, rested: false, enteredTurn: turn.turnNumber, justPlayed: true };
          if (Number.isInteger(dest.index)) {
            areas[side].middle.leader[dest.index] = placedCard;
          } else {
            areas[side].middle.leader[0] = placedCard;
          }
        } else {
          // generic fallback: push into char
          areas[side].char = areas[side].char || [];
          areas[side].char.push({ id: cardId, rested: false, enteredTurn: turn.turnNumber, justPlayed: true });
        }

        return {
          valid: true,
          newState: next,
          eventType: 'PlayCard',
          eventPayload: { socketId: clientSocketId, cardId, destination: dest }
        };
      }

      case 'BEGIN_ATTACK': {
        // payload: { attacker: { section, keyName, index }, side? }
        if (actorIndex === -1) return invalid('Player not in game');
        if (turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');

        next.gameState = next.gameState || { areas: createInitialAreas(), battle: null, currentAttack: null };
        next.gameState.areas = next.gameState.areas || createInitialAreas();
        const areas = next.gameState.areas;
        const side = sideForIndex(actorIndex);

        const attacker = payload?.attacker || { section: 'middle', keyName: 'leader', index: 0 };

        let attackResult;
        if (attacker.section === 'middle' && attacker.keyName === 'leader') {
          const leaderCard = _.get(areas, [side, 'middle', 'leader', 0]) || null;
          if (!leaderCard || !leaderCard.id) return invalid('No leader to attack with');
          attackResult = battle.beginAttackForLeader(areas, leaderCard, side, helpers.getTotalPower);
        } else if (attacker.section === 'char' && attacker.keyName === 'char') {
          const charArr = _.get(areas, [side, 'char'], []);
          const idx = Number.isInteger(attacker.index) ? attacker.index : 0;
          const attackerCard = charArr[idx];
          if (!attackerCard || !attackerCard.id) return invalid('No attacking character at index');
          attackResult = battle.beginAttackForCard(areas, attackerCard, idx, side, helpers.getTotalPower);
        } else {
          return invalid('Unsupported attacker location');
        }

        next.gameState.areas = attackResult.areas;
        next.gameState.battle = attackResult.battle;
        next.gameState.currentAttack = attackResult.currentAttack;

        return {
          valid: true,
          newState: next,
          eventType: 'BeginAttack',
          eventPayload: { socketId: clientSocketId, attackKey: attackResult.currentAttack?.key || null }
        };
      }

      case 'APPLY_BLOCKER': {
        // payload: { blockerIndex: number }
        if (!next.gameState || !next.gameState.battle) return invalid('No active battle');
        const battleObj = next.gameState.battle;
        const blockerIndex = Number.isInteger(payload?.blockerIndex) ? payload.blockerIndex : null;
        if (blockerIndex === null) return invalid('Missing blockerIndex');
        const defenderSide = battleObj.target ? battleObj.target.side : null;
        if (!defenderSide) return invalid('No target to block');

        const { areas: newAreas, battle: newBattle } = battle.applyBlocker(next.gameState.areas, battleObj, blockerIndex, {});
        next.gameState.areas = newAreas;
        next.gameState.battle = newBattle;
        return { valid: true, newState: next, eventType: 'ApplyBlocker', eventPayload: { socketId: clientSocketId, blockerIndex } };
      }

      case 'ADD_COUNTER_FROM_HAND': {
        // payload: { handIndex: number }
        if (!next.gameState || !next.gameState.battle) return invalid('No active battle');
        const battleObj = next.gameState.battle;
        if (battleObj.step !== 'counter' && battleObj.step !== 'block') return invalid('Not in counter step');
        const defendingSide = battleObj.target ? battleObj.target.side : null;
        if (!defendingSide) return invalid('No target to counter against');

        const handIndex = Number.isInteger(payload?.handIndex) ? payload.handIndex : null;
        if (handIndex === null) return invalid('Missing handIndex');

        // Provide helpers to battle.addCounterFromHand: getCardMeta, getHandCostRoot if present
        const addHelpers = {
          getCardMeta: helpers.getCardMeta,
          getHandCostRoot: helpers.getHandCostRoot
        };

        const { areas: newAreas, battle: newBattle, log } = battle.addCounterFromHand(next.gameState.areas, battleObj, handIndex, defendingSide, addHelpers);
        next.gameState.areas = newAreas;
        next.gameState.battle = newBattle;

        return { valid: true, newState: next, eventType: 'AddCounterFromHand', eventPayload: { socketId: clientSocketId, handIndex, log } };
      }

      case 'RESOLVE_DAMAGE': {
        if (!next.gameState || !next.gameState.battle) return invalid('No active battle');
        const battleObj = next.gameState.battle;
        if (battleObj.step !== 'damage') return invalid('Not in damage step');

        // Pass through helpers used by battle.resolveDamage: getTotalPower and metaById (if provided)
        const resolveHelpers = {
          getTotalPower: helpers.getTotalPower,
          metaById: helpers.metaById,
          returnDonFromCardMutate: helpers.returnDonFromCardMutate
        };

        const { areas: afterAreas, battle: afterBattle, logs } = battle.resolveDamage(next.gameState.areas, battleObj, resolveHelpers);
        next.gameState.areas = afterAreas;
        next.gameState.battle = afterBattle;

        return { valid: true, newState: next, eventType: 'ResolveDamage', eventPayload: { socketId: clientSocketId, logs } };
      }

      default:
        return invalid(`Unsupported command type: ${cmdType}`);
    }
  } catch (err) {
    return { valid: false, error: String(err || 'Engine error') };
  }
}

export { ability, battle };
export default { applyCommand, ability, battle };
// Schema-driven entrypoint (PR#1)
export { schemaEngine };
export { schemaEngine as applyCommandSchema };
