'use strict';
// expressions.js — Expression Evaluation System
// =============================================================================
// PURPOSE:
// This module evaluates Expression objects used in conditions and filters.
// Expressions can compare card fields, check selector counts, combine with
// AND/OR logic, and perform various comparisons needed for ability conditions
// and target filtering.
// =============================================================================

// =============================================================================
// RESPONSIBILITIES
// =============================================================================
// - Evaluate simple field comparisons (field op value)
// - Evaluate compound expressions (AND/OR of sub-expressions)
// - Evaluate selector-based expressions (selectorCount, selectorStatTotal)
// - Support field references (compare field to another field)
// - Handle special expression types from schema

// =============================================================================
// PUBLIC API
// =============================================================================
// evaluateExpression(expression, card, gameState, context) -> boolean
//   Evaluates an expression against a card.
//   Returns true if the expression matches, false otherwise.
//
// evaluateCondition(condition, gameState, context) -> boolean
//   Evaluates a condition (same as expression but no specific card).
//   Used for ability activation conditions.
//
// evaluateFilter(filter, card, gameState, context) -> boolean
//   Evaluates a filter against a card.
//   Alias for evaluateExpression (filters and expressions are equivalent).
//
// compare(leftValue, op, rightValue) -> boolean
//   Performs a comparison operation.
//   Supports: '=', '!=', '<', '<=', '>', '>='

// =============================================================================
// EXPRESSION TYPES (from schema.json)
// =============================================================================
// 1. Simple field comparison:
//    { field: string, op: Comparator, value: any }
//    { field: string, op: Comparator, fieldRef: string }
//
// 2. Compound expression:
//    { logic: 'AND'|'OR', all: Expression[] }  // AND
//    { logic: 'AND'|'OR', any: Expression[] }  // OR
//
// 3. Selector count:
//    { field: 'selectorCount', selector: TargetSelectorRef, op: Comparator, value: number }
//
// 4. Battle opponent attribute:
//    { field: 'battleOpponent', attribute: string, op: Comparator, value: boolean }
//
// 5. Selector count compare:
//    { field: 'selectorCountCompare', selectorA: Ref, selectorB: Ref, op: Comparator }
//
// 6. Selector stat total:
//    { field: 'selectorStatTotal', selector: Ref, stat: string, op: Comparator, value: number }
//
// 7. Selector count difference:
//    { field: 'selectorCountDifference', selectorA: Ref, selectorB: Ref, op: Comparator, value: number }
//
// 8. Self stat vs selector count:
//    { field: 'selfStatVsSelectorCount', stat: string, selector: Ref, op: Comparator }

// =============================================================================
// INPUT / OUTPUT / STATE
// =============================================================================
// INPUTS:
// - expression: Expression object from card JSON
// - card: CardInstance being evaluated (for field access)
// - gameState: current GameState
// - context: { thisCard?, activePlayer?, boundVars? }
//
// OUTPUTS:
// - boolean: whether the expression evaluates to true
//
// FIELD ACCESS:
// When expression.field is a card property:
// - 'power': card's current power (computed)
// - 'cost': card's printed cost
// - 'counter': card's counter value
// - 'colors': card's colors array
// - 'traits': card's normalized traits
// - 'cardType': card's type (leader/character/etc.)
// - 'state': card's state (active/rested)
// - 'isGivenDon': whether card has DON attached
// - 'hasKeyword': check for keyword presence

// =============================================================================
// INTEGRATION & INTERACTION
// =============================================================================
// CALLED BY:
// - src/engine/rules/selector.js: filter evaluation
// - src/engine/rules/evaluator.js: condition checking
// - src/engine/actions/interpreter.js: conditional actions
//
// DEPENDS ON:
// - src/engine/rules/selector.js: for selectorCount expressions
// - src/engine/modifiers/continuousEffects.js: getTotalPower
// - src/engine/modifiers/keywordManager.js: hasKeyword checks
// - Card database: for static card properties

