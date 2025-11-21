# One Piece TCG Simulator - Application Flow Chart

## Overview
This document provides a comprehensive flowchart of how the One Piece Trading Card Game Simulator application works, from startup to gameplay.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYERS                           │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + Vite)          Backend (Express + MongoDB)   │
│  ├─ UI Components                 ├─ REST API Endpoints         │
│  ├─ Game State Management         ├─ Session Management         │
│  ├─ Card Data Loader              ├─ User Authentication        │
│  └─ Ability System                └─ Deck Storage               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Application Startup Flow

### 1. Server Initialization (`server.js`)

```
START SERVER
    ↓
[Load Environment Variables (.env)]
    ├─ MONGO_URL (Database connection)
    ├─ SESSION_SECRET (Session encryption)
    └─ CARDS_DIR (Card assets location)
    ↓
[Connect to MongoDB]
    ├─ Retry logic with 5s intervals
    ├─ Store sessions in "opsim_sessions" database
    └─ Store user data in "opsim" database
    ↓
[Configure Express Middleware]
    ├─ Body Parser (JSON/URL-encoded, 50GB limit)
    ├─ Session Management (30-day cookie expiration)
    └─ Static File Serving (/api/cards/assets)
    ↓
[Register API Routes]
    ├─ Authentication Routes
    │   ├─ POST /api/register
    │   ├─ POST /api/login
    │   ├─ GET  /api/logout
    │   └─ GET  /api/checkLoginStatus
    ├─ Card Asset Routes
    │   ├─ GET /api/cards/all (List all cards)
    │   ├─ GET /api/cards/data (Get card metadata JSON)
    │   ├─ GET /api/cards/:set (List cards in set)
    │   ├─ GET /api/cardSets (List available sets)
    │   └─ POST /api/cards/save (Save edited card data)
    └─ Deck Management Routes
        ├─ GET /api/decks (List user's decks)
        ├─ GET /api/decks/:name (Get specific deck)
        ├─ POST /api/decks/save (Save/update deck)
        └─ DELETE /api/decks/:name (Delete deck)
    ↓
[Listen on Port 5583]
    └─ Server ready to accept requests
```

### 2. Frontend Initialization (`main.jsx` → `App.jsx`)

```
LOAD APPLICATION
    ↓
[React Root Render (main.jsx)]
    └─ Mount <App /> component
    ↓
[App Component Initialization]
    ├─ Apply Material-UI Theme (theme.jsx)
    ├─ Initialize React Router
    ├─ Wrap with AuthProvider context
    └─ Define Routes
        └─ Route "/" → <Home />
    ↓
[AuthContext Initialization (AuthContext.jsx)]
    ├─ Initialize state:
    │   ├─ isLoggedIn: undefined (until checked)
    │   ├─ user: null
    │   ├─ userSettings: { theme: 'light' }
    │   └─ loading: true
    ├─ Check login status on mount:
    │   GET /api/checkLoginStatus
    │       ├─ Success (200) → Set user info & settings
    │       └─ Failure (401) → Set logged out state
    └─ Provide context to all children:
        ├─ isLoggedIn, user, userSettings
        ├─ setters for manual state changes
        ├─ logout() function
        └─ updateUserSettings() function
```

---

## 🎮 User Flow

### Login/Registration Flow

```
USER VISITS APPLICATION
    ↓
[Home Component Loads]
    ↓
Check AuthContext.isLoggedIn
    ├─ TRUE → Show Game Interface
    └─ FALSE → Show Login/Register Form
        ↓
    [User Chooses Action]
        ├─ Register
        │   ├─ Enter username, password, password confirm
        │   ├─ Validation:
        │   │   ├─ Username: 3-20 chars, alphanumeric + _ -
        │   │   ├─ Password: 8-64 chars, matching confirmation
        │   │   └─ Unique username check
        │   ├─ POST /api/register
        │   │   ├─ Hash password with bcrypt (10 rounds)
        │   │   ├─ Create user document in MongoDB
        │   │   └─ Create session cookie
        │   └─ Success → Update AuthContext → Show Game
        │
        └─ Login
            ├─ Enter username, password
            ├─ POST /api/login
            │   ├─ Lookup user by username (case-insensitive)
            │   ├─ Compare password hash with bcrypt
            │   └─ Create session cookie
            └─ Success → Update AuthContext → Show Game
```

### Logout Flow

