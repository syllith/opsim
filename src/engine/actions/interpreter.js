'use strict';
// interpreter.js — Action Interpreter and Dispatcher
// =============================================================================
// PURPOSE:
// This module is the central dispatcher for all action execution. It takes an
// Action object from card JSON and routes it to the appropriate action handler.
// It also handles action sequencing, conditional actions, and the "may" choice
// pattern.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Dispatch actions to appropriate handler modules
// - Handle action arrays (sequential execution)
// - Process conditional actions (ActionConditional)
// - Handle "may" choices (optional actions)
// - Process chooseMode actions
// - Manage action context and bound variables
// - Aggregate results from multiple actions

// =============================================================================
// PUBLIC API
// =============================================================================
// executeAction(gameState, action, context) -> ActionResult
//   Executes a single action object.
//   Routes to appropriate handler based on action.type.
//   Returns { success, newState?, error?, logEntry? }
//
// executeActions(gameState, actions, context) -> ActionResult
//   Executes an array of actions in sequence.
//   Stops on first failure unless specified otherwise.
//
// executeConditional(gameState, conditionalAction, context) -> ActionResult
//   Handles ActionConditional: evaluate condition, then execute nested actions.
//
// executeChooseMode(gameState, chooseModeAction, context) -> ActionResult
//   Handles ActionChooseMode: let player pick mode(s), execute chosen actions.
//
// handleMayChoice(gameState, action, context) -> { shouldExecute: boolean, newState? }
//   If action.may is true, asks player for choice.
//   Returns whether to proceed with the action.

// =============================================================================
// ACTION TYPES (from schema.json)
// =============================================================================
// - modifyStat: Modify power/cost/counter
// - ko: KO a character
// - preventKO: Prevent KO (replacement)
// - search: Search deck/trash for cards
// - trashFromHand: Discard from hand
// - giveDon: Give DON to cards
// - attachDon: Attach DON
// - returnDon: Return DON to deck
// - detachDon: Detach DON from card
// - setState: Set active/rested
// - draw: Draw cards
// - moveCard: Move card to zone
// - redirectAttack: Change attack target
// - restrict: Apply restriction
// - keywordEffect: Grant/revoke keyword
// - negateEffects: Make effects invalid
// - revealLife / revealHand: Reveal hidden cards
// - playCard: Play card from zone
// - restrictPlay: Restrict playing cards
// - dealDamage: Deal damage to leader
// - chooseMode: Player chooses from options
// - replacementEffect: Register replacement
// - conditional: Conditional execution
// - noop: Do nothing
// ... and more

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: Action object from card JSON
// - actions: Array of Action objects
// - context: {
//     thisCard: CardInstance,
//     activePlayer: 'player1'|'player2',
//     boundVars: Map<string, any>,
//     triggerSource?: CardInstance
//   }
//
// OUTPUT - ActionResult:
// {
//   success: boolean,
//   newState?: GameState,
//   error?: string,
//   logEntry?: string,
//   boundVars?: Map<string, any>  // Updated bindings
// }

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/index.js: all mutation functions route through here
// - src/engine/rules/evaluator.js: triggered abilities execute via here
// - src/engine/core/damageAndLife.js: Trigger ability execution
//
// DEPENDS ON:
// - src/engine/actions/modifyStat.js
// - src/engine/actions/moveCard.js
// - src/engine/actions/giveDon.js
// - src/engine/actions/attachDon.js
// - src/engine/actions/returnDon.js
// - src/engine/actions/keywordEffect.js
// - src/engine/actions/koAction.js
// - src/engine/actions/dealDamage.js
// - src/engine/actions/playCard.js
// - src/engine/actions/search.js
// - src/engine/actions/replacementEffectAction.js
// - src/engine/rules/expressions.js: for conditional evaluation
// - src/engine/rules/selector.js: for target resolution

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// DISPATCH PATTERN:
// Use a map of action.type -> handler function:
// const handlers = {
//   modifyStat: modifyStatHandler,
//   ko: koHandler,
//   ...
// };
// const handler = handlers[action.type];
// return handler ? handler(gameState, action, context) : error;
//
// MAY HANDLING:
// If action.may === true:
// 1. Check if effect can apply (e.g., has valid targets)
// 2. If yes, prompt player: "Do you want to [action description]?"
// 3. If player declines, return success with unchanged state
// 4. If player accepts, proceed with action
// UI needs to provide a callback for may choices.
//
// SEQUENTIAL EXECUTION:
// When executing array of actions:
// - Each action gets the newState from previous action
// - boundVars accumulate across actions
// - On failure, can optionally rollback or just return error
//
// CONDITIONAL ACTIONS:
// ActionConditional has a condition and nested actions:
// 1. Evaluate condition using expressions.js
// 2. If true (and may is false or player accepts), execute nested actions
// 3. If false, skip (return success with unchanged state)
//
// CHOOSE MODE:
// ActionChooseMode lets player pick from options:
// 1. Present modes to player
// 2. Player selects min-max number of modes
// 3. Execute each selected mode's actions in order
// 4. Combine results
//
// BINDING VARIABLES:
// Some actions use bindAs in selectors to store selected targets.
// These go into context.boundVars and can be referenced by later actions.
// Example: Search that binds selected card as "searchedCard", then
// a later modifyStat targets "searchedCard".

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: executeAction routes to correct handler
//   Input: { type: 'draw', count: 2, side: 'self' }
//   Expected: Calls draw handler, draws 2 cards
//
// TEST: executeActions runs in sequence
//   Input: [drawAction, modifyStatAction]
//   Expected: Both execute in order, final state has both effects
//
// TEST: executeActions stops on failure
//   Input: [validAction, invalidAction, anotherAction]
//   Expected: Stops after invalid, returns error
//
// TEST: may=true with decline
//   Input: { type: 'draw', may: true }, player declines
//   Expected: Success, state unchanged
//
// TEST: conditional with false condition
//   Input: { type: 'conditional', condition: {...falsy...}, actions: [...] }
//   Expected: Nested actions not executed, success returned
//
// TEST: chooseMode with selection
//   Input: { type: 'chooseMode', modes: [A, B], min: 1, max: 1 }, player picks B
//   Expected: Only mode B's actions execute

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Create handler dispatch map
// [ ] 2. Implement executeAction router
// [ ] 3. Implement executeActions for arrays
// [ ] 4. Implement handleMayChoice with UI callback
// [ ] 5. Implement executeConditional
// [ ] 6. Implement executeChooseMode
// [ ] 7. Wire all action handlers
// [ ] 8. Implement boundVars passing
// [ ] 9. Add comprehensive logging
// [ ] 10. Handle unknown action types gracefully

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

