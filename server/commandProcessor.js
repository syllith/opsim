// test/engine/schemaEngine.test.js
import assert from 'assert';
import schemaEngine from '../../src/engine/schemaEngine.js';

function makeSimpleState() {
  return {
    players: [
      { socketId: 's1', username: 'p1', deckIds: ['C1', 'C2'], handIds: [], lifeIds: [] },
      { socketId: 's2', username: 'p2', deckIds: ['C3', 'C4'], handIds: [], lifeIds: [] }
    ],
    gameState: {
      areas: {
        player: {
          bottom: { hand: [], trash: [], cost: [], don: [] },
          middle: { leader: [], leaderDon: [], stage: [], deck: [] },
          char: [],
          life: []
        },
        opponent: {
          top: { hand: [], trash: [], cost: [], don: [] },
          middle: { deck: [], stage: [], leader: [], leaderDon: [] },
          char: [],
          life: []
        }
      },
      battle: null,
      currentAttack: null
    },
    turn: { currentPlayerIndex: 0, turnNumber: 1, phase: 'Draw' }
  };
}

describe('schemaEngine minimal commands', () => {
  it('draws a card for the player', async () => {
    const state = makeSimpleState();
    // ensure player has deck
    state.players[0].deckIds = ['X1', 'X2', 'X3'];
    const cmd = { commandId: 'c1', type: 'DRAW_CARD', clientSocketId: 's1' };
    const res = await schemaEngine.applyCommandSchema(state, cmd, {});
    assert(res.valid, 'expected valid result');
    assert.equal(res.eventType, 'DrawCard');
    const newState = res.newState;
    assert(newState.players[0].handIds.length === 1);
    assert(newState.players[0].deckIds.length === 2);
  });

  it('plays a card from hand', async () => {
    const state = makeSimpleState();
    // give the player a hand card
    state.players[0].handIds = ['C10'];
    const cmd = { commandId: 'c2', type: 'PLAY_CARD', clientSocketId: 's1', payload: { handIndex: 0, destination: { section: 'char', keyName: 'char' } } };
    // set turn so player may play
    state.turn = { currentPlayerIndex: 0, turnNumber: 1, phase: 'Main' };
    const res = await schemaEngine.applyCommandSchema(state, cmd, {});
    assert(res.valid, 'expected valid result');
    const newState = res.newState;
    // ensure char area contains card
    assert(newState.gameState.areas.player.char.length === 1);
    assert.equal(newState.gameState.areas.player.char[0].id, 'C10');
  });
});
