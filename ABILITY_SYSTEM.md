# One Piece TCG Simulator - Ability System Documentation

## Overview

The ability system has been redesigned to be **JSON-driven** and **universal**. Instead of creating individual JSX components for each card, all card abilities are now defined in JSON files and handled by a single, enhanced `Actions.jsx` component.

## Architecture

### Component Structure

```
Home.jsx
  ├─ Loads card metadata from JSON files
  ├─ Opens Actions.jsx when card is clicked
  └─ Actions.jsx
      ├─ Reads abilities from card JSON
      ├─ Determines which abilities can be activated
      ├─ Renders UI controls for each ability
      └─ Handles ability activation and effects
```

### Data Flow

```
Card JSON → loader.js → metaById Map → Actions.jsx → Ability Activation → Game State Update
```

## JSON Structure

### Basic Format

Each card's JSON file includes an `abilities` array:

```json
{
  "id": "OP09-001",
  "name": "Shanks",
  "category": "Leader",
  "keywords": ["Rush", "Blocker"],
  "abilities": [
    {
      "type": "On Play",
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": {
        "text": "KO 1 of your opponent's Characters with 3000 power or less.",
        "actions": [
          {
            "type": "ko",
            "targetSide": "opponent",
            "targetType": "character",
            "minTargets": 1,
            "maxTargets": 1,
            "powerLimit": 3000
          }
        ]
      }
    }
  ]
}
```

### Ability Types

The `type` field determines when/how an ability activates. Use these canonical, human-readable labels (case and spacing as shown):

| Type | Description | Example |
|------|-------------|---------|
| `On Play` | Triggers when card is played to field | "Draw 2 cards" |
| `Activate Main` | Manual activation during Main Phase | "Rest this card → Draw 1 card" |
| `On Attack` | Triggers when this card attacks | 
| `On Block` | Triggers when this card blocks | 
| `Blocker` | Keyword - can redirect attacks | Automatic |
| `Rush` | Keyword - can attack turn played | Automatic |
| `Double Attack` | Keyword - deals 2 life damage | Automatic |
| `Critical` | Keyword - damage goes to trash | Automatic |
| `Counter` | Activates during Counter Step | |
| `On KO` | Triggers when card is KO'd | |
| `End of Turn` | Triggers at end of turn | |
| `Trigger` | Only when drawn as life | |
| `Opponents Turn` | Active during opponent's turn | |
| `Continuous` | Always active while on field | |

Use exactly the canonical forms above in JSON. Aliases are not supported.

## Conditions

Abilities can have conditions that must be met:

```json
{
  "type": "activateMain",
  "condition": {
    "don": 2,
    "yourTurn": true
  },
  "effect": "Draw 2 cards"
}
```

### Condition Fields

- `don` (integer): Number of DON!! that must be attached to this card
- `yourTurn` (boolean): Must be during your turn
- `opponentTurn` (boolean): Must be during opponent's turn

## Costs

Manual activation abilities can have costs:

```json
{
  "type": "activateMain",
  "cost": {
    "restThis": true,
    "restDon": 2,
    "trash": 1
  },
  "effect": "Draw 3 cards"
}
```

### Cost Fields

Costs are paid AFTER the effect is successfully applied and targets are confirmed. If the user cancels target selection, costs are NOT paid.

- `restThis` (boolean): Must rest this card
- `restDon` (integer): Number of DON!! from cost area to rest
- `trash` (integer): Number of cards to trash from hand
- `returnThisToDeck` (string): Return this card to deck ("top" | "bottom" | "shuffle")
- `trashThis` (boolean): Trash this card instead of returning to deck
- `discardFromLife` (integer): Discard X cards from life area
- `payLife` (integer): Take X life damage as a cost

**Note:** Some costs like `trash` and `discardFromLife` may require additional UI for the player to select which cards to use. The ability activation will pause to allow this selection before completing.

## Effects

Effects can be simple strings or structured objects. Prefer structured actions for clarity and reuse; the engine supports explicit fields (no parsing of free text).

### Structured Effect (Preferred)

For more complex effects, use the structured format:

```json
{
  "type": "On Play",
  "effect": {
    "text": "KO 1 opponent character with 3000 power or less",
    "actions": [
      {
        "type": "ko",
        "targetSide": "opponent",
        "targetType": "character",
        "minTargets": 1,
        "maxTargets": 1,
        "powerLimit": 3000
      }
    ]
  }
}
```

### Effect Action Types (explicit fields)

- `powerMod`: `amount`, `targetSide`, `targetType`, `minTargets`, `maxTargets`, `duration`, (`powerLimit` optional)
#### Aura Power Modifiers

For Continuous abilities that globally modify all matching cards (e.g., "All of your opponent's Characters have -1000 power"), define a `powerMod` action with `"mode": "aura"` and omit target counts:

