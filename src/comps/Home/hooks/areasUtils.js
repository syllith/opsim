// Shared board/areas helpers.
// Pure functions only: no React state.

export function getSideRoot(areasOrNext, side) {
    return side === 'player' ? areasOrNext?.player : areasOrNext?.opponent;
}

export function getHandCostRoot(areasOrNext, side) {
    return side === 'player' ? areasOrNext?.player?.bottom : areasOrNext?.opponent?.top;
}

export function getZoneArray(areasOrNext, { side, section, keyName }) {
    const sideRoot = getSideRoot(areasOrNext, side);
    if (!sideRoot) return null;

    // Common nested sections
    if (section === 'top' || section === 'middle' || section === 'bottom') {
        const container = sideRoot?.[section];
        const arr = container?.[keyName];
        return Array.isArray(arr) ? arr : null;
    }

    const sectionNode = sideRoot?.[section];

    // If section is directly an array (e.g., char)
    if (Array.isArray(sectionNode)) {
        return sectionNode;
    }

    // If section is an object with keyName arrays (e.g., bottom.hand)
    if (sectionNode && typeof sectionNode === 'object' && keyName) {
        const nested = sectionNode?.[keyName];
        return Array.isArray(nested) ? nested : null;
    }

    // Fallback: some callers historically used keyName as a direct array
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

// Pure mutator: rest enough DON in cost pool to pay a cost.
export function restDonForCost(next, side, cost) {
    if (!cost || cost <= 0) return 0;

    const handCostRoot = getHandCostRoot(next, side);
    const pool = handCostRoot?.cost || [];
    let remainingCost = cost;

    for (let i = 0; i < pool.length && remainingCost > 0; i++) {
        const don = pool[i];
        if (don?.id === 'DON' && !don.rested) {
            don.rested = true;
            remainingCost--;
        }
    }

    // ensure we write back if caller expects immutability (many callers mutate next in-place)
    if (handCostRoot) {
        handCostRoot.cost = pool;
    }

    return cost - remainingCost;
}

// Pure mutator: refresh phase makes everything active on a side.
export function refreshSideToActive(next, side) {
    const sideRoot = getSideRoot(next, side);
    const handCostRoot = getHandCostRoot(next, side);
    if (!sideRoot || !handCostRoot) return;

    const cost = handCostRoot.cost || [];
    for (let i = 0; i < cost.length; i++) {
        const c = cost[i];
        if (c?.id === 'DON') c.rested = false;
    }
    handCostRoot.cost = cost;

    const leader = sideRoot?.middle?.leader?.[0];
    if (leader) leader.rested = false;

    const stage = sideRoot?.middle?.stage?.[0];
    if (stage) stage.rested = false;

    if (Array.isArray(sideRoot.char)) {
        for (let i = 0; i < sideRoot.char.length; i++) {
            if (sideRoot.char[i]) sideRoot.char[i].rested = false;
        }
    }
}

// Pure mutator: move life cards to hand without trigger checks.
export function payLifeCostMutate(next, side, amount) {
    if (!amount || amount <= 0) return 0;
    const sideRoot = getSideRoot(next, side);
    const handCostRoot = getHandCostRoot(next, side);
    if (!sideRoot || !handCostRoot) return 0;

    const lifeArr = sideRoot.life || [];
    const handArr = handCostRoot.hand || [];

    const toPay = Math.min(amount, lifeArr.length);
    for (let i = 0; i < toPay; i++) {
        const card = lifeArr.pop();
        if (card) handArr.push(card);
    }

    sideRoot.life = lifeArr;
    handCostRoot.hand = handArr;

    return toPay;
}

// Pure mutator: deal damage by taking 1+ life and either sending to hand or returning a trigger.
export function dealDamageToLeaderMutate(next, side, amount, { metaById, allowTrigger } = {}) {
    const sideRoot = getSideRoot(next, side);
    const handCostRoot = getHandCostRoot(next, side);
    if (!sideRoot || !handCostRoot) return { paid: 0, triggers: [] };

    const triggers = [];
    let paid = 0;

    for (let n = 0; n < amount; n++) {
        const lifeArr = sideRoot.life || [];
        if (!lifeArr.length) break;

        const card = lifeArr[lifeArr.length - 1];
        sideRoot.life = lifeArr.slice(0, -1);

        const keywords = metaById?.get?.(card?.id)?.keywords || [];
        const keywordLower = allowTrigger ? 'trigger' : null;
        const cardHasTrigger = allowTrigger
            ? (keywords || []).some(k => (k || '').toLowerCase().includes(keywordLower))
            : false;

        if (cardHasTrigger) {
            triggers.push({ side, card, hasTrigger: true });
        } else {
            const handArr = handCostRoot.hand || [];
            handArr.push(card);
            handCostRoot.hand = handArr;
        }

        paid++;
    }

    return { paid, triggers };
}

// Pure mutator: return attached DON from a card into cost.
export function returnDonFromCardMutate(next, side, section, keyName, index) {
    const sideRoot = getSideRoot(next, side);
    const costRoot = getHandCostRoot(next, side);
    if (!sideRoot || !costRoot) return 0;

    if (section === 'char' && keyName === 'char') {
        const donUnderArr = sideRoot?.charDon?.[index] || [];
        if (donUnderArr.length) {
            costRoot.cost = [...(costRoot.cost || []), ...donUnderArr];
            if (Array.isArray(sideRoot.charDon)) {
                sideRoot.charDon.splice(index, 1);
            }
            return donUnderArr.length;
        }
        return 0;
    }

    if (section === 'middle' && keyName === 'leader') {
        const leaderDon = sideRoot?.middle?.leaderDon || [];
        if (leaderDon.length) {
            costRoot.cost = [...(costRoot.cost || []), ...leaderDon];
            sideRoot.middle.leaderDon = [];
            return leaderDon.length;
        }
        return 0;
    }

    return 0;
}
