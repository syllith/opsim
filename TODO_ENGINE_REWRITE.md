# Engine Rewrite TODO

## UI Cleanup Summary (Completed)

The old mechanics have been removed from `src/comps/Home/`. The UI structure is preserved
but game logic is stubbed out. Here's what was removed:

### Removed Files
- `actionMechanics.js` - 906 lines of ability evaluation/targeting logic
- `abilityRenderer.js` - Ability component dispatch
- `abilities/` folder - All ability UI components (UnifiedAbility, CounterAbility, etc.)
- `AbilityList.jsx`, `DefaultAbility.jsx`, `TargetSelectionUI.jsx` - Ability UI

### Removed Hooks
- `useModifiers.js` - Power/cost modifiers, temp keywords
- `useTargeting.js` - Target selection state machine
- `useEffectResolution.js` - Replacement effects, effect KO
- `useTriggers.js` - Trigger card mechanics
- `useAttackHelpers.js` - Attack locking, once-per-turn tracking
- `usePhaseActions.js` - Phase transitions, DON/draw logic
- `usePlayCard.js` - Card playing logic
- `useGameActions.js` - Draw, rest, deck search
- `useBroadcastSoon.js` - Multiplayer sync helper

### Preserved (UI Only)
- `Home.jsx` - Simplified main component with stubs
- `Board.jsx` - Board layout rendering
- `Actions.jsx` - Card info panel (abilities display only, no activation)
- `Battle.jsx` - Stub hook with no-op functions
- `Don.jsx` - Stub with DON deck init and phase gain only
- `Activity.jsx`, `CardViewer.jsx`, `DeckSearch.jsx`, `OpeningHand.jsx` - UI components
- `hooks/useBoard.js`, `useTurn.js`, `useCards.js`, `useDeckInitializer.js` - Core UI state
- `hooks/useCardStats.js` - Card metadata access (power mod stubbed)
- `hooks/useMultiplayer.js`, `useOpeningHands.js`, `useGameSetup.js` - Setup/multiplayer

---

## Priority Implementation Order

### Phase 1: Foundation (Critical Path)

- [ ] **1. GameState Core** (`src/engine/core/gameState.js`)
  - Define GameState schema
  - Implement createInitialState()
  - Implement getCardById() and zone accessors
  - Test state immutability

- [ ] **2. Zone Operations** (`src/engine/core/zones.js`)
  - Implement all zone enumeration
  - Implement findCardZone()
  - Implement moveCard() (internal)
  - Test zone boundary conditions

- [ ] **3. RNG System** (`src/engine/rng/rng.js`)
  - Verify LCG implementation
  - Implement proper Fisher-Yates shuffle
  - Test determinism (same seed = same results)
  - Integrate with deck shuffle

### Phase 2: Card Data & Modifiers

- [ ] **4. Card Meta Access**
  - Wire up `src/data/cards/loader.js`
  - Implement getCardMeta() in façade
  - Cache card data efficiently

- [ ] **5. Continuous Effects** (`src/engine/modifiers/continuousEffects.js`)
  - Implement modifier registration
  - Implement calculatePower() aggregation
  - Handle temporal scopes (turn, phase, permanent)

- [ ] **6. DON Manager** (`src/engine/modifiers/donManager.js`)
  - Implement DON attachment tracking
  - Implement power bonus calculation
  - Integrate with continuous effects

- [ ] **7. Keyword Manager** (`src/engine/modifiers/keywordManager.js`)
  - Implement keyword state tracking
  - Implement disable mechanism
  - Handle keyword source priorities

### Phase 3: Core Actions

- [ ] **8. Move Card Action** (`src/engine/actions/moveCard.js`)
  - Implement all zone transitions
  - Handle face-up/face-down state
  - Fire appropriate events

- [ ] **9. DON Actions** 
  - `giveDon.js`: Transfer DON to field
  - `attachDon.js`: Attach DON to card
  - `returnDon.js`: Return to deck