```
USER CLICKS LOGOUT
    ↓
[Call AuthContext.logout()]
    ↓
[GET /api/logout]
    ├─ Destroy session on server
    └─ Clear session cookie
    ↓
[Reset AuthContext State]
    ├─ isLoggedIn: false
    ├─ user: null
    └─ userSettings: { theme: 'light' }
    ↓
[Show Login/Register Form]
```

---

## 🃏 Card Data Loading Flow

### Card Assets Loading

```
[Home Component Mounts]
    ↓
[Load Card Metadata (loader.js)]
    ├─ Parse JSON files from src/data/cards/
    ├─ Build card index by ID
    └─ Store in metaById Map
    ↓
[Load Card Images (API call)]
    └─ GET /api/cardsAll
        ↓
    [Server: Walk public/cards directory]
        ├─ Recursively scan all subdirectories
        ├─ Find image files (.png, .jpg)
        ├─ Pair full-size with thumbnails:
        │   ├─ Full: {set}/{id}.png
        │   └─ Thumb: {set}/{id}_small.png or _small.jpg
        └─ Return array of card objects:
            {
                id: "OP01-001",
                number: 1,
                full: "/api/cards/assets/OP01/OP01-001.png",
                thumb: "/api/cards/assets/OP01/OP01-001_small.png"
            }
    ↓
[Store in allCards state]
    └─ Available for deck building & gameplay
```

### Card Metadata Structure

```
Card JSON Schema (schema.json)
    ├─ id: "OP01-001"
    ├─ name: "Character Name"
    ├─ set: "OP01"
    ├─ category: "Character" | "Event" | "Stage"
    ├─ color: ["Red", "Green", "Blue", "Yellow", "Purple", "Black"]
    ├─ stats:
    │   ├─ cost: 4 (DON!! cost to play)
    │   ├─ power: 5000 (base power)
    │   ├─ life: 5 (for Leaders only)
    │   └─ counter: { present: true, value: 1000 }
    ├─ keywords: ["Rush", "Blocker", "Double Attack", ...]
    ├─ abilities: [
    │   {
    │       type: "On Play" | "When Attacking" | "Activate Main",
    │       frequency: "Once Per Turn" | null,
    │       effect: {
    │           text: "Human-readable effect",
    │           actions: [ /* Structured action schema */ ]
    │       },
    │       cost: {
    │           don: 2, // Rest 2 DON!! from cost area
    │           returnToDeck: true, // Return this card
    │           restThis: true, // Rest this card
    │           payLife: 1, // Pay 1 life
    │           trashFromHand: 1 // Trash from hand
    │       }
    │   }
    │ ]
    └─ verified: true (human-verified accuracy)
```

---

## 🏗️ Deck Building Flow

```
USER OPENS DECK BUILDER
    ↓
[DeckBuilder Component Loads]
    ↓
[Load User's Decks]
    └─ GET /api/decks
        └─ Returns list of deck summaries
    ↓
[User Actions]
    ├─ Create New Deck
    │   ├─ Select Leader card
    │   ├─ Add cards (max 4 copies each)
    │   ├─ Must total exactly 50 cards
    │   └─ Validate deck composition
    │
    ├─ Edit Existing Deck
    │   ├─ GET /api/decks/:name
    │   ├─ Load deck items & leader
    │   └─ Modify cards
    │
    ├─ Import from Text
    │   ├─ Parse deck list format:
    │   │   "4x OP01-001 Card Name"
    │   ├─ Validate card IDs
    │   └─ Build deck structure
    │
    └─ Save Deck
        ├─ Validate:
        │   ├─ Exactly 50 cards
        │   ├─ Max 4 of each card
        │   ├─ Leader selected
        │   └─ Valid card IDs
        ├─ POST /api/decks/save
        │   {
        │       name: "My Deck",
        │       leaderId: "OP01-001",
        │       items: [
        │           { id: "OP01-002", count: 4 },
        │           { id: "OP01-003", count: 3 },
        │           ...
        │       ]
        │   }
        └─ Store in MongoDB (upsert by username + name)
```

### Card Search & Filter