// =============================================================================
// IMPLEMENTATION NOTES
// =============================================================================
// COMPARATOR SEMANTICS:
// '=': Equal (use === for primitives, array includes for arrays)
// '!=': Not equal
// '<', '<=', '>', '>=': Numeric comparison
//
// ARRAY COMPARISON:
// When comparing to arrays (like colors or traits):
// - '=' means "includes this value"
// - '!=' means "does not include this value"
// Example: { field: 'colors', op: '=', value: 'red' }
//   -> true if card.colors.includes('red')
//
// FIELD REF:
// When using fieldRef instead of value:
// Compare card[field] to card[fieldRef]
// Example: { field: 'power', op: '>=', fieldRef: 'cost' }
//   -> card.power >= card.cost (useful for weird effects)
//
// SELECTOR COUNT EXPRESSIONS:
// These count how many cards match a selector:
// { field: 'selectorCount', selector: {...}, op: '>=', value: 3 }
// -> evaluateSelector, then compare count to value
//
// COMPOUND LOGIC:
// AND (all): All sub-expressions must be true
// OR (any): At least one sub-expression must be true
// Recursively evaluate sub-expressions.
//
// SPECIAL FIELDS:
// 'hasKeyword': Value is keyword name, check if card has it
// 'isGivenDon': No value needed, true if DON attached
// 'state': Value is 'active' or 'rested'

// =============================================================================
// TEST PLAN
// =============================================================================
// TEST: simple field comparison
//   Input: { field: 'cost', op: '<=', value: 3 }, card with cost 2
//   Expected: true
//
// TEST: array field contains
//   Input: { field: 'colors', op: '=', value: 'red' }, card with ['red', 'green']
//   Expected: true
//
// TEST: compound AND expression
//   Input: { logic: 'AND', all: [expr1, expr2] }, both true
//   Expected: true
//
// TEST: compound AND with one false
//   Input: { logic: 'AND', all: [trueExpr, falseExpr] }
//   Expected: false
//
// TEST: selectorCount expression
//   Input: { field: 'selectorCount', selector: {...}, op: '>=', value: 2 }
//   Expected: depends on selector match count
//
// TEST: fieldRef comparison
//   Input: { field: 'power', op: '>=', fieldRef: 'cost' }, card power 5000, cost 3
//   Expected: true (5000 >= 3... though semantically odd)

// =============================================================================
// TODO CHECKLIST
// =============================================================================
// [ ] 1. Implement compare() for all operators
// [ ] 2. Implement simple field evaluation
// [ ] 3. Handle array fields (colors, traits)
// [ ] 4. Implement fieldRef comparison
// [ ] 5. Implement compound AND/OR logic
// [ ] 6. Implement selectorCount evaluation
// [ ] 7. Implement selectorStatTotal
// [ ] 8. Implement special fields (hasKeyword, isGivenDon)
// [ ] 9. Implement battleOpponent expression
// [ ] 10. Add comprehensive error handling

// =============================================================================
// EXPORTS — STUBS
// =============================================================================

export const compare = (leftValue, op, rightValue) => {
  switch (op) {
    case '=':
      if (Array.isArray(leftValue)) {
        return leftValue.includes(rightValue);
      }
      return leftValue === rightValue;
    case '!=':
      if (Array.isArray(leftValue)) {
        return !leftValue.includes(rightValue);
      }
      return leftValue !== rightValue;
    case '<':
      return leftValue < rightValue;
    case '<=':
      return leftValue <= rightValue;
    case '>':
      return leftValue > rightValue;
    case '>=':
      return leftValue >= rightValue;
    default:
      return false;
  }
};

export const evaluateExpression = (expression, card, gameState, context = {}) => {
  // TODO: Full expression evaluation
  if (!expression) return true;
  
  // Handle compound expressions
  if (expression.logic) {
    if (expression.all) {
      return expression.all.every(e => evaluateExpression(e, card, gameState, context));
    }
    if (expression.any) {
      return expression.any.some(e => evaluateExpression(e, card, gameState, context));
    }
  }
  
  // TODO: Handle other expression types
  return true; // Stub: pass all filters
};

export const evaluateCondition = (condition, gameState, context = {}) => {
  // TODO: Evaluate condition without specific card
  return true;
};

export const evaluateFilter = (filter, card, gameState, context = {}) => {
  return evaluateExpression(filter, card, gameState, context);
};

export default {
  compare,
  evaluateExpression,
  evaluateCondition,
  evaluateFilter
};
