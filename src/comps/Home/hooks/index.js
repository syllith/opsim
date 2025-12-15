/**
 * Hooks Index
 * 
 * These hooks serve as the React integration layer between UI and engine.
 * They are NOT game logic - they are React state wrappers that:
 * 1. Hold state that triggers re-renders
 * 2. Will subscribe to engine events when engine is implemented
 * 3. Provide UI-specific state (hover, selection, etc.)
 * 
 * ARCHITECTURE:
 * ┌──────────────────────────────────────────────────┐
 * │  React UI Components (Board.jsx, Actions.jsx)    │
 * ├──────────────────────────────────────────────────┤
 * │  React Hooks (this folder)                       │
 * │  - useBoard: zones state → re-renders            │
 * │  - useTurn: turn/phase state → re-renders        │
 * │  - useCards: card data loading + UI hover        │
 * │  - useMultiplayer: network layer (Socket.io)     │
 * ├──────────────────────────────────────────────────┤
 * │  Engine Façade (src/engine/index.js)             │
 * │  - All game logic lives here                     │
 * │  - Hooks call engine.actions.*                   │
 * │  - Engine emits events, hooks update React state │
 * └──────────────────────────────────────────────────┘
 * 
 * STUB hooks below will be removed once engine is complete.
 */

// =============================================================================
// REACT STATE WRAPPERS (permanent - needed for React re-renders)
// =============================================================================
export { default as useBoard } from './useBoard';      // Zones state
export { default as useTurn } from './useTurn';        // Turn/phase state
export { default as useCards } from './useCards';      // Card data + UI hover
export { useMultiplayer } from './useMultiplayer';     // Network layer

// =============================================================================
// STUB HOOKS (temporary - will be replaced by engine calls)
// =============================================================================
export { default as useCardStats } from './useCardStats';
export { default as useOpeningHands } from './useOpeningHands';
export { useDeckInitializer, createInitialAreas } from './useDeckInitializer';
export { default as useGameSetup } from './useGameSetup';

// =============================================================================
// ZONE UTILITIES (read-only helpers for UI, mutations are stubs)
// =============================================================================
export * from './areasUtils';

// =============================================================================
// TODO: ENGINE INTEGRATION
// =============================================================================
// When engine is ready, add:
// export { useEngine } from './useEngine';
// - Initializes engine, provides engine instance to UI
// - Subscribes to engine events, updates React state
// - Example: engine.on('stateChange', (state) => setAreas(state.zones))