- [ ] **10. Stat Modification** (`src/engine/actions/modifyStat.js`)
  - Implement power modification
  - Integrate with continuous effects
  - Handle temporal scopes

- [ ] **11. Keyword Effects** (`src/engine/actions/keywordEffect.js`)
  - Implement grant keyword
  - Implement disable keyword
  - Integrate with keyword manager

### Phase 4: Game Flow

- [ ] **12. Turn Controller** (`src/engine/core/turnController.js`)
  - Implement phase enumeration
  - Implement phase transitions
  - Fire phase events
  - Handle turn structure

- [ ] **13. Battle Resolution** (`src/engine/core/battle.js`)
  - Implement declareAttack()
  - Implement declareBattleTarget()
  - Implement declareBlocker()
  - Implement resolveBattle()

- [ ] **14. Damage & Life** (`src/engine/core/damageAndLife.js`)
  - Implement damage dealing
  - Implement life check
  - Implement trigger queuing

- [ ] **15. KO Processing** (`src/engine/core/ko.js`)
  - Implement KO queue
  - Integrate with trash movement
  - Handle on-KO triggers

### Phase 5: Advanced Features

- [ ] **16. Selector** (`src/engine/rules/selector.js`)
  - Implement all target types
  - Implement filter evaluation
  - Implement quantity constraints

- [ ] **17. Expression Evaluator** (`src/engine/rules/expressions.js`)
  - Implement condition evaluation
  - Implement filter evaluation
  - Integrate with selector

- [ ] **18. Ability Evaluator** (`src/engine/rules/evaluator.js`)
  - Implement trigger detection
  - Implement cost checking
  - Implement timing rules

- [ ] **19. Replacement Effects** (`src/engine/core/replacement.js`)
  - Implement replacement registration
  - Implement event interception
  - Handle replacement chains

### Phase 6: Search & Complex Actions

- [ ] **20. Search System** (`src/engine/actions/search.js`)
  - Implement deck search
  - Implement trash search
  - Handle look/reveal mechanics

- [ ] **21. Play Card** (`src/engine/actions/playCard.js`)
  - Implement cost payment
  - Implement card placement
  - Handle on-play triggers

- [ ] **22. Deal Damage** (`src/engine/actions/dealDamage.js`)
  - Implement damage dealing
  - Integrate with life checks
  - Fire damage events

- [ ] **23. KO Action** (`src/engine/actions/koAction.js`)
  - Implement effect-based KO
  - Queue to KO system
  - Handle KO triggers

### Phase 7: Persistence & Polish

- [ ] **24. Logger** (`src/engine/persistence/logger.js`)
  - Implement structured logging
  - Format for display
  - Integration with UI activity log

- [ ] **25. Replay System** (`src/engine/persistence/replay.js`)
  - Implement snapshot creation
  - Implement replay playback
  - Test full game replay

### Phase 8: Integration

- [ ] **26. Façade Wiring** (`src/engine/index.js`)
  - Wire all public API methods
  - Ensure consistent error handling
  - Add logging to all public calls

- [ ] **27. UI Integration**
  - Update `src/comps/Home/*.jsx` to use new engine
  - Preserve existing UI behavior
  - Test all user interactions

- [ ] **28. Full Game Testing**
  - Test complete game flow
  - Test edge cases (empty deck, no blockers, etc.)
  - Verify deterministic replay

---

## Implementation Notes

### Dependency Order
1-3 must be done first (no dependencies)
4-7 can be parallelized after 1-3
8-11 require 1-3, 5-7
12-15 require 8-11
16-19 can be parallelized with 12-15
20-23 require 16-19
24-25 can be done anytime
26-28 are final integration

### Testing Strategy
- Unit tests for each module
- Integration tests for action sequences
- Full game tests for end-to-end validation
- Replay tests for determinism

### Key Invariants to Maintain
- GameState is always immutable
- All actions return new state
- RNG is deterministic from seed
- Events fire in predictable order
- Zone card counts are always correct
