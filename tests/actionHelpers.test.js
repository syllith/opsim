// tests/actionHelpers.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { activateAbilityCore } from '../src/comps/Home/ActionHelpers.js';
import { createInitialAreas } from '../src/comps/Home/hooks/useDeckInitializer.js';

test('activateAbilityCore uses dispatchAction and returns success', async () => {
  // Prepare minimal areas and card
  const areas = createInitialAreas();
  // create a simple card in player leader slot to represent on-field card
  areas.player.middle.leader = [{ id: 'CHAR-1', cardId: 'CHAR-1', instanceId: 'ui-player-leader-0', givenDon: 1 }];

  // cardLocation points to the leader
  const cardLocation = { side: 'player', section: 'middle', keyName: 'leader', index: 0 };

  // Construct an ability requiring 1 DON and with a single action
  const ability = {
    timing: 'activateMain',
    condition: { don: 1 },
    actions: [
      { type: 'noopAction', foo: 'bar' } // arbitrary action; dispatchAction will accept anything
    ],
    description: 'Test ability'
  };

  // Mock dispatchAction to capture calls
  let calledWith = null;
  const mockDispatchAction = async (action, ctx) => {
    calledWith = { action, ctx };
    // simulate success
    return { success: true };
  };

  const res = await activateAbilityCore({
    ability,
    abilityIndex: 0,
    instanceId: 'ui-player-leader-0',
    isOnField: true,
    isYourTurn: true,
    phase: 'Main',
    areas,
    setAreas: null,
    turnSide: 'player',
    turnNumber: 1,
    cardLocation,
    appendLog: () => {},
    dispatchAction: mockDispatchAction,
    engine: null
  });

  assert.ok(res && res.success === true, 'Expected success from activateAbilityCore');
  assert.ok(calledWith !== null, 'dispatchAction should have been called');
  assert.strictEqual(calledWith.action.sourceInstanceId, 'ui-player-leader-0', 'sourceInstanceId should be supplied');
  assert.strictEqual(calledWith.ctx.activePlayer, 'player', 'activePlayer in ctx should be turnSide');
});