```
[Search Interface]
    ↓
[Available Filters]
    ├─ Text Search (name, ID, effect text)
    ├─ Color (Red, Green, Blue, Yellow, Purple, Black)
    ├─ Category (Character, Event, Stage)
    ├─ Cost (0-10)
    ├─ Power Range
    ├─ Keywords (Rush, Blocker, etc.)
    ├─ Set (OP01, OP02, EB01, etc.)
    └─ Attributes/Traits
    ↓
[Apply Filters]
    ├─ Filter allCards array in memory
    ├─ Sort by relevance/cost/power
    └─ Display paginated results
    ↓
[Card Interaction]
    ├─ Click card → Add to deck
    ├─ Hover → Show preview (CardViewer)
    └─ Edit Mode → Open card editor (admin)
```

---

## 🎲 Game Flow

### Game Initialization

```
USER LOADS HOME (Logged In)
    ↓
[Initialize Game State]
    ↓
[Load Most Recent Deck]
    └─ GET /api/decks (sorted by updatedAt)
        └─ GET /api/decks/:name for full deck
    ↓
[Setup Game Areas]
    ├─ Opponent Areas:
    │   ├─ top: { hand: [], trash: [], cost: [], don: [] }
    │   ├─ middle: { deck: [], stage: [], leader: [], leaderDon: [] }
    │   ├─ char: [] (5 max)
    │   ├─ charDon: [] (DON!! under characters)
    │   └─ life: [] (5 cards face-down)
    │
    └─ Player Areas:
        ├─ life: [] (5 cards face-down)
        ├─ char: [] (5 max)
        ├─ charDon: [] (DON!! under characters)
        ├─ middle: { leader: [], leaderDon: [], stage: [], deck: [] }
        └─ bottom: { hand: [], don: [], cost: [], trash: [] }
    ↓
[Build Library (Deck Order)]
    ├─ Expand deck items (e.g., "4x OP01-001" → 4 entries)
    ├─ Shuffle deck using Fisher-Yates algorithm
    ├─ Store as library array (top = last element)
    └─ Mirror for opponent (same deck, shuffled separately)
    ↓
[Place Leaders]
    ├─ Get leader asset from deck.leaderId
    ├─ Place in middle.leader for both sides
    └─ Set rested: false
    ↓
[Initialize DON!! Decks]
    ├─ 10 DON!! cards per player
    ├─ Store in don area (face-down)
    └─ Track as DON_BACK objects
    ↓
[Draw Opening Hands]
    ├─ Player: Draw top 5 from library
    ├─ Opponent: Draw top 5 (visible for testing)
    └─ Show Opening Hand Modal
```

### Opening Hand (Mulligan Phase)

```
[Opening Hand Modal Displayed]
    ↓
[Player Choices]
    ├─ Keep Hand
    │   ├─ Move 5 cards to hand area
    │   ├─ Next 5 cards → Life area (face-down)
    │   ├─ Update deck visuals (-10 cards)
    │   └─ Proceed to Turn 1
    │
    └─ Mulligan (once only)
        ├─ Put current 5 to bottom of deck
        ├─ Draw new top 5
        ├─ Must keep new hand
        └─ Proceed to Turn 1
```

### Turn Structure (Rule 6)

```
TURN CYCLE
    ↓
┌─────────────────────────────────────────┐
│  1. REFRESH PHASE (Rule 6-2)            │
│     ├─ End "until start of turn" effects│
│     ├─ Trigger "at start of turn" effects│
│     ├─ Return DON!! from Leaders/Chars  │
│     │   to cost area (rested)           │
│     └─ Untap all cards (active state)   │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  2. DRAW PHASE (Rule 6-3)               │
│     └─ Draw 1 card from deck to hand    │
│        (Skip on Turn 1)                 │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  3. DON!! PHASE (Rule 6-4)              │
│     ├─ Add 2 DON!! from don deck to     │
│     │  cost area (active state)         │
│     ├─ Exception: Turn 1 = only 1 DON!! │
│     └─ Handle DON!! deck depletion:     │
│         ├─ 0 cards = place none         │
│         └─ 1 card = place 1 only        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  4. MAIN PHASE (Rule 6-5)               │
│     ├─ Play cards from hand             │
│     │   ├─ Pay cost (rest DON!!)        │
│     │   ├─ Place in character area      │
│     │   └─ Trigger "On Play" effects    │
│     ├─ Give DON!! to Leaders/Characters │
│     │   (grants +1000 power per DON)    │
│     ├─ Activate abilities               │
│     │   (Main, Trigger, etc.)           │
│     └─ Attack with Characters/Leader    │
│         └─ Enter Battle Sequence ↓      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  5. END PHASE (Rule 6-6)                │
│     ├─ Trigger "at end of turn" effects │
│     ├─ Check defeat conditions          │
│     └─ Pass turn to opponent            │
└─────────────────────────────────────────┘
```