```json
{
  "type": "Continuous",
  "effect": {
    "text": "All of your opponent's Characters have -1000 power.",
    "actions": [
      {
        "type": "powerMod",
        "mode": "aura",
        "amount": -1000,
        "targetSide": "opponent",
        "targetType": "character",
        "duration": "permanent"
      }
    ]
  }
}
```

Engine behavior:
- No activation button (Continuous abilities are passive).
- Aura applied dynamically each time total power is computed; stacks with temporary buffs/debuffs.
- Leaving the field instantly removes the modifier.
- Supports multiple simultaneous aura sources.

Optional future extensions can add conditions (e.g., DON requirements) on the ability level; aura is then included only if condition passes.
- `ko`: `targetSide`, `targetType`, `minTargets`, `maxTargets`, (`powerLimit`, `costLimit` optional)
- `draw`: `quantity`
- `search`: `lookCount`, `minSelect`, `maxSelect`, `destination`, `remainderLocation`, (`remainderOrder`, `filterType`, `filterColor`, `filterAttribute` optional)
- `addDon`, `giveDon`, `play`, `return`, `rest`, `active`: as documented in ACTION_SCHEMA.md

## Examples

### Example 1: Simple On Play Draw

```json
{
  "id": "OP01-001",
  "name": "Luffy",
  "abilities": [
    {
      "type": "On Play",
      "effect": "Draw 2 cards"
    }
  ]
}
```

### Example 2: Conditional Power Buff

```json
{
  "id": "OP02-005",
  "name": "Zoro",
  "abilities": [
    {
      "type": "On Attack",
      "condition": {
        "don": 1
      },
      "effect": "Give this character +2000 power this turn"
    }
  ]
}
```

### Example 3: Manual Activation with Cost

```json
{
  "id": "OP03-010",
  "name": "Nami",
  "abilities": [
    {
      "type": "Activate Main",
      "frequency": "Once Per Turn",
      "cost": {
        "restThis": true,
        "restDon": 1
      },
      "effect": "Draw 1 card"
    }
  ]
}
```

### Example 4: KO Effect with Filter

```json
{
  "id": "OP04-015",
  "name": "Ace",
  "abilities": [
    {
      "type": "On Play",
      "effect": "KO 1 of your opponent's Characters with 3000 power or less"
    }
  ]
}
```

### Example 5: Deck Search

```json
{
  "id": "OP09-002",
  "name": "Uta",
  "abilities": [
    {
      "type": "On Play",
      "effect": "Look at the top 5 cards of your deck, reveal up to 1 Red Haired Pirates card and add it to hand"
    }
  ]
}
```

### Example 6: Multiple Abilities

```json
{
  "id": "OP05-020",
  "name": "Sanji",
  "abilities": [
    {
      "type": "onPlay",
      "effect": "Give up to 1 of your characters +1000 power this turn"
    },
    {
      "type": "activateMain",
      "frequency": "once per turn",
      "cost": {
        "restThis": true
      },
      "effect": "Draw 1 card"
    }
  ]
}
```

### Example 7: Return to Deck Cost (OP09-008)

This example demonstrates an Activate Main ability with a `returnThisToDeck` cost. The cost is paid AFTER the effect resolves successfully. If the user cancels target selection, the card remains on the field and the ability is not consumed.

**Activation Flow:**
1. User clicks "Activate" button
2. User selects a target character (or clicks "Cancel" to skip)
3. If target selected: Apply -3000 power, then return card to bottom of deck
4. If cancelled: Card stays on field, ability can be used again

