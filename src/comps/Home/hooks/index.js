// Re-export all hooks from the hooks folder
export { default as useBoard } from './useBoard';
export { default as useTurn } from './useTurn';
export { default as useCards } from './useCards';
export { default as useCardStats } from './useCardStats';
export { useModifiers } from './useModifiers';
export { useTargeting } from './useTargeting';
export { default as useGameActions } from './useGameActions';
export { useMultiplayer } from './useMultiplayer';
export { default as useOpeningHands } from './useOpeningHands';
export { useDeckInitializer, createInitialAreas } from './useDeckInitializer';

// New extracted hooks
export { default as useTriggers } from './useTriggers';
export { default as useEffectResolution } from './useEffectResolution';
export { default as useAttackHelpers } from './useAttackHelpers';
export { default as useGameSetup } from './useGameSetup';
export { default as usePhaseActions } from './usePhaseActions';
export { default as usePlayCard } from './usePlayCard';
