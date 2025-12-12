import DefaultAbility from './DefaultAbility';
import UnifiedAbility from './abilities/UnifiedAbility';

export function resolveAbilityRenderer(ability) {
  if (!ability) return DefaultAbility;

  const timing = ability.timing;
  const uiType = ability.uiType;

  // Allow explicit override via uiType if present
  if (uiType === 'onPlay') return UnifiedAbility;
  if (uiType === 'main') return UnifiedAbility;
  if (uiType === 'whenAttacking') return UnifiedAbility;
  if (uiType === 'onOpponentsAttack') return UnifiedAbility;
  if (uiType === 'counter') return UnifiedAbility;
  if (uiType === 'static') return UnifiedAbility;

  switch (timing) {
    case 'onPlay':
      return UnifiedAbility;
    case 'activateMain':
    case 'main':
      return UnifiedAbility;
    case 'whenAttacking':
      return UnifiedAbility;
    case 'whenAttackingOrOnOpponentsAttack':
      // Could use a dedicated component later; reuse attack UI for now
      return UnifiedAbility;
    case 'onOpponentsAttack':
      return UnifiedAbility;
    case 'counter':
      return UnifiedAbility;
    case 'static':
      return UnifiedAbility;
    default:
      return DefaultAbility;
  }
}

