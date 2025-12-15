# Engine API Reference

This document describes the engine's public API, including exports, event system, and prompt payload schemas.

## Table of Contents

1. [Exports](#exports)
2. [Event System](#event-system)
3. [Prompt System](#prompt-system)
4. [Prompt Payload Schemas](#prompt-payload-schemas)
5. [State Adapters](#state-adapters)

---

## Exports

The engine facade (`src/engine/index.js`) exports:

### Card Data
- `getCardMeta(cardId)` - Get card metadata (power, cost, keywords, etc.)
- `loadCardData()` - Initialize card data loading (async)
- `isCardDataLoaded()` - Check if card data is loaded

### Card Statistics
- `getTotalPower(gameState, instanceId, options)` - Compute total power with modifiers
  - `options.isOwnerTurn` (boolean) - If true, DON bonuses apply
  - `options.fallbackBase` (number) - Base power if instance has none
- `getKeywordsFor(instanceOrCardId)` - Get keywords for a card
- `hasDisabledKeyword(side, section, keyName, index, keyword)` - Check if keyword is disabled (stub)

### Event Bus
- `on(eventName, handler)` - Subscribe to engine events
- `off(eventName, handler)` - Unsubscribe from events
- `emit(eventName, payload)` - Emit an event

### Prompt API
- `registerPromptHandler(name, handler)` - Register a prompt handler
- `unregisterPromptHandler(name)` - Remove a prompt handler
- `prompt(name, payload)` - Call a prompt handler (returns Promise)
- `hasPromptHandler(name)` - Check if a handler is registered

### State Utilities
- `getGameStateSnapshot(gameState)` - Deep clone gameState for safe reads

---

## Event System

The engine emits events via an internal EventEmitter. UI components can subscribe using `engine.on()`.

### Core Events

| Event | Payload | Description |
|-------|---------|-------------|
| `prompt` | `{ prompt }` | A prompt is waiting for user response |
| `promptAnswered` | `{ promptId, playerId, selection }` | A prompt was answered |
| `promptCancelled` | `{ promptId, reason }` | A prompt was cancelled |
| `promptTimedOut` | `{ promptId, playerId, reason }` | A prompt timed out |
| `stateChange` | `{ gameState }` | Game state changed (future) |

### Game Events

| Event | Payload | Description |
|-------|---------|-------------|
| `event:damage` | `{ gameState, side, amount, triggers }` | Damage was dealt |
| `event:defeat` | `{ gameState, loser }` | A player lost (0 life) |
| `event:triggerActivated` | `{ gameState, side, instanceId }` | A trigger was activated |

---

## Prompt System

The prompt system enables interactive game choices. When the engine needs player input, it:

1. Calls `engine.prompt(name, payload)` 
2. Default handlers forward to `promptManager.requestChoice()`
3. `promptManager` emits `engine.emit('prompt', { prompt })`
4. UI receives the event and displays a dialog
5. User makes selection, UI calls `promptManager.submitChoice(promptId, playerId, selection)`
6. The `engine.prompt()` Promise resolves with the selection

### PromptManager API (`src/engine/core/promptManager.js`)

```js
// Request a choice from a player
const { promptId, promise } = promptManager.requestChoice(
  gameState,    // Current game state
  playerId,     // 'player' or 'opponent'
  choiceSpec,   // Payload with choice options
  { timeoutMs: 30000 }  // Optional timeout
);

// Submit a choice
promptManager.submitChoice(promptId, playerId, selection);

// Cancel a prompt
promptManager.cancelPrompt(promptId, 'reason');

// Get pending prompts (debugging)
promptManager.getPendingPrompts();
```

### Prompt Object Shape

When emitted via `engine.emit('prompt', { prompt })`, the prompt object contains:

```js
{
  id: 'prompt-1234567890-0',     // Unique prompt ID
  playerId: 'player',            // Who should answer
  choiceSpec: { ... },           // The payload (type-specific)
  createdAt: 1702684800000,      // Timestamp
  timeoutMs: null,               // Timeout in ms or null
  gameSnapshot: { ... }          // Read-only game state snapshot
}
```

---

## Prompt Payload Schemas

The engine uses four main prompt types. Each has a specific payload structure that the UI must handle.

### Counter Prompt (`'counter'`)

**When:** During Counter Step, defender can use counter cards to boost power.

**Payload (choiceSpec):**
```js
{
  gameState: { ... },           // Game state snapshot
  battleId: 'battle-123',       // Current battle ID
  defenderOwner: 'player',      // Who is defending
  targetInstanceId: 'i-5',      // Instance being attacked
  
  // Counter cards in hand (trash to add counter value)
  handCounterCandidates: [
    {
      instanceId: 'i-10',
      cardId: 'OP01-020',
      printedName: 'Nami',
      counter: 2000           // Power added when trashed
    }
  ],
  
  // Event cards with Counter timing (activate ability)
  eventCounterCandidates: [
    {
      instanceId: 'i-15',
      cardId: 'OP01-030',
      printedName: 'Gum-Gum Pistol',
      costDesc: '1',
      printedText: 'Counter: ...'
    }
  ]
}
```

**Expected Response:**
```js
{
  trashedHandIds: ['i-10'],        // Hand cards to trash
  activatedEventIds: ['i-15']     // Event cards to activate
}
```

---

### Blocker Prompt (`'blocker'`)

**When:** During Block Step, defender can choose a Blocker to intercept.

**Payload (choiceSpec):**
```js
{
  gameState: { ... },
  battleId: 'battle-123',
  attackerInstanceId: 'i-3',
  targetInstanceId: 'i-5',        // Original target (leader/char)
  defenderOwner: 'player',
  
  blockers: [
    {
      instanceId: 'i-8',
      cardId: 'OP01-012',
      printedName: 'Chopper',
      basePower: 3000,
      keywords: ['Blocker']
    }
  ]
}
```

**Expected Response:**
```js
{
  chosenBlockerId: 'i-8'    // null to skip blocking
}
```

---

### Life Trigger Prompt (`'lifeTrigger'`)

**When:** Life card with Trigger is revealed during damage.

**Payload (choiceSpec):**
```js
{
  gameState: { ... },
  side: 'player',             // Whose life was hit
  
  lifeCard: {
    instanceId: 'i-20',
    cardId: 'OP01-025',
    printedName: 'Luffy',
    hasTrigger: true,
    printedText: '[Trigger] Draw 1 card.'
  }
}
```

**Expected Response:**
```js
{
  action: 'activate'    // or 'addToHand'
}
```

---

### Replacement Prompt (`'replacement'`)

**When:** A replacement effect can modify an event before it resolves.

**Payload (choiceSpec):**
```js
{
  gameState: { ... },
  eventName: 'ko',            // The event being replaced
  
  replacements: [
    {
      id: 'repl-1',
      sourceInstanceId: 'i-12',
      ownerId: 'player',
      description: 'Instead of being KO\'d, return to hand.',
      actions: [...]          // Engine actions for replacement
    }
  ]
}
```

**Expected Response:**
```js
{
  accept: true,                       // false to decline
  chosenReplacementId: 'repl-1'      // If multiple replacements
}
```

---

## State Adapters

The UI uses an `areas` state structure organized by visual layout. The engine uses `gameState` organized by zones. Adapters convert between them.

### UI Areas → Engine GameState

```js
import { convertAreasToGameState } from './hooks/engineAdapter';

const gameState = convertAreasToGameState(areas, {
  turnSide: 'player',
  turnNumber: 1,
  phase: 'Main'
});
```

### Engine GameState → UI Areas

```js
import { convertGameStateToAreas } from './hooks/engineAdapter';

const areas = convertGameStateToAreas(gameState);
```

### Areas Structure

```js
{
  player: {
    top: { don: [], cost: [] },
    middle: { deck: [], leader: [], stage: [], leaderDon: [] },
    bottom: { hand: [], don: [], cost: [] },
    life: [],
    trash: [],
    char: [],
    charDon: []
  },
  opponent: { /* mirrored */ }
}
```

### GameState Structure

```js
{
  nextInstanceId: 1,
  turnNumber: 1,
  turnPlayer: 'player',
  phase: 'Main',
  players: {
    player: {
      id: 'player',
      leader: CardInstance | null,
      deck: CardInstance[],
      donDeck: CardInstance[],
      hand: CardInstance[],
      trash: CardInstance[],
      char: CardInstance[],
      stage: CardInstance | null,
      costArea: CardInstance[],
      life: CardInstance[]
    },
    opponent: { /* same shape */ }
  },
  continuousEffects: [],
  metadata: {}
}
```

### CardInstance Shape

```js
{
  instanceId: 'i-1',
  cardId: 'OP01-001',
  owner: 'player',
  zone: 'char',
  faceUp: true,
  givenDon: 0,
  basePower: 5000,
  printedName: 'Luffy',
  keywords: ['Rush'],
  state: 'active'   // or 'rested'
}
```