### Battle Sequence (Rule 7-1)

```
DECLARE ATTACK
    ↓
[Attack Step 7-1-1]
    ├─ Select attacking Character or Leader
    ├─ Must be active (not rested)
    ├─ Restrictions:
    │   ├─ No attacks on Turn 1 or 2 (unless Rush)
    │   ├─ Can't attack turn played (unless Rush)
    │   └─ Only on your turn, Main Phase
    ├─ Rest attacker immediately
    └─ Select target:
        ├─ Opponent's Leader (always valid)
        └─ Opponent's rested Character
    ↓
[Block Step 7-1-2]
    ├─ Defending player may activate [Blocker]
    ├─ Blocker must be:
    │   ├─ Active (not rested)
    │   ├─ Have [Blocker] keyword
    │   └─ Not disabled by effect
    ├─ Rest blocker → Becomes new target
    └─ If no blocker → Continue
    ↓
[Counter Step 7-1-3]
    ├─ Defending player may play counters:
    │   ├─ Counter value from card stats
    │   ├─ Trash card from hand
    │   └─ Add counter power to defender
    ├─ Defending player may play Event Counters:
    │   ├─ Event cards with [Counter] keyword
    │   ├─ Pay cost (rest DON!!)
    │   └─ Resolve effect
    └─ Multiple counters allowed
    ↓
[Damage Step 7-1-4]
    ├─ Compare final power:
    │   ├─ Attacker power (base + mods + DON!!)
    │   └─ Defender power (base + mods + DON!! + counter)
    ├─ If Attacker >= Defender:
    │   ├─ Target is Leader → Deal 1 damage
    │   │   ├─ Move top Life to hand
    │   │   └─ Check [Trigger] keyword:
    │   │       ├─ Activate → Resolve effect, trash
    │   │       └─ Decline → Add to hand
    │   └─ Target is Character → K.O. (trash)
    │       └─ Return DON!! to cost area (rested)
    └─ If Attacker < Defender:
        └─ No damage dealt
    ↓
[End Battle]
    ├─ Clear battle state
    ├─ Clear counter power (temporary)
    └─ Return to Main Phase
```

### Ability Activation Flow

```
PLAYER CLICKS CARD
    ↓
[Actions Panel Opens (Actions.jsx)]
    ↓
[Display Card Information]
    ├─ Name, ID, Category
    ├─ Stats (Cost, Power, Life, Counter)
    ├─ Keywords (Rush, Blocker, etc.)
    └─ Abilities with activation controls
    ↓
[Evaluate Activatable Abilities]
    ├─ Check timing:
    │   ├─ On Play → Auto-trigger when played
    │   ├─ When Attacking → During Attack Step
    │   ├─ Activate Main → Main Phase only
    │   ├─ Blocker → Block Step only
    │   └─ Trigger → When taking damage
    ├─ Check frequency:
    │   ├─ Once Per Turn → Track usage
    │   └─ Multiple Uses → Always available
    ├─ Check conditions:
    │   ├─ Your turn / opponent's turn
    │   ├─ Phase requirements
    │   └─ Battle state
    ├─ Check costs:
    │   ├─ DON!! available in cost area
    │   ├─ Life to pay
    │   └─ Cards in hand to trash
    └─ Check targets available
    ↓
[Player Selects Ability]
    ↓
[Process Structured Actions]
    └─ Ability effects use action schema:
        {
            type: "powerMod" | "KO" | "search" | "draw" | ...,
            targetSide: "player" | "opponent" | "both",
            targetType: "leader" | "character" | "any",
            minTargets: 0,
            maxTargets: 1,
            amount: +2000,
            duration: "thisTurn" | "untilOpponentsNextTurn",
            filter: { powerRange: [0, 4999], ... }
        }
    ↓
[Action Execution Sequence]
    ├─ For each action in ability.effect.actions:
    │   ├─ powerMod → Apply power modifier
    │   │   ├─ Start targeting UI (if needed)
    │   │   ├─ Validate targets
    │   │   ├─ Apply modifier with expiry
    │   │   └─ Register cleanup for Refresh Phase
    │   │
    │   ├─ KO → Remove cards from field
    │   │   ├─ Start targeting UI
    │   │   ├─ Validate targets
    │   │   ├─ Check replacement effects
    │   │   └─ Move to trash, return DON!!
    │   │
    │   ├─ search → Look at deck
    │   │   ├─ Open Deck Search modal
    │   │   ├─ Show top N cards
    │   │   ├─ Allow selection (min/max)
    │   │   ├─ Apply filters
    │   │   └─ Return/shuffle remainder
    │   │
    │   ├─ draw → Draw cards
    │   ├─ grantKeyword → Add temporary keyword
    │   ├─ disableKeyword → Block keyword use
    │   └─ customEffect → Special handling
    │
    └─ After all actions complete:
        ├─ Pay activation costs
        │   ├─ Rest DON!! from cost area
        │   ├─ Return card to deck
        │   ├─ Rest this card
        │   ├─ Pay life
        │   └─ Trash from hand
        └─ Mark ability as used (if Once Per Turn)
```

