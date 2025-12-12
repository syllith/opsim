import { useCallback } from 'react';
import _ from 'lodash';

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
    setAreas,
    cloneAreas,
    turnNumber,
    gameMode,
    multiplayer,
    broadcastStateToOpponent
}) {
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

        let placedFieldIndex = -1;

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const isPlayer = side === 'player';

            const hand = _.get(next, isPlayer ? 'player.bottom.hand' : 'opponent.top.hand', []);
            const cardIndex = actionCardIndex >= 0
                ? actionCardIndex
                : _.findIndex(hand, ['id', actionCard.id]);
            const chars = _.get(next, isPlayer ? 'player.char' : 'opponent.char', []);

            // Can only play if we found the card and have room
            if (cardIndex === -1 || chars.length >= 5) {
                return next;
            }

            // Pay DON cost
            if (cost > 0) {
                const pool = isPlayer ? (next.player.bottom.cost || []) : (next.opponent.top.cost || []);
                let remainingCost = cost;

                for (let i = 0; i < pool.length && remainingCost > 0; i++) {
                    const don = pool[i];
                    if (don.id === 'DON' && !don.rested) {
                        don.rested = true;
                        remainingCost--;
                    }
                }
            }

            // Remove from hand and place on field
            const [cardToPlay] = hand.splice(cardIndex, 1);
            if (isPlayer) {
                next.player.bottom.hand = hand;
            } else {
                next.opponent.top.hand = hand;
            }

            placedFieldIndex = chars.length;
            const placedCard = { ...cardToPlay, rested: false, enteredTurn: turnNumber, justPlayed: true };

            if (isPlayer) {
                next.player.char = [...chars, placedCard];
            } else {
                next.opponent.char = [...chars, placedCard];
            }

            return next;
        });

        const logMessage = `[${side}] Played ${actionCard.id}${cost ? ` by resting ${cost} DON` : ''}.`;
        appendLog(logMessage);

        // Multiplayer: after local mutation, sync state to server (single broadcast)
        // The useMultiplayerBroadcast hook will handle skipping if applying server state
        if (gameMode === 'multiplayer' && multiplayer?.gameStarted && typeof broadcastStateToOpponent === 'function') {
            setTimeout(() => {
                broadcastStateToOpponent();
            }, 100);
        }
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
        setAreas,
        cloneAreas,
        turnNumber,
        gameMode,
        multiplayer,
        broadcastStateToOpponent
    ]);

    return {
        playSelectedCard
    };
}
