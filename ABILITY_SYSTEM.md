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
      "type": "onPlay",
      "frequency": null,
      "condition": null,
      "cost": null,
      "effect": "KO 1 of your opponent's Characters with 3000 power or less."
    }
  ]
}
```

### Ability Types

The `type` field determines when/how an ability activates:

| Type | Description | Example |
|------|-------------|---------|
| `onPlay` | Triggers when card is played to field | "Draw 2 cards" |
| `activateMain` | Manual activation during Main Phase | "Rest this card → Draw 1 card" |
| `onAttack` | Triggers when this card attacks | "Give a character +2000 power" |
| `onBlock` | Triggers when this card blocks | "This gains +1000 power" |
| `blocker` | Keyword - can redirect attacks | Automatic |
| `rush` | Keyword - can attack turn played | Automatic |
| `doubleAttack` | Keyword - deals 2 life damage | Automatic |
| `critical` | Keyword - damage goes to trash | Automatic |
| `counter` | Activates during Counter Step | "Give Leader +2000 power" |
| `whenKO` | Triggers when card is KO'd | "Draw 1 card" |
| `endOfTurn` | Triggers at end of turn | "Return this to hand" |
| `trigger` | Only when drawn as life | "Play this card" |
| `opponentTurn` | Active during opponent's turn | Continuous effect |
| `continuous` | Always active while on field | "All opponent characters -1000" |

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

- `restThis` (boolean): Must rest this card
- `restDon` (integer): Number of DON!! from cost area to rest
- `trash` (integer): Number of cards to trash from hand

## Effects

Effects can be simple strings or structured objects:

### Simple String Effect

```json
{
  "type": "onPlay",
  "effect": "Look at the top 5 cards of your deck, reveal 1 Red Haired Pirates card and add it to hand."
}
```

The Actions component will parse keywords in the effect text:
- "draw" → Triggers draw action
- "ko" / "k.o." → Triggers KO/destroy action
- "power" with "+/-" → Triggers power modification
- "look at" → Triggers deck viewing
- "add" + "don" → Triggers DON!! manipulation

### Structured Effect (Advanced)

For more complex effects, use the structured format:

```json
{
  "type": "onPlay",
  "effect": {
    "text": "KO 1 opponent character with 3000 power or less",
    "actions": [
      {
        "type": "ko",
        "quantity": 1,
        "target": "opponent characters",
        "filter": "3000 power or less"
      }
    ]
  }
}
```

### Effect Action Types

- `draw` - Draw cards from deck
- `ko` - Destroy/KO cards
- `powerMod` - Modify power values
- `search` - Look at cards in deck/trash
- `addDon` - Add DON!! from DON!! deck
- `giveDon` - Give DON!! to cards
- `play` - Play cards from hand/trash
- `return` - Return cards to hand/deck
- `rest` - Rest (tap) cards
- `active` - Make cards active (untap)

## Examples

### Example 1: Simple On Play Draw

```json
{
  "id": "OP01-001",
  "name": "Luffy",
  "abilities": [
    {
      "type": "onPlay",
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
      "type": "onAttack",
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
      "type": "activateMain",
      "frequency": "once per turn",
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
      "type": "onPlay",
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
      "type": "onPlay",
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

```javascript
// Example: onPlay abilities
case 'onplay':
case 'on play':
  canActivate = phase?.toLowerCase() === 'main' && isYourTurn;
  reason = canActivate ? '' : 'Only activates when card is played';
  break;

// Example: activateMain abilities
case 'activatemain':
case 'activate main':
  canActivate = phase?.toLowerCase() === 'main' && isYourTurn && !battle;
  reason = canActivate ? '' : 'Only during your Main Phase';
  break;
```

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
- Structured effect actions (draw, KO, search, etc.) - Currently text parsing
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
