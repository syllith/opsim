/**
 * areasUtils - STUB
 * TODO: Replace with engine.zones calls
 * 
 * This file previously contained zone mutation helpers.
 * Now contains only read-only helpers for UI rendering.
 * Mutation functions are stubs that do nothing.
 * Real implementation will be in src/engine/core/zones.js
 */

// =============================================================================
// READ-ONLY HELPERS (kept for UI rendering)
// =============================================================================

export function getSideRoot(areasOrNext, side) {
    return side === 'player' ? areasOrNext?.player : areasOrNext?.opponent;
}

export function getHandCostRoot(areasOrNext, side) {
    return side === 'player' ? areasOrNext?.player?.bottom : areasOrNext?.opponent?.top;
}

export function getZoneArray(areasOrNext, { side, section, keyName }) {
    const sideRoot = getSideRoot(areasOrNext, side);
    if (!sideRoot) return null;

    if (section === 'top' || section === 'middle' || section === 'bottom') {
        const container = sideRoot?.[section];
        const arr = container?.[keyName];
        return Array.isArray(arr) ? arr : null;
    }

    const sectionNode = sideRoot?.[section];
    if (Array.isArray(sectionNode)) return sectionNode;

    if (sectionNode && typeof sectionNode === 'object' && keyName) {
        const nested = sectionNode?.[keyName];
        return Array.isArray(nested) ? nested : null;
    }

    if (keyName) {
        const direct = sideRoot?.[keyName];
        return Array.isArray(direct) ? direct : null;
    }

    return null;
}

export function getLeaderCard(areasOrNext, side) {
    const arr = getZoneArray(areasOrNext, { side, section: 'middle', keyName: 'leader' });
    return arr?.[0] || null;
}

export function getStageCard(areasOrNext, side) {
    const arr = getZoneArray(areasOrNext, { side, section: 'middle', keyName: 'stage' });
    return arr?.[0] || null;
}

export function getCharArray(areasOrNext, side) {
    const arr = getZoneArray(areasOrNext, { side, section: 'char', keyName: 'char' });
    return arr || [];
}

// =============================================================================
// MUTATION STUBS (engine will implement these)
// =============================================================================

// STUB: Engine will handle DON resting
export function restDonForCost(next, side, cost) {
    console.warn('[areasUtils.restDonForCost] STUB - engine not implemented');
    return 0;
}

// STUB: Engine will handle refresh phase
export function refreshSideToActive(next, side) {
    console.warn('[areasUtils.refreshSideToActive] STUB - engine not implemented');
}

// STUB: Engine will handle life costs
export function payLifeCostMutate(next, side, amount) {
    console.warn('[areasUtils.payLifeCostMutate] STUB - engine not implemented');
    return 0;
}

// STUB: Engine will handle damage
export function dealDamageToLeaderMutate(next, side, amount, options = {}) {
    console.warn('[areasUtils.dealDamageToLeaderMutate] STUB - engine not implemented');
    return { paid: 0, triggers: [] };
}

// STUB: Engine will handle DON return
export function returnDonFromCardMutate(next, side, section, keyName, index) {
    console.warn('[areasUtils.returnDonFromCardMutate] STUB - engine not implemented');
    return 0;
}
