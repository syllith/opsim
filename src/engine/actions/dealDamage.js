'use strict';
/*
 * dealDamage.js — Action to deal damage to a player's leader (via Life)
 * =============================================================================
 * API:
 *   dealDamage(gameState, side, count, options)
 *
 * Returns the result from core.damageAndLife.dealDamageToLeader (Promise)
 *
 * NOTES:
 *   - side: 'player'|'opponent' - the side whose Leader is taking damage
 *   - options: { banish: boolean, allowTriggers: boolean }
 */
import damageAndLife from '../core/damageAndLife.js';

export function dealDamage(gameState, side, count = 1, options = {}) {
  return damageAndLife.dealDamageToLeader(gameState, side, count, options);
}

export default { dealDamage };