### Targeting System

```
START TARGETING
    ↓
[startTargeting() called with config]
    ├─ side: 'player' | 'opponent'
    ├─ section: 'char' | 'middle' | null (multi)
    ├─ keyName: 'char' | 'leader' | null
    ├─ min: 1 (minimum targets)
    ├─ max: 1 (maximum targets)
    ├─ multi: false (single section vs multiple)
    ├─ validator: (card, ctx) => boolean
    ├─ origin: { side, section, keyName, index }
    ├─ abilityIndex: number (for restoration)
    └─ type: 'ability' | 'attack'
    ↓
[UI State Updates]
    ├─ Highlighting valid targets
    ├─ Show crosshair cursor
    ├─ Disable invalid targets (grayscale)
    └─ Display selection count UI
    ↓
[Player Clicks Targets]
    ├─ Validate each click
    ├─ Add to selected array
    ├─ Update outlines (orange highlight)
    └─ Auto-confirm when min reached (if min > 0)
    ↓
[Confirm or Cancel]
    ├─ Confirm → Call onComplete(targets[])
    │   └─ Return to ability resolution
    └─ Cancel → Clear targeting state
        └─ Return to idle
```

### DON!! Giving System (Rule 6-5-5)

```
PLAYER CLICKS ACTIVE DON!! IN COST AREA
    ↓
[Enter DON!! Giving Mode]
    ├─ Highlight DON!! card (yellow outline)
    ├─ Show eligible targets:
    │   ├─ Your Leader (green outline)
    │   └─ Your Characters (green outline)
    └─ Display instruction overlay
    ↓
[Player Clicks Target]
    ├─ Validate:
    │   ├─ Must be Main Phase
    │   ├─ Must be your turn
    │   └─ DON!! must be active (not rested)
    ├─ Remove DON!! from cost area
    ├─ Rest the DON!! card
    └─ Place under target card
    ↓
[Power Calculation]
    ├─ Each DON!! under card = +1000 power
    ├─ Only applies during controller's turn
    └─ Display stacked DON!! visually
    ↓
[Refresh Phase Cleanup]
    └─ Return all given DON!! to cost area (rested)
```

---

## 🎨 UI Components Flow

### Board Component (Board.jsx)

```
[Board Rendering]
    ↓
[Layout Structure]
    ├─ Opponent Areas (Top)
    │   ├─ Row 1: Hand | Trash | Cost | DON!!
    │   ├─ Row 2: Deck | Stage | Leader
    │   └─ Row 3: Characters (5 max) | Life
    │
    └─ Player Areas (Bottom)
        ├─ Row 1: Life | Characters (5 max)
        ├─ Row 2: Leader | Stage | Deck
        └─ Row 3: Hand | DON!! | Cost | Trash
    ↓
[Card Rendering Modes]
    ├─ single → Show top card
    ├─ stacked → Deck pile (offset stack)
    ├─ side-by-side → Characters in row
    ├─ overlap-right → Hand fan
    └─ overlap-vertical → Life stack
    ↓
[Interactive Elements]
    ├─ Card Click → Open Actions panel
    ├─ Card Hover → Show in CardViewer
    ├─ DON!! Click → Enter giving mode
    ├─ Targeting → Highlight valid targets
    └─ Battle Arrow → Visual attack indicator
    ↓
[Visual Indicators]
    ├─ Rested Cards → Rotated 90°
    ├─ Power Modifiers → Overlay badge
    ├─ DON!! Under Cards → Stacked icons
    ├─ Selected Cards → Orange outline
    ├─ Valid Targets → Green outline
    └─ Active Turn → Yellow leader border
```

