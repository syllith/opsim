'use strict';
// expressions.js — Expression Evaluation System
// =============================================================================
// See schema and in-repo docs for types and intended behaviors.
//
// This file implements:
// - compare(leftValue, op, rightValue)
// - evaluateExpression(expression, card, gameState, context)
// - evaluateCondition(condition, gameState, context)
// - evaluateFilter(filter, card, gameState, context)
//
// Notes:
// - Some expression types delegate to selector.evaluateSelector. We import the
//   selector module at top-level; this creates a circular import with selector.js,
//   but that's OK as long as we only *call* selector functions at runtime.
// - Uses engine.getTotalPower for 'power' field and keywordManager.hasKeyword
//   for 'hasKeyword' checks.
// =============================================================================

import engine from '../index.js';
import keywordManager from '../modifiers/keywordManager.js';
import * as selectorModule from './selector.js';

/**
 * Basic compare helper
 */
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

/**
 * Helper: safely pull a field value from a card instance or context
 * Supports special fields: power, cost, counter, colors, traits, cardType,
 * state, isGivenDon, hasKeyword
 */
function getCardFieldValue(field, card, gameState, context = {}) {
  if (!card) return undefined;

  switch (field) {
    case 'power': {
      // Use engine.getTotalPower (applies modifiers/don bonus correctly).
      try {
        const isOwnerTurn = !!context.isOwnerTurn;
        return engine.getTotalPower(gameState, card.instanceId, { isOwnerTurn });
      } catch (e) {
        // fallback to stored basePower or 0
        return (typeof card.basePower === 'number') ? card.basePower : 0;
      }
    }

    case 'cost':
      // Use printed or instance cost if present; otherwise default to 0
      return (typeof card.cost === 'number') ? card.cost : 0;

    case 'counter':
      return (typeof card.counter === 'number') ? card.counter : 0;

    case 'colors':
      return Array.isArray(card.colors) ? card.colors.slice() : [];

    case 'traits':
      return Array.isArray(card.traits) ? card.traits.slice() : [];

    case 'cardType':
      return card.cardType || card.type || null;

    case 'state':
      return card.state || (card.rested ? 'rested' : 'active') || null;

    case 'isGivenDon':
      return !!(card.givenDon && card.givenDon > 0);

    case 'hasKeyword':
      // This field expects expression.value or fieldRef to specify which keyword.
      return (kw) => {
        if (!kw) return false;
        return keywordManager.hasKeyword(gameState, card.instanceId, kw);
      };

    default:
      // Generic property access
      return card[field];
  }
}

/**
 * Resolve a "value" for comparisons. If expression provides fieldRef, we read the
 * referenced value. Else returns expression.value directly.
 */
function resolveRightValue(expression, card, gameState, context = {}) {
  if (expression.fieldRef) {
    // Get referenced value from the same card (or from context if it's special).
    return getCardFieldValue(expression.fieldRef, card, gameState, context);
  }
  return expression.value;
}

/**
 * Evaluate an expression object. Returns boolean.
 */
export const evaluateExpression = (expression, card, gameState, context = {}) => {
  // Null/undefined expression considered true
  if (!expression) return true;

  // Compound logic handling
  if (expression.logic) {
    const logic = expression.logic;
    if (logic === 'AND' && Array.isArray(expression.all)) {
      return expression.all.every((sub) => evaluateExpression(sub, card, gameState, context));
    }
    if (logic === 'OR' && Array.isArray(expression.any)) {
      return expression.any.some((sub) => evaluateExpression(sub, card, gameState, context));
    }
  }

  // Special expression field types
  if (expression.field === 'selectorCount') {
    // selector is a TargetSelectorRef
    const selector = expression.selector;
    const matches = selectorModule.evaluateSelector(gameState, selector, context) || [];
    const count = matches.length;
    return compare(count, expression.op, expression.value);
  }

  if (expression.field === 'selectorStatTotal') {
    const selector = expression.selector;
    const stat = expression.stat;
    const matches = selectorModule.evaluateSelector(gameState, selector, context) || [];
    const total = matches.reduce((acc, inst) => {
      if (!inst) return acc;
      if (stat === 'power') {
        return acc + engine.getTotalPower(gameState, inst.instanceId, { isOwnerTurn: !!context.isOwnerTurn });
      }
      const v = (typeof inst[stat] === 'number') ? inst[stat] : 0;
      return acc + v;
    }, 0);
    return compare(total, expression.op, expression.value);
  }

  if (expression.field === 'selectorCountCompare') {
    const aMatches = selectorModule.evaluateSelector(gameState, expression.selectorA, context) || [];
    const bMatches = selectorModule.evaluateSelector(gameState, expression.selectorB, context) || [];
    return compare(aMatches.length, expression.op, bMatches.length);
  }

  if (expression.field === 'selectorCountDifference') {
    const aMatches = selectorModule.evaluateSelector(gameState, expression.selectorA, context) || [];
    const bMatches = selectorModule.evaluateSelector(gameState, expression.selectorB, context) || [];
    const diff = Math.abs(aMatches.length - bMatches.length);
    return compare(diff, expression.op, expression.value);
  }

  if (expression.field === 'selfStatVsSelectorCount') {
    // Compare the subject card's stat vs. number of matches for selector
    if (!card) return false;
    const stat = expression.stat;
    const statVal = (stat === 'power')
      ? engine.getTotalPower(gameState, card.instanceId, { isOwnerTurn: !!context.isOwnerTurn })
      : (typeof card[stat] === 'number' ? card[stat] : 0);
    const matches = selectorModule.evaluateSelector(gameState, expression.selector, context) || [];
    return compare(statVal, expression.op, matches.length);
  }

  if (expression.field === 'battleOpponent') {
    // context should include battleOpponent as an instance or null
    const att = expression.attribute;
    const op = expression.op;
    const value = expression.value;
    const opp = (context && context.battleOpponent) ? context.battleOpponent : null;
    if (!att || opp === null) {
      // if no battle opponent available, interpret as false unless value is false and op is '='
      return compare(null, op, value);
    }
    // If checking attribute on opponent (e.g., attribute: 'slash', value: true)
    const hasAttr = Array.isArray(opp.attributes) ? opp.attributes.includes(att) : false;
    return compare(hasAttr, op, value);
  }

  // Simple field comparison using card fields
  if (expression.field) {
    const left = getCardFieldValue(expression.field, card, gameState, context);
    // support hasKeyword special case where left is a function
    if (expression.field === 'hasKeyword') {
      const keyword = expression.value || (expression.fieldRef && getCardFieldValue(expression.fieldRef, card, gameState, context));
      if (!keyword) return false;
      return keywordManager.hasKeyword(gameState, card && card.instanceId, keyword);
    }

    const right = resolveRightValue(expression, card, gameState, context);

    // If left is array
    if (Array.isArray(left)) {
      // '=' and '!=' treat array includes semantics (compare() already handles it)
      return compare(left, expression.op, right);
    }

    // For boolean / numeric / string comparisons
    return compare(left, expression.op, right);
  }

  // If we reach here, unrecognized expression shape -> true as permissive fallback
  return true;
};

/**
 * Evaluate condition (no specific 'card'); expression shapes are similar.
 */
export const evaluateCondition = (condition, gameState, context = {}) => {
  if (!condition) return true;
  // For conditions that include selector-only expressions, delegate to evaluateExpression
  return evaluateExpression(condition, null, gameState, context);
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
