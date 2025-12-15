'use strict';
// search.js — Search Action Handler
// =============================================================================
// PURPOSE:
// This module handles the ActionSearch action type. It implements deck/trash
// searching: looking at cards, selecting some matching criteria, moving them
// to a destination, and handling the remaining cards.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Look at cards from source zone (deck, trash, hand)
// - Present choices to player based on selector
// - Move chosen cards to destination
// - Handle remaining cards (shuffle back, bottom, etc.)
// - Support optional reveal of chosen cards

// =============================================================================
// PUBLIC API
// =============================================================================
// execute(gameState, action, context) -> ActionResult
//   Executes a search action.
//   action: {
//     type: 'search',
//     sourceZone: 'deck' | 'trash' | 'hand',
//     selector?: TargetSelectorRef,   // Filter for choosable cards
//     reveal?: boolean,               // Show chosen cards to opponent
//     addTo: string,                  // Destination for chosen cards
//     ordering?: 'any'|'chosen'|'random',
//     topCount?: number,              // Only look at top N
//     moveRemainingTo?: string,       // Where unchosen cards go
//     remainingOrdering?: 'any'|'chosen'|'random'|'keep',
//     may?: boolean,
//     asPlay?: boolean,               // Treat as playing (trigger On Play)
//     payCost?: boolean,              // Pay cost if asPlay=true
//     enterRested?: boolean           // Enter rested if to field
//   }

// =============================================================================
// SEARCH FLOW
// =============================================================================
// 1. Get cards from source zone (all or topCount)
// 2. Filter by selector to get choosable cards
// 3. Player selects cards (respecting min/max)
// 4. If reveal=true, show selected cards
// 5. Move selected cards to destination
// 6. Handle remaining cards per moveRemainingTo
// 7. If sourceZone was deck and no topCount, shuffle at end

// =============================================================================
// DESTINATIONS
// =============================================================================
// - 'hand': Add to owner's hand
// - 'topOfDeck': Put on top of deck
// - 'bottomOfDeck': Put on bottom of deck
// - 'trash': Discard
// - 'characterArea': Play to field (check asPlay)
// - 'stage': Play stage card

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - gameState: current GameState
// - action: ActionSearch object
// - context: { thisCard, activePlayer }
//
// OUTPUTS:
// - ActionResult with updated gameState
// - UI interaction for card selection

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/actions/interpreter.js: dispatches search
// - src/engine/index.js startDeckSearch
//
// DEPENDS ON:
// - src/engine/rules/selector.js: filter cards
// - src/engine/core/zones.js: zone operations
// - src/engine/actions/playCard.js: if asPlay=true
// - src/engine/rng/rng.js: for shuffling

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// TOP COUNT:
// If topCount is specified, only look at that many cards from top.
// "Look at the top 5 cards" = topCount: 5
// Remaining = cards not selected among the looked-at cards.
//
// AS PLAY:
// If addTo is a field zone and asPlay=true:
// - Cards count as "played" not "moved"
// - [On Play] abilities trigger
// - payCost determines if cost is paid
//
// REMAINING HANDLING:
// moveRemainingTo options:
// - 'topOrBottomOfDeck': Player chooses placement
// - 'trash': Discard remaining
// - 'bottomOfDeck': Put remaining on bottom
// - 'topOfDeck': Put remaining on top
// - Not specified: shuffle back (if deck was source)
//
// SHUFFLE:
// If searching entire deck (no topCount), shuffle after:
// - Even if nothing was found/taken
// - Shuffling uses seeded RNG

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: search deck for character
//   Input: Search deck, selector for cost<=3 characters, add to hand
//   Expected: Player sees matching cards, selects one, it goes to hand
//
// TEST: topCount limits view
//   Input: topCount=5, deck has 30 cards
//   Expected: Only top 5 shown, remaining 25 untouched
//
// TEST: reveal shows to opponent
//   Input: reveal=true
//   Expected: Opponent sees the selected card
//
// TEST: remaining to bottom
//   Input: moveRemainingTo='bottomOfDeck'
//   Expected: Unchosen cards at bottom of deck
//
// TEST: asPlay triggers On Play
//   Input: Search and play character with [On Play]
//   Expected: [On Play] ability triggered

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Get cards from source zone (respect topCount)
// [ ] 2. Apply selector filter
// [ ] 3. Present selection UI
// [ ] 4. Validate selection against min/max
// [ ] 5. Handle reveal
// [ ] 6. Move selected to destination
// [ ] 7. Handle asPlay if needed
// [ ] 8. Move remaining cards
// [ ] 9. Shuffle if needed
// [ ] 10. Generate log entry

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const execute = (gameState, action, context = {}) => {
  // TODO: Full search implementation
  return { success: false, error: 'Not implemented' };
};

export default { execute };
