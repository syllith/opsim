'use strict';
/*
 * dealDamage.js — Action to deal damage to a player's leader (via Life)
 * =============================================================================
 * API:
 *   dealDamage(gameState, side, count)
 *
 * Returns the result from core.damageAndLife.dealDamageToLeader
 *
 * NOTES:
 *   - side: 'player'|'opponent' - the side whose Leader is taking damage
 */
import damageAndLife from '../core/damageAndLife.js';

export function dealDamage(gameState, side, count = 1) {
  return damageAndLife.dealDamageToLeader(gameState, side, count);
}

export default { dealDamage };