// Action handler registry (to be populated)
const actionHandlers = {
  // modifyStat: require('./modifyStat').execute,
  // ko: require('./koAction').execute,
  // etc.
};

export const executeAction = (gameState, action, context = {}) => {
  if (!action || !action.type) {
    return { success: false, error: 'Invalid action: missing type' };
  }
  
  // Check for may choice
  if (action.may) {
    // TODO: Handle may choice via UI callback
  }
  
  // Route to handler
  const handler = actionHandlers[action.type];
  if (!handler) {
    // For now, return not implemented for all action types
    return { success: false, error: `Action type '${action.type}' not implemented` };
  }
  
  return handler(gameState, action, context);
};

export const executeActions = (gameState, actions, context = {}) => {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { success: true, newState: gameState };
  }
  
  let currentState = gameState;
  const logEntries = [];
  
  for (const action of actions) {
    const result = executeAction(currentState, action, context);
    if (!result.success) {
      return result;
    }
    if (result.newState) {
      currentState = result.newState;
    }
    if (result.logEntry) {
      logEntries.push(result.logEntry);
    }
  }
  
  return {
    success: true,
    newState: currentState,
    logEntry: logEntries.join('; ')
  };
};

export const executeConditional = (gameState, conditionalAction, context = {}) => {
  // TODO: Evaluate condition, execute if true
  return { success: false, error: 'Not implemented' };
};

export const executeChooseMode = (gameState, chooseModeAction, context = {}) => {
  // TODO: Present choices, execute selected modes
  return { success: false, error: 'Not implemented' };
};

export const handleMayChoice = (gameState, action, context = {}) => {
  // TODO: Query player for may choice
  return { shouldExecute: false };
};

export default {
  executeAction,
  executeActions,
  executeConditional,
  executeChooseMode,
  handleMayChoice
};
