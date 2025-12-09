import DefaultAbility from './DefaultAbility';
import OnPlayAbility from './abilities/OnPlayAbility';
import MainAbility from './abilities/MainAbility';
import WhenAttackingAbility from './abilities/WhenAttackingAbility';
import OpponentsAttackAbility from './abilities/OpponentsAttackAbility';
import CounterAbility from './abilities/CounterAbility';
import StaticAbility from './abilities/StaticAbility';

export function resolveAbilityRenderer(ability) {
  if (!ability) return DefaultAbility;

  const timing = ability.timing;
  const uiType = ability.uiType;

  // Allow explicit override via uiType if present
  if (uiType === 'onPlay') return OnPlayAbility;
  if (uiType === 'main') return MainAbility;
  if (uiType === 'whenAttacking') return WhenAttackingAbility;
  if (uiType === 'onOpponentsAttack') return OpponentsAttackAbility;
  if (uiType === 'counter') return CounterAbility;
  if (uiType === 'static') return StaticAbility;

  switch (timing) {
    case 'onPlay':
      return OnPlayAbility;
    case 'activateMain':
    case 'main':
      return MainAbility;
    case 'whenAttacking':
      return WhenAttackingAbility;
    case 'whenAttackingOrOnOpponentsAttack':
      // Could use a dedicated component later; reuse attack UI for now
      return WhenAttackingAbility;
    case 'onOpponentsAttack':
      return OpponentsAttackAbility;
    case 'counter':
      return CounterAbility;
    case 'static':
      return StaticAbility;
    default:
      return DefaultAbility;
  }
}