### CardViewer Component

```
[Hover/Select Card]
    ↓
[CardViewer Shows]
    ├─ Large card image
    ├─ Basic Info:
    │   ├─ Name
    │   ├─ ID
    │   ├─ Category
    │   └─ Set
    ├─ Stats:
    │   ├─ Cost
    │   ├─ Power (with modifiers)
    │   ├─ Life (if Leader)
    │   └─ Counter
    ├─ Keywords (chips)
    ├─ Abilities (expandable)
    └─ Flavor/Attributes
```

### Activity Log Component

```
[Game Events Logged]
    ├─ Turn changes
    ├─ Card plays
    ├─ Ability activations
    ├─ Battle outcomes
    ├─ Damage dealt
    └─ K.O.s
    ↓
[Display Format]
    └─ [T2 player Main] Played OP01-001 by resting 4 DON.
```

---

## 🔄 State Management

### Game State Structure

```javascript
{
    // Turn Management
    turnSide: 'player' | 'opponent',
    turnNumber: 1,
    phase: 'Refresh' | 'Draw' | 'Don' | 'Main' | 'End',
    
    // Board Areas
    areas: {
        player: { life, char, charDon, middle, bottom },
        opponent: { top, middle, char, charDon, life }
    },
    
    // Libraries (Deck Order)
    library: ['OP01-001', 'OP01-002', ...], // player
    oppLibrary: [...], // opponent
    
    // Battle State
    battle: {
        attacker: { side, section, keyName, index, id, power },
        target: { side, section, keyName, index, id },
        step: 'attack' | 'block' | 'counter' | 'damage' | 'end',
        blockerUsed: boolean,
        counterPower: number,
        counterTarget: { side, section, keyName, index }
    },
    
    // Targeting State
    targeting: {
        active: boolean,
        side: 'player' | 'opponent',
        section: string,
        keyName: string,
        min: number,
        max: number,
        validator: function,
        selectedIdx: [],
        multi: boolean,
        selected: [],
        onComplete: function,
        suspended: boolean,
        sessionId: number,
        origin: { side, section, keyName, index },
        abilityIndex: number,
        type: 'ability' | 'attack'
    },
    
    // Effect Tracking
    powerMods: {
        'player:char:char:0': [
            { delta: +2000, expireOnSide: 'opponent' }
        ]
    },
    tempKeywords: { ... },
    disabledKeywords: { ... },
    untilNextTurnEffects: {
        player: [{ description, timestamp }],
        opponent: [...]
    },
    
    // UI State
    openingShown: boolean,
    openingHand: [],
    actionOpen: boolean,
    actionCard: object,
    deckSearchOpen: boolean,
    hovered: object,
    selectedCard: object
}
```

---

## 📡 API Reference

### Authentication Endpoints

```
POST /api/register
    Body: { username, password, passwordConfirm }
    Response: { message, username, settings }
    
POST /api/login
    Body: { username, password }
    Response: { message, username, settings }
    
GET /api/logout
    Response: { message }
    
GET /api/checkLoginStatus
    Response: { isLoggedIn, username, settings }
```

### Card Endpoints

```
GET /api/cardsAll
    Response: { count, cards: [{ id, number, full, thumb }] }
    
GET /api/cards/data
    Response: { count, cards: [/* Full metadata */] }
    
GET /api/cards/:set
    Response: { set, count, cards: [...] }
    
GET /api/cardSets
    Response: { sets: ['OP01', 'OP02', ...] }
    
POST /api/cards/save
    Body: { cardId, cardData }
    Auth: Required
    Response: { message, cardId }
```

### Deck Endpoints

```
GET /api/decks
    Auth: Required
    Response: { decks: [{ name, updatedAt, size, leaderId }] }
    
GET /api/decks/:name
    Auth: Required
    Response: { name, leaderId, items, text, updatedAt }
    
POST /api/decks/save
    Auth: Required
    Body: { name, leaderId, items, text }
    Response: { message, name, size }
    
DELETE /api/decks/:name
    Auth: Required
    Response: { message, name }
```

---

## 🔧 Development Workflow

### Running Development Server

