# Card Ability Action Schema

## Overview

This document defines the **explicit action structure** for card abilities. All fields should contain **direct values**, NOT parseable strings. This ensures the ability system is fully dynamic and doesn't require runtime parsing.

Canonical ability type labels to use in JSON:
- "On Play", "Activate Main", "On Attack", "On Block", "Counter", "On KO", "End of Turn", "Trigger", "Opponents Turn", "Continuous"

Use exactly these labels. Aliases are not supported.

## Core Principles

### ✅ DO: Use Explicit Fields
```json
{
  "type": "powerMod",
  "amount": -2000,
  "targetSide": "opponent",
  "targetType": "character",
  "minTargets": 0,
  "maxTargets": 1,
  "duration": "thisTurn"
}
```

### ❌ DON'T: Use Parseable Strings
```json
{
  "type": "powerMod",
  "quantity": -2000,
  "target": "opponent character",
  "filter": "up to 1",
  "duration": "this turn"
}
```

## Action Types

### 1. Power Modification (`powerMod`)

Modifies the power of cards for a specified duration.

**Required Fields:**
- `type`: `"powerMod"`
- `amount`: `number` - Power change (positive or negative, e.g., `-2000`, `+3000`)
- `targetSide`: `"player" | "opponent" | "both"`
- `targetType`: `"leader" | "character" | "any"`
- `minTargets`: `number` - Minimum number of targets (0 for "up to X")
- `maxTargets`: `number` - Maximum number of targets
- `duration`: `"thisTurn" | "untilEndOfBattle" | "permanent"`

**Optional Fields:**
- `powerLimit`: `number` - Only target cards with power at or below this value

**Example:**
```json
{
  "type": "powerMod",
  "amount": -2000,
  "targetSide": "opponent",
  "targetType": "character",
  "minTargets": 0,
  "maxTargets": 1,
  "duration": "thisTurn"
}
```

### 2. KO/Destroy (`ko`)

Destroys/KOs cards from the field.

**Required Fields:**
- `type`: `"ko"`
- `targetSide`: `"player" | "opponent" | "both"`
- `targetType`: `"leader" | "character" | "any"`
- `minTargets`: `number` - Minimum number of targets (0 for "up to X")
- `maxTargets`: `number` - Maximum number of targets

**Optional Fields:**
- `powerLimit`: `number` - Only target cards with power at or below this value
- `costLimit`: `number` - Only target cards with cost at or below this value

**Example - KO up to 1 opponent character with 3000 power or less:**
```json
{
  "type": "ko",
  "targetSide": "opponent",
  "targetType": "character",
  "minTargets": 0,
  "maxTargets": 1,
  "powerLimit": 3000
}
```

### 3. Draw Cards (`draw`)

Draw cards from deck.

**Required Fields:**
- `type`: `"draw"`
- `quantity`: `number` - Number of cards to draw

**Example:**
```json
{
  "type": "draw",
  "quantity": 2
}
```

### 4. Deck Search (`search`)

Look at cards from deck, select some, and handle remainder.

**Required Fields:**
- `type`: `"search"`
- `lookCount`: `number` - How many cards to look at
- `minSelect`: `number` - Minimum cards to select (0 for "up to X")
- `maxSelect`: `number` - Maximum cards to select
- `destination`: `"hand" | "deck" | "trash" | "field"`
- `remainderLocation`: `"top" | "bottom" | "shuffle"`

**Optional Fields:**
- `filterType`: `string | null` - Card type to filter for (e.g., "Red Hair Pirates")
- `filterColor`: `string | null` - Card color to filter for
- `filterAttribute`: `string | null` - Card attribute to filter for
- `remainderOrder`: `"any" | "same"` - Whether player can reorder remainder

**Note:** The `sourceSide` is automatically determined from the card controller (actionSource.side), NOT specified in JSON. This ensures opponent cards search opponent's deck.

**Example - Look at top 5, select up to 1 Red Hair Pirates card:**
```json
{
  "type": "search",
  "lookCount": 5,
  "filterType": "Red Hair Pirates",
  "minSelect": 0,
  "maxSelect": 1,
  "destination": "hand",
  "remainderLocation": "bottom",
  "remainderOrder": "any"
}
```

### 5. Add DON!! (`addDon`)

Add DON!! cards from DON!! deck.

**Required Fields:**
- `type`: `"addDon"`
- `quantity`: `number` - How many DON!! to add
- `targetSide`: `"player" | "opponent"`

