# Engine Module

This directory contains the game engine for the One Piece TCG Simulator. The engine is responsible for all game mechanics, state management, and rules enforcement.

## Architecture

The engine follows a **façade pattern**. All external code (UI components) should import only from `index.js`. The façade delegates to internal modules under `core/`, `actions/`, `modifiers/`, `rules/`, `rng/`, and `persistence/`.

## Key Concepts

- **GameState**: The canonical representation of the game at any moment. Immutable-style updates.
- **Actions**: Discrete operations that mutate state (play card, KO, draw, etc.).
- **Modifiers**: Continuous effects that alter card properties (power, keywords).
- **Selectors**: Queries to find cards matching criteria.
- **Events**: The façade emits events that UI components can subscribe to.

See each module's `.js` file for detailed implementation specifications.
