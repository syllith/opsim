'use strict';
/*
 * interpreter.js — Action Interpreter
 * =============================================================================
 * PURPOSE
 *  - Provide a central place to execute action descriptors (action objects).
 *  - Map action.type -> underlying action implementation module.
 *
 * API
 *  - async executeAction(gameState, action, context)
 *
 * ACTION SHAPES (supported)
 *  - moveCard: { type: 'moveCard', instanceId, destination, options }
 *  - playCard: { type: 'playCard', instanceId, destination, options }
 *  - modifyStat: { type: 'modifyStat', descriptor }  OR include descriptor fields at top-level
 *  - giveDon: { type: 'giveDon', count, target, enterRested, side? }  (delegated)
 *  - dealDamage: { type: 'dealDamage', side, count }
 *
 * The interpreter is forgiving: if the action contains named fields, it will
 * call the appropriate underlying function. It returns the underlying action
 * result or a standardized failure object.
 *
 * NOTES
 *  - This interpreter is synchronous (returns plain objects). If any underlying
 *    action becomes async (e.g., network), adapt to return Promises.
 * =============================================================================
 */

import moveCardModule from './moveCard.js';
import { modifyStat as modifyStatFunc } from './modifyStat.js';
import playCardModule from './playCard.js';
import giveDonAction from './giveDon.js';
import returnDonAction from './returnDon.js';
import { dealDamage as dealDamageFunc } from './dealDamage.js';
import engine from '../index.js'; // for getTotalPower checks if needed

const moveCard = moveCardModule.moveCard || moveCardModule.default && moveCardModule.default.moveCard;
const playCard = playCardModule.playCard || playCardModule.default && playCardModule.default.playCard;

/**
 * normalize action inputs and dispatch
 */
export function executeAction(gameState, action = {}, context = {}) {
  if (!gameState) return { success: false, error: 'missing gameState' };
  if (!action || !action.type) return { success: false, error: 'invalid action' };

  const type = action.type;

  try {
    switch (type) {
      case 'moveCard': {
        const instanceId = action.instanceId || (action.args && action.args.instanceId);
        const destination = action.destination || (action.args && action.args.destination);
        const options = action.options || (action.args && action.args.options) || {};
        if (!instanceId || !destination) return { success: false, error: 'moveCard requires instanceId and destination' };
        const res = moveCard(gameState, instanceId, destination, options);
        return res;
      }

      case 'playCard': {
        const instanceId = action.instanceId || (action.args && action.args.instanceId);
        const destination = action.destination || (action.args && action.args.destination) || 'char';
        const options = action.options || (action.args && action.args.options) || {};
        if (!instanceId) return { success: false, error: 'playCard requires instanceId' };
        const res = playCard(gameState, instanceId, destination, options);
        return res;
      }

      case 'modifyStat': {
        // descriptor may be under action.descriptor or the whole action is the descriptor
        const descriptor = action.descriptor || action;
        // Ensure we don't pass the 'type' key down inadvertently
        const desc = Object.assign({}, descriptor);
        delete desc.type;
        delete desc.descriptor;
        const res = modifyStatFunc(gameState, desc);
        return res;
      }

      case 'giveDon': {
        // delegate to giveDonAction.execute
        const res = giveDonAction.execute(gameState, action, context);
        return res;
      }

      case 'returnDon': {
        // delegate to returnDonAction.execute
        const res = returnDonAction.execute(gameState, action, context);
        return res;
      }

      case 'dealDamage': {
        const side = action.side;
        const count = typeof action.count === 'number' ? action.count : 1;
        if (!side) return { success: false, error: 'dealDamage requires side' };
        const res = dealDamageFunc(gameState, side, count);
        return res;
      }

      case 'getTotalPower': {
        // helper query action
        const instanceId = action.instanceId;
        const isOwnerTurn = !!(action.isOwnerTurn);
        const fallbackBase = action.fallbackBase;
        if (!instanceId) return { success: false, error: 'getTotalPower requires instanceId' };
        const power = engine.getTotalPower(gameState, instanceId, { isOwnerTurn, fallbackBase });
        return { success: true, power };
      }

      default:
        return { success: false, error: `unknown action type ${type}` };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export default {
  executeAction
};