```bash
# Terminal 1: Frontend Dev Server (Vite)
npm run dev
# → Starts at http://localhost:5173
# → Hot module reloading enabled

# Terminal 2: Backend Server (Express)
npm run server
# OR
node server.js
# → Starts at http://localhost:5583
# → Manual restart required for changes
```

### Production Build

```bash
# Build frontend
npm run build
# → Creates dist/ folder with optimized assets

# Start production server
npm start
# → Builds + starts Express server
# → Serves static files from dist/

# Alternative: Use PM2 for process management
pm2 start server.js --name "opsim"
```

### Proxy Configuration (Development)

```
Vite Dev Server (localhost:5173)
    ↓
Proxy /api/* requests
    ↓
Express Backend (localhost:5583)
```

### Nginx Configuration (Production)

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    root /path/to/opsim/dist;
    
    # Proxy API to backend
    location /api {
        proxy_pass http://localhost:5583;
        proxy_set_header Host $http_host;
    }
    
    # Serve React app
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 📂 File Structure Summary

```
opsim/
├── public/cards/          # Card image assets
│   ├── OP01/
│   ├── OP02/
│   └── ...
├── src/
│   ├── main.jsx           # React entry point
│   ├── App.jsx            # Root component, routing
│   ├── AuthContext.jsx    # Authentication context
│   ├── theme.jsx          # Material-UI theme
│   ├── comps/
│   │   ├── Home/
│   │   │   ├── Home.jsx           # Main game component
│   │   │   ├── Board.jsx          # Game board rendering
│   │   │   ├── Actions.jsx        # Ability activation panel
│   │   │   ├── CardViewer.jsx     # Card preview panel
│   │   │   ├── Activity.jsx       # Game log
│   │   │   ├── OpeningHand.jsx    # Mulligan modal
│   │   │   ├── DeckSearch.jsx     # Deck search modal
│   │   │   └── actionMechanics.js # Ability system logic
│   │   ├── DeckBuilder/
│   │   │   └── DeckBuilder.jsx    # Deck building UI
│   │   └── LoginRegister/
│   │       └── LoginRegister.jsx  # Auth forms
│   ├── data/cards/
│   │   ├── loader.js      # Card JSON loader
│   │   ├── schema.json    # Card data schema
│   │   └── OP01/          # Card metadata by set
│   │       ├── OP01-001.json
│   │       └── ...
│   └── utils/
│       ├── deckApi.js     # Deck API helpers
│       └── utils.js       # Utility functions
├── server.js              # Express backend
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
├── .env                   # Environment variables
├── ACTION_SCHEMA.md       # Ability action documentation
├── ABILITY_SYSTEM.md      # Ability system guide
└── readme.md              # Setup instructions
```

---

## 🎯 Key Design Patterns

### 1. Context API for Authentication
- `AuthContext` provides user state globally
- Prevents prop drilling through component tree
- Centralized login/logout logic

### 2. Component Composition
- Large components (Home, Board) broken into sub-components
- Shared components (CardViewer, Actions) reused across features
- Props drilling minimized via callbacks and context

### 3. Structured Action Schema
- Abilities defined as JSON with typed actions
- Declarative effect descriptions
- Centralized action processing in `actionMechanics.js`

### 4. State Colocation
- Game state lives in Home component
- Board receives state as props
- Actions panel operates on callbacks

### 5. Optimistic Updates
- UI updates immediately on user action
- Server validation happens asynchronously
- Error handling reverts state if needed

---

## 🚨 Error Handling

### Frontend
```javascript
try {
    const response = await fetch('/api/endpoint');
    if (!response.ok) throw new Error('Request failed');
    // Process response
} catch (error) {
    console.error('Error:', error);
    // Show user-friendly error message
}
```

### Backend
```javascript
app.post('/api/endpoint', async (req, res) => {
    try {
        // Process request
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
```

---

## 📝 Summary

This One Piece TCG Simulator is a full-stack web application that:

1. **Authenticates users** via bcrypt-hashed passwords and MongoDB sessions
2. **Loads card data** from JSON files and serves images via Express
3. **Enables deck building** with validation and persistence
4. **Simulates gameplay** with comprehensive rule enforcement
5. **Processes complex abilities** via a structured action schema
6. **Provides real-time feedback** through UI state management
7. **Scales efficiently** with proper indexing and optimization

The application follows modern React patterns, uses Material-UI for consistent styling, and implements a robust client-server architecture suitable for both development and production deployment.