```json
{
  "id": "OP09-008",
  "name": "Building Snake",
  "abilities": [
    {
      "type": "Activate Main",
      "frequency": null,
      "condition": null,
      "cost": {
        "returnThisToDeck": "bottom"
      },
      "effect": {
        "text": "Give up to one of your opponent's characters -3000 power for this turn.",
        "actions": [
          {
            "type": "powerMod",
            "amount": -3000,
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

**Variations:**
Other cards might use `"trashThis": true` instead of `returnThisToDeck` to trash the card after activation rather than returning to deck. The system supports both variations seamlessly.

### Example 8: ST15-002 Edward Newgate
Multiple abilities: On Play giveDon and Activate Main KO with rest cost.

This card demonstrates:
- **giveDon action**: Giving rested DON!! from cost area to a target
- **Optional On Play** (autoResolve: false): Allows player to choose targets
- **restThis cost**: Card must be rested to activate the second ability

```json
{
  "id": "ST15-002",
  "name": "Edward Newgate",
  "abilities": [
    {
      "type": "On Play",
      "autoResolve": false,
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": {
        "text": "Give your leader or one of your characters up to one rested Don!!.",
        "actions": [
          {
            "type": "giveDon",
            "quantity": 1,
            "targetSide": "player",
            "targetType": "any",
            "minTargets": 0,
            "maxTargets": 1,
            "onlyRested": true
          }
        ]
      }
    },
    {
      "type": "Activate Main",
      "frequency": null,
      "condition": null,
      "cost": {
        "restThis": true
      },
      "effect": {
        "text": "You may rest this character: KO up to one of your opponent's characters with 5000 or less power.",
        "actions": [
          {
            "type": "ko",
            "targetSide": "opponent",
            "targetType": "character",
            "minTargets": 0,
            "maxTargets": 1,
            "powerLimit": 5000
          }
        ]
      }
    }
  ]
}
```
1. User clicks "Activate" button
2. User selects a target character (or clicks "Cancel" to skip)
3. If target selected: Apply -3000 power, then return card to bottom of deck
4. If cancelled: Card stays on field, ability can be used again

```json
{
  "id": "OP09-008",
  "name": "Building Snake",
  "abilities": [
    {
      "type": "Activate Main",
      "frequency": null,
      "condition": null,
      "cost": {
        "returnThisToDeck": "bottom"
      },
      "effect": {
        "text": "Give up to one of your opponent's characters -3000 power for this turn.",
        "actions": [
          {
            "type": "powerMod",
            "amount": -3000,
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

**Variations:**
Other cards might use `"trashThis": true` instead of `returnThisToDeck` to trash the card after activation rather than returning to deck. The system supports both variations seamlessly.

## Keywords

Keywords are stored in the `keywords` array and are handled automatically:

```json
{
  "id": "OP06-025",
  "name": "Law",
  "keywords": ["Rush", "Blocker"],
  "abilities": []
}
```

Common keywords:
- **Rush** - Can attack the turn it's played
- **Blocker** - Can block attacks
- **Double Attack** - Deals 2 life damage instead of 1
- **Critical** - Damage goes to trash instead of hand
- **Banish** - When KO'd, remove from game
- **DON!! x#** - Condition for ability activation

## Activation Logic in Actions.jsx

The Actions component determines if an ability can be activated:

The engine normalizes legacy aliases to the canonical labels automatically (e.g., `onplay` → `On Play`).

## Adding New Cards

To add a new card with abilities:

1. Create a JSON file in the appropriate set folder:
   ```
   src/data/cards/OP09/OP09-XXX.json
   ```

2. Define the card with abilities:
   ```json
   {
     "id": "OP09-999",
     "name": "New Character",
     "category": "Character",
     "keywords": ["Rush"],
     "abilities": [
       {
         "type": "onPlay",
         "effect": "Draw 2 cards"
       }
     ]
   }
   ```

3. That's it! The Actions component will automatically handle it.

## Implementation Status

### ✅ Implemented
- Universal Actions component
- JSON-driven ability system
- Core ability type recognition (onPlay, activateMain, onAttack, etc.)
- Conditional activation based on game state
- Power modification effects
- Targeting system integration
- Once per turn restrictions
- DON!! condition checking

### 🚧 Partial / Needs Enhancement
- Some advanced actions (e.g., temporary keyword grants) not fully wired to combat rules yet
- Cost payment enforcement
- DON!! counting for conditions
- Deck viewing UI for search effects
- Effect chaining

### ⏳ Planned
- When KO'd trigger handling
- End of turn triggers
- Trigger (life) activation
- Complex conditional effects
- Effect animation feedback
- AI opponent ability activation
- Effect history/undo system

## Benefits

### Before (Individual Components)
- ❌ 100+ individual JSX files
- ❌ Duplicated code everywhere
- ❌ Hard to maintain consistency
- ❌ Difficult to test

### After (JSON-Driven)
- ✅ Single Actions component
- ✅ All abilities defined in data
- ✅ Consistent UI and behavior
- ✅ Easy to add new cards
- ✅ Game rules in one place

## Testing Your Cards

1. Add your card JSON to the appropriate set folder
2. Start the game and load a deck with your card
3. Play the card or perform the action that triggers the ability
4. Click on the card to open the Actions panel
5. Verify abilities show with correct timing/conditions
6. Test activation and verify effects apply correctly

## Troubleshooting

### Ability Not Showing
- Check JSON syntax is valid
- Verify `abilities` array exists
- Ensure `type` field uses valid enum value
- Check console for JSON parsing errors

### Cannot Activate
- Verify game phase matches ability timing
- Check it's the correct player's turn
- Ensure conditions are met (DON!!, etc.)
- Look for "Once Per Turn" restrictions

### Effect Not Working
- Check that effect text uses recognized keywords
- For complex effects, use structured format
- Verify targeting is working correctly
- Check console for activation logs

## Future Enhancements

- **Visual Effect System**: Animations when abilities activate
- **Effect Resolution Stack**: Proper handling of simultaneous effects
- **Comprehensive Effect Library**: Pre-built handlers for all effect types
- **AI Integration**: Computer opponent can evaluate and use abilities
- **Replay System**: Record and replay games with ability activations
- **Deck Validator**: Check if abilities are properly defined for all cards in deck
