import { useCallback } from 'react';
import _ from 'lodash';
import useBroadcastSoon from './useBroadcastSoon';
import { getHandCostRoot, getSideRoot, restDonForCost } from './areasUtils';

/**
 * Hook for playing cards from hand to character area
 * Handles cost payment, card placement, and multiplayer sync
 */
export default function usePlayCard({
    actionCard,
    actionCardIndex,
    actionSource,
    canPerformGameAction,
    canPlayNow,
    turnSide,
    appendLog,
    getCardCost,
    hasEnoughDonFor,
    mutateAreas,
    turnNumber,
    gameMode,
    multiplayer,
    broadcastStateToOpponent
}) {
    const broadcastSoon = useBroadcastSoon({ gameMode, multiplayer, broadcastStateToOpponent });

    const playSelectedCard = useCallback(() => {
        // Cannot play cards until opening hand is finalized
        if (!canPerformGameAction()) return;
        if (!actionCard) return;

        const side = actionSource?.side === 'opponent' ? 'opponent' : 'player';

        // Enforce timing: only during your Main and no battle
        if (!canPlayNow(side)) return;

        // RULE ENFORCEMENT: Only the turn player can play cards (6-5-3)
        if (side !== turnSide) {
            appendLog(`Cannot play ${actionCard.id}: not ${side}'s turn.`);
            return;
        }

        const section = actionSource?.section || 'bottom';
        const keyName = actionSource?.keyName || 'hand';
        const index = actionCardIndex >= 0 ? actionCardIndex : 0;
        const cost = getCardCost(actionCard.id, side, section, keyName, index);

        if (!hasEnoughDonFor(side, cost)) {
            appendLog(`Cannot play ${actionCard.id}: need ${cost} DON (${side}).`);
            return;
        }

        mutateAreas((next) => {
            const sideRoot = getSideRoot(next, side);
            const handCostRoot = getHandCostRoot(next, side);
            if (!sideRoot || !handCostRoot) return;

            const hand = handCostRoot.hand || [];
            const cardIndex = actionCardIndex >= 0
                ? actionCardIndex
                : _.findIndex(hand, ['id', actionCard.id]);
            const chars = sideRoot.char || [];

            // Can only play if we found the card and have room
            if (cardIndex === -1 || chars.length >= 5) {
                return;
            }

            // Pay DON cost
            restDonForCost(next, side, cost);

            // Remove from hand and place on field
            const [cardToPlay] = hand.splice(cardIndex, 1);
            handCostRoot.hand = hand;

            const placedCard = { ...cardToPlay, rested: false, enteredTurn: turnNumber, justPlayed: true };
            chars.push(placedCard);
            sideRoot.char = chars;
        }, { onErrorLabel: '[playSelectedCard] Failed' });

        const logMessage = `[${side}] Played ${actionCard.id}${cost ? ` by resting ${cost} DON` : ''}.`;
        appendLog(logMessage);

        // Multiplayer: after local mutation, sync state to server (single broadcast)
        // The useMultiplayerBroadcast hook will handle skipping if applying server state
        broadcastSoon(100);
    }, [
        actionCard,
        actionCardIndex,
        actionSource,
        canPerformGameAction,
        canPlayNow,
        turnSide,
        appendLog,
        getCardCost,
        hasEnoughDonFor,
        mutateAreas,
        turnNumber,
        gameMode,
        multiplayer,
        broadcastStateToOpponent,
        broadcastSoon
    ]);

    return {
        playSelectedCard
    };
}