**Example:**
```json
{
  "type": "addDon",
  "quantity": 2,
  "targetSide": "player"
}
```

### 6. Give DON!! to Card (`giveDon`)

Give DON!! from cost area to a card.

**Required Fields:**
- `type`: `"giveDon"`
- `quantity`: `number` - How many DON!! to give
- `targetSide`: `"player" | "opponent"`
- `targetType`: `"leader" | "character" | "any"`
- `minTargets`: `number`
- `maxTargets`: `number`

**Example:**
```json
{
  "type": "giveDon",
  "quantity": 1,
  "targetSide": "player",
  "targetType": "character",
  "minTargets": 1,
  "maxTargets": 1
}
```

### 7. Play Card (`play`)

Play a card from hand or other zone.

**Required Fields:**
- `type`: `"play"`
- `source`: `"hand" | "trash" | "deck"`
- `cardType`: `"Character" | "Event" | "Stage"`

**Optional Fields:**
- `filterType`: `string | null`
- `filterColor`: `string | null`
- `costReduction`: `number` - Cost reduction for playing

**Example:**
```json
{
  "type": "play",
  "source": "trash",
  "cardType": "Character",
  "filterType": "Red Hair Pirates",
  "costReduction": 2
}
```

### 8. Return Card (`return`)

Return cards to hand or deck.

**Required Fields:**
- `type`: `"return"`
- `targetSide`: `"player" | "opponent"`
- `targetType`: `"leader" | "character" | "any"`
- `minTargets`: `number`
- `maxTargets`: `number`
- `destination`: `"hand" | "deckTop" | "deckBottom"`

**Example:**
```json
{
  "type": "return",
  "targetSide": "opponent",
  "targetType": "character",
  "minTargets": 1,
  "maxTargets": 1,
  "destination": "hand"
}
```

### 9. Rest Card (`rest`)

Rest (tap) cards.

**Required Fields:**
- `type`: `"rest"`
- `targetSide`: `"player" | "opponent"`
- `targetType`: `"leader" | "character" | "don" | "any"`
- `minTargets`: `number`
- `maxTargets`: `number`

**Example:**
```json
{
  "type": "rest",
  "targetSide": "opponent",
  "targetType": "don",
  "minTargets": 2,
  "maxTargets": 2
}
```

### 10. Make Active (`active`)

Make rested cards active (untap).

**Required Fields:**
- `type`: `"active"`
- `targetSide`: `"player" | "opponent"`
- `targetType`: `"leader" | "character" | "don" | "any"`
- `minTargets`: `number`
- `maxTargets`: `number`

**Example:**
```json
{
  "type": "active",
  "targetSide": "player",
  "targetType": "character",
  "minTargets": 1,
  "maxTargets": 1
}
```

### 11. Grant Keyword (`grantKeyword`)

Temporarily grants a keyword (e.g., Rush, Blocker) for a duration. Can target specific cards or apply to the action source itself.

**Required Fields:**
- `type`: `"grantKeyword"`
- `keyword`: `string` - The keyword to grant (e.g., `"Rush"`)

**Targeting Options:**
- `targetSelf`: `boolean` - If `true`, applies to the source card (no targeting UI)
- Or use standard targeting fields to select targets:
  - `targetSide`: `"player" | "opponent" | "both"`
  - `targetType`: `"leader" | "character" | "any"`
  - `minTargets`, `maxTargets`

**Duration:**
- `duration`: `"thisTurn" | "untilOpponentsNextTurn" | "permanent"` (default `"thisTurn"`)

**Example – Self Rush this turn:**
```json
{
  "type": "grantKeyword",
  "keyword": "Rush",
  "targetSelf": true,
  "duration": "thisTurn"
}
```

## Complete Card Examples

### Example 1: OP01-006 Otama
Simple On Play power reduction.

```json
{
  "id": "OP01-006",
  "name": "Otama",
  "abilities": [
    {
      "type": "On Play",
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": {
        "text": "Give up to 1 of your opponent's Characters -2000 power during this turn.",
        "actions": [
          {
            "type": "powerMod",
            "amount": -2000,
            "targetSide": "opponent",
            "targetType": "character",
            "minTargets": 0,
            "maxTargets": 1,
            "duration": "thisTurn"
          }
        ]
      }
    }
  ]
}
```

### Example 2: OP09-001 Shanks (Leader)
Opponent Turn power reduction with Once Per Turn frequency.

