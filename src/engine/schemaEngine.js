// src/engine/schemaEngine.js
/**
 * Minimal schema-driven engine skeleton (PR #1)
 *
 * This file implements a small, self-contained interpreter for a schema-driven
 * command flow. It is intentionally small: it implements a minimal set of
 * commands (draw, play, move, begin attack, deal damage) and returns an
 * array "decisionPrompts" when players are required to make choices.
 *
 * The function applyCommandSchema mirrors the contract of the existing engine:
 *   applyCommandSchema(state, command, opts) => { valid, newState, eventType, eventPayload, decisionPrompts? }
 *
 * It is pure and uses cloned state (no mutation of input).
 */

import _ from 'lodash';

function deepClone(obj) {
  return _.cloneDeep(obj || {});
}

/* Minimal initial areas model (keeps parity with existing engine/index.js) */
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

/* draw helper */
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

function findPlayerIndexBySocketId(state, socketId) {
  if (!state || !Array.isArray(state.players)) return -1;
  return state.players.findIndex((p) => p && p.socketId === socketId);
}

const sideForIndex = (idx) => (idx === 0 ? 'player' : 'opponent');

export async function applyCommandSchema(state, command, opts = {}) {
  // Minimal options support: rng, now, helpers
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const helpers = opts.helpers || {};

  if (!state || !command || !command.type) {
    return { valid: false, error: 'Invalid args' };
  }

  const next = deepClone(state || {});
  next.gameState = next.gameState || { areas: createInitialAreas(), battle: null, currentAttack: null };
  next.gameState.areas = next.gameState.areas || createInitialAreas();
  next.players = next.players || [];
  next.setup = next.setup || {};
  next.turn = next.turn || { currentPlayerIndex: 0, turnNumber: 1, phase: 'Draw' };

  const cmdType = String(command.type || '').toUpperCase();
  const payload = command.payload || {};
  const clientSocketId = command.clientSocketId || command.socketId || payload.socketId || null;
  const actorIndex = clientSocketId ? findPlayerIndexBySocketId(next, clientSocketId) : -1;
  const actor = actorIndex >= 0 ? next.players[actorIndex] : null;

  const invalid = (msg) => ({ valid: false, error: msg || 'Invalid command' });

  try {
    switch (cmdType) {
      // DRAW_CARD (schema version)
      case 'DRAW_CARD': {
        if (actorIndex === -1) return invalid('Player not in game');
        // phase checks may be enforced by higher-level code
        const p = next.players[actorIndex];
        const drawn = drawFromDeckForPlayer(p, 1);
        if (drawn.length) {
          p.handIds = p.handIds || [];
          p.handIds.push(...drawn);
        }
        // update phase to Don by convention (server/index engine uses 'Don')
        next.turn.phase = 'Don';
        return {
          valid: true,
          newState: next,
          eventType: 'DrawCard',
          eventPayload: { socketId: clientSocketId, drawn }
        };
      }

      // PLAY_CARD: simplified implementation for PR#1
      // payload: { handIndex?, cardId?, destination: { section:'char'|'middle', keyName:'char'|'leader'|'stage', index? } }
      case 'PLAY_CARD': {
        if (actorIndex === -1) return invalid('Player not in game');
        if (next.turn.currentPlayerIndex !== actorIndex) return invalid('Not your turn');

        const p = next.players[actorIndex];
        p.handIds = p.handIds || [];

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
          cardId = p.handIds.shift();
          if (!cardId) return invalid('No card in hand to play');
        }

        if (!cardId) return invalid('No card to play');

        const areas = next.gameState.areas;
        const side = sideForIndex(actorIndex);
        const dest = payload?.destination || { section: 'char', keyName: 'char' };

        if (dest.section === 'char' && dest.keyName === 'char') {
          areas[side].char = areas[side].char || [];
          const placedCard = { id: cardId, rested: false, enteredTurn: next.turn.turnNumber, justPlayed: true };
          areas[side].char.push(placedCard);
        } else if (dest.section === 'middle' && dest.keyName === 'leader') {
          areas[side].middle = areas[side].middle || {};
          areas[side].middle.leader = areas[side].middle.leader || [];
          const placedCard = { id: cardId, rested: false, enteredTurn: next.turn.turnNumber, justPlayed: true };
          if (Number.isInteger(dest.index)) {
            areas[side].middle.leader[dest.index] = placedCard;
          } else {
            areas[side].middle.leader[0] = placedCard;
          }
        } else if (dest.section === 'middle' && dest.keyName === 'stage') {
          areas[side].middle = areas[side].middle || {};
          areas[side].middle.stage = areas[side].middle.stage || [];
          areas[side].middle.stage[0] = { id: cardId, rested: false, enteredTurn: next.turn.turnNumber, justPlayed: true };
        } else {
          // fallback push into char
          areas[side].char = areas[side].char || [];
          areas[side].char.push({ id: cardId, rested: false, enteredTurn: next.turn.turnNumber, justPlayed: true });
        }

        return {
          valid: true,
          newState: next,
          eventType: 'PlayCard',
          eventPayload: { socketId: clientSocketId, cardId, destination: dest }
        };
      }

      // MOVE_CARD: generic moving action between zones
      // payload: { from: { side, section, keyName, index }, to: { side?, section?, keyName?, destination }, location?: 'top'|'bottom'|'trash'|'hand' }
      case 'MOVE_CARD': {
        if (actorIndex === -1) return invalid('Player not in game');
        const areas = next.gameState.areas;
        const from = payload?.from;
        const to = payload?.to;
        if (!from || !to) return invalid('Missing from/to');

        const getSourceArr = (areas, f) => {
          if (!f) return null;
          if (f.section === 'middle') {
            return _.get(areas, [f.side, 'middle', f.keyName]);
          }
          if (f.section === 'char' && f.keyName === 'char') {
            return _.get(areas, [f.side, 'char']);
          }
          if (f.section === 'top') {
            return _.get(areas, [f.side, 'top', f.keyName]);
          }
          if (f.section === 'bottom') {
            return _.get(areas, [f.side, 'bottom', f.keyName]);
          }
          return _.get(areas, [f.side, f.section, f.keyName]);
        };

        const source = getSourceArr(areas, from);
        if (!source || from.index == null || from.index < 0 || from.index >= source.length) return invalid('Invalid source');

        const [card] = source.splice(from.index, 1);
        // place into destination
        if (to.section === 'char' && to.keyName === 'char') {
          areas[to.side].char = areas[to.side].char || [];
          if (Number.isInteger(to.index)) areas[to.side].char.splice(to.index, 0, card);
          else areas[to.side].char.push(card);
        } else if (to.section === 'middle' && to.keyName === 'leader') {
          areas[to.side].middle = areas[to.side].middle || {};
          areas[to.side].middle.leader = areas[to.side].middle.leader || [];
          areas[to.side].middle.leader[0] = card;
        } else if (to.destination === 'hand') {
          const handRoot = to.side === 'player' ? _.get(areas, [to.side, 'bottom', 'hand']) : _.get(areas, [to.side, 'top', 'hand']);
          if (Array.isArray(handRoot)) {
            if (to.position === 'top') handRoot.push(card);
            else if (to.position === 'bottom') handRoot.unshift(card);
            else handRoot.push(card);
          }
        } else if (to.destination === 'trash') {
          const trashRoot = (to.side === 'player') ? _.get(areas, [to.side, 'bottom', 'trash']) : _.get(areas, [to.side, 'top', 'trash']);
          if (Array.isArray(trashRoot)) trashRoot.push(card);
        } else {
          // fallback: append to destination array if exists
          const destArr = (_.get(areas, [to.side, to.section, to.keyName]));
          if (Array.isArray(destArr)) destArr.push(card);
        }

        return {
          valid: true,
          newState: next,
          eventType: 'MoveCard',
          eventPayload: { socketId: clientSocketId, from, to, movedCardId: card?.id || null }
        };
      }

      // DEAL_DAMAGE: minimal leader damage via life removal
      // payload: { side: 'player'|'opponent', count: 1 }
      case 'DEAL_DAMAGE': {
        const side = payload?.side;
        const count = Math.max(1, Number(payload?.count) || 1);
        if (!side) return invalid('Missing side for damage');

        // We'll model life arrays at areas[side].life
        const areas = next.gameState.areas;
        const lifeArr = _.get(areas, [side, 'life']) || [];
        const removed = [];
        for (let i = 0; i < count; i++) {
          if (!lifeArr.length) break;
          const taken = lifeArr.shift();
          removed.push(taken);
          // per original server behavior some implementations push removed life to trash; we will add them to trash
          const trashRoot = side === 'player' ? _.get(areas, [side, 'bottom', 'trash']) : _.get(areas, [side, 'top', 'trash']);
          if (Array.isArray(trashRoot)) trashRoot.push(taken);
        }
        return {
          valid: true,
          newState: next,
          eventType: 'DealDamage',
          eventPayload: { side, count: removed.length, removed }
        };
      }

      // BEGIN_ATTACK: minimal dispatch that sets gameState.battle and currentAttack
      // Uses a very small shape; heavy battle logic lives in src/engine/battle.js normally
      case 'BEGIN_ATTACK': {
        // For PR#1 we create a minimal battle object so client has something to render.
        if (actorIndex === -1) return invalid('Player not in game');
        const side = sideForIndex(actorIndex);
        const attacker = payload?.attacker || { section: 'middle', keyName: 'leader', index: 0 };

        const areas = next.gameState.areas;
        const battle = {
          attacker: { ...attacker, side },
          target: null,
          step: 'attack',
          createdAt: now
        };
        next.gameState.battle = battle;
        next.gameState.currentAttack = { key: `atk-${Date.now()}-${Math.floor(rng() * 10000)}` };

        return {
          valid: true,
          newState: next,
          eventType: 'BeginAttack',
          eventPayload: { socketId: clientSocketId, attackKey: next.gameState.currentAttack.key }
        };
      }

      default:
        return invalid(`Unsupported schema command type: ${cmdType}`);
    }
  } catch (err) {
    return { valid: false, error: String(err || 'Engine error') };
  }
}

export default { applyCommandSchema };
