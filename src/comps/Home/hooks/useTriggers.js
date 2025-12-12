import { useState, useCallback } from 'react';
import { dealDamageToLeaderMutate, getHandCostRoot, getSideRoot } from './areasUtils';

/**
 * Hook to manage Trigger card mechanics (CR 4-6-3, 10-1-5)
 * Handles life damage, trigger detection, and trigger activation/decline choices
 */
export default function useTriggers({
    metaById,
    appendLog,
    mutateAreas
}) {
    const [triggerPending, setTriggerPending] = useState(null);

    // Case-insensitive keyword check
    const hasKeyword = useCallback((keywords, keyword) => {
        const keywordLower = (keyword || '').toLowerCase();
        return (keywords || []).some(k => (k || '').toLowerCase().includes(keywordLower));
    }, []);

    // Deal 1 damage; check for Trigger (CR 4-6-3, 10-1-5)
    const dealOneDamageToLeader = useCallback((defender) => {
        let cardWithTrigger = null;

        mutateAreas((next) => {
            const sideRoot = getSideRoot(next, defender);
            if (!sideRoot) return;

            const life = sideRoot.life || [];

            // Rule 1-2-1-1-1: Taking damage with 0 Life = defeat condition
            if (!life.length) {
                appendLog(`[DEFEAT] ${defender} has 0 Life and took damage!`);
                return;
            }

            const card = life[life.length - 1];
            const { triggers } = dealDamageToLeaderMutate(next, defender, 1, { metaById, allowTrigger: true });

            if (triggers?.length) {
                cardWithTrigger = triggers[0];
            } else {
                appendLog(`[Damage] ${defender} takes 1 damage, adds ${card.id} to hand.`);
            }
        }, { onErrorLabel: '[dealOneDamageToLeader] Failed' });

        // If trigger detected, pause for player choice
        if (cardWithTrigger) {
            setTriggerPending(cardWithTrigger);
        }
    }, [metaById, appendLog, mutateAreas]);

    const onTriggerActivate = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Trigger] ${side} activates [Trigger] on ${card.id}!`);

        // TODO: Actually resolve the trigger effect (needs effect activation system)
        // For now, trash the card as per Rule 10-1-5-3
        mutateAreas((next) => {
            const trashLoc = getHandCostRoot(next, side);
            if (!trashLoc) return;
            trashLoc.trash = [...(trashLoc.trash || []), card];
        }, { onErrorLabel: '[onTriggerActivate] Failed' });

        setTriggerPending(null);
    }, [triggerPending, appendLog, mutateAreas]);

    const onTriggerDecline = useCallback(() => {
        if (!triggerPending) { return; }

        const { side, card } = triggerPending;
        appendLog(`[Damage] ${side} takes 1 damage, adds ${card.id} to hand (declined trigger).`);

        // Add to hand instead
        mutateAreas((next) => {
            const handLoc = getHandCostRoot(next, side);
            if (!handLoc) return;
            handLoc.hand = [...(handLoc.hand || []), card];
        }, { onErrorLabel: '[onTriggerDecline] Failed' });

        setTriggerPending(null);
    }, [triggerPending, appendLog, mutateAreas]);

    return {
        triggerPending,
        setTriggerPending,
        dealOneDamageToLeader,
        onTriggerActivate,
        onTriggerDecline,
        hasKeyword
    };
}