```json
{
  "id": "OP09-001",
  "name": "Shanks",
  "abilities": [
    {
      "type": "Opponents Turn",
      "frequency": "Once Per Turn",
      "condition": {
        "opponentTurn": true
      },
      "cost": null,
      "effect": {
        "text": "You may activate this effect when your opponent attacks. Give up to 1 of your opponent's leader or characters -1000 power for the turn.",
        "actions": [
          {
            "type": "powerMod",
            "amount": -1000,
            "targetSide": "opponent",
            "targetType": "any",
            "minTargets": 0,
            "maxTargets": 1,
            "duration": "thisTurn"
          }
        ]
      }
    }
  ]
}
```

### Example 3: OP09-002 Uta
On Play deck search.

```json
{
  "id": "OP09-002",
  "name": "Uta",
  "abilities": [
    {
      "type": "On Play",
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": {
        "text": "Look at the top 5 cards of your deck, reveal up to 1 \"Red Haired Pirates\" card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
        "actions": [
          {
            "type": "search",
            "lookCount": 5,
            "filterType": "Red Hair Pirates",
            "minSelect": 0,
            "maxSelect": 1,
            "destination": "hand",
            "remainderLocation": "bottom",
            "remainderOrder": "any"
          }
        ]
      }
    }
  ]
}
```

### Example 4: Complex Multi-Action Ability
Card with multiple actions in sequence.

```json
{
  "id": "EXAMPLE",
  "name": "Complex Card",
  "abilities": [
    {
      "type": "On Play",
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": {
        "text": "KO 1 opponent character with 4000 power or less, then draw 1 card.",
        "actions": [
          {
            "type": "ko",
            "targetSide": "opponent",
            "targetType": "character",
            "minTargets": 1,
            "maxTargets": 1,
            "powerLimit": 4000
          },
          {
            "type": "draw",
            "quantity": 1
          }
        ]
      }
    }
  ]
}
```

## Field Value Reference

### targetSide
**Important:** `targetSide` is always **relative to the card controller**, not absolute game sides.
- `"player"` - The controller's side (whoever played/controls the card)
- `"opponent"` - The controller's opponent
- `"both"` - Either side

**Example:** When opponent plays a card with `"targetSide": "opponent"`, the actual game target will be "player" because from the opponent's perspective, player is their opponent.

### targetType
- `"leader"` - Leader cards only
- `"character"` - Character cards only
- `"don"` - DON!! cards only
- `"any"` - Leader or Character (for abilities that can target either)

### duration
- `"thisTurn"` - Until end of current turn
- `"untilEndOfBattle"` - Until current battle ends
- `"permanent"` - Permanent modification

### source / destination
- `"hand"` - Hand zone
- `"deck"` - Deck (generic)
- `"deckTop"` - Top of deck
- `"deckBottom"` - Bottom of deck
- `"trash"` - Trash zone
- `"field"` - Play area

### remainderLocation
- `"top"` - Top of deck (in specific order)
- `"bottom"` - Bottom of deck
- `"shuffle"` - Shuffled back into deck

## Benefits of Explicit Fields

### ✅ No Runtime Parsing
- Actions.jsx uses direct field access: `action.amount`, `action.targetSide`
- No regex or string matching needed
- Faster execution

### ✅ Type Safety
- JSON schema can validate structure
- IDEs can provide autocomplete
- Reduces errors

### ✅ Easier to Maintain
- Clear what each field means
- No ambiguous string formats
- Easy to add new action types

### ✅ Future-Proof
- Adding new cards is straightforward
- No need to update parsing logic
- System scales easily

## Additional Notes

### Extra duration value
- `untilOpponentsNextTurn` is also supported for effects that persist through your opponent's next turn (used by some OP09 cards).

## Future: Replacement Effects

Some cards use "instead" style replacement effects (e.g., "If this card would be removed by an opponent's effect, instead …"). Represent these today as a `Continuous` ability with clear `effect.text`. Engines can optionally support a structured form later:

```json
{
  "type": "Continuous",
  "frequency": "Once Per Turn",
  "effect": {
    "text": "If this Character would be removed from the field by your opponent's effect, you may give this Character -2000 power during this turn instead.",
    "replacement": {
      "event": "wouldRemoveByOpponentEffect",
      "appliesTo": "self",
      "instead": [
        { "type": "powerMod", "amount": -2000, "targetSide": "player", "targetType": "character", "minTargets": 0, "maxTargets": 0, "duration": "thisTurn" }
      ]
    }
  }
}
```

Note: `replacement` is not yet consumed by the current engine; it serves as forward-compatible metadata.
