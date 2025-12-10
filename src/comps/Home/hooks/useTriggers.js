import { useState, useCallback } from 'react';
import _ from 'lodash';

// Helper to get the side location from areas (player or opponent)
const getSideLocationFromNext = (next, side) => {
    return side === 'player' ? next.player : next.opponent;
};

// Helper to get hand/cost/trash/don container from areas
const getHandCostLocationFromNext = (next, side) => {
    return side === 'player' ? next.player.bottom : next.opponent.top;
};

/**
 * Hook to manage Trigger card mechanics (CR 4-6-3, 10-1-5)
 * Handles life damage, trigger detection, and trigger activation/decline choices
 */
export default function useTriggers({
    metaById,
    appendLog,
    setAreas
}) {
    const [triggerPending, setTriggerPending] = useState(null);

    // Case-insensitive keyword check
    const hasKeyword = useCallback((keywords, keyword) => {
        return _.some(keywords, k => new RegExp(keyword, 'i').test(k));
    }, []);

    // Deal 1 damage; check for Trigger (CR 4-6-3, 10-1-5)
    const dealOneDamageToLeader = useCallback((defender) => {
        let cardWithTrigger = null;

        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const side = getSideLocationFromNext(next, defender);
            const life = side.life || [];

            // Rule 1-2-1-1-1: Taking damage with 0 Life = defeat condition
            if (!life.length) {
                appendLog(`[DEFEAT] ${defender} has 0 Life and took damage!`);
                return next;
            }

            // Remove top card from life
            const card = life[life.length - 1];
            side.life = life.slice(0, -1);

            // Check if card has [Trigger] keyword
            const keywords = metaById.get(card.id)?.keywords || [];
            const cardHasTrigger = hasKeyword(keywords, 'trigger');

            if (cardHasTrigger) {
                // Pause and show trigger choice modal
                cardWithTrigger = { side: defender, card, hasTrigger: true };
            } else {
                // No trigger: add to hand as normal
                const handLoc = getHandCostLocationFromNext(next, defender);
                handLoc.hand = _.concat(handLoc.hand || [], card);
                appendLog(`[Damage] ${defender} takes 1 damage, adds ${card.id} to hand.`);
            }

            return next;
        });

        // If trigger detected, pause for player choice
        if (cardWithTrigger) {
            setTriggerPending(cardWithTrigger);
        }
    }, [metaById, appendLog, hasKeyword, setAreas]);

    const onTriggerActivate = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Trigger] ${side} activates [Trigger] on ${card.id}!`);

        // TODO: Actually resolve the trigger effect (needs effect activation system)
        // For now, trash the card as per Rule 10-1-5-3
        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const trashLoc = getHandCostLocationFromNext(next, side);
            trashLoc.trash = [...(trashLoc.trash || []), card];
            return next;
        });

        setTriggerPending(null);
    }, [triggerPending, appendLog, setAreas]);

    const onTriggerDecline = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Damage] ${side} takes 1 damage, adds ${card.id} to hand (declined trigger).`);

        // Add to hand instead
        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const handLoc = getHandCostLocationFromNext(next, side);
            handLoc.hand = [...(handLoc.hand || []), card];
            return next;
        });

        setTriggerPending(null);
    }, [triggerPending, appendLog, setAreas]);

    return {
        triggerPending,
        setTriggerPending,
        dealOneDamageToLeader,
        onTriggerActivate,
        onTriggerDecline,
        hasKeyword
    };
}
