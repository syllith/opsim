import { useCallback, useMemo, useEffect } from 'react';
import _ from 'lodash';
import useBroadcastSoon from './useBroadcastSoon';
import { refreshSideToActive } from './areasUtils';

/**
 * Hook for phase-related actions and execution
 * Handles refresh phase, DON phase, draw phase, and turn transitions
 */
export default function usePhaseActions({
    appendLog,
    cleanupOnRefreshPhase,
    returnAllGivenDon,
    mutateAreas,
    canPerformGameAction,
    phaseLower,
    turnNumber,
    turnSide,
    firstPlayer,
    getDonDeckArray,
    setPhase,
    drawCard,
    donPhaseGain,
    cancelDonGiving,
    setTurnNumber,
    setTurnSide,
    getOpposingSide,
    endTurnWithConfirm,
    endTurnConfirming,
    // Battle/targeting blockers
    battle,
    resolvingEffect,
    targeting,
    deckSearchRef,
    triggerPending,
    // Multiplayer
    gameMode,
    multiplayer,
    isMyTurnInMultiplayer,
    broadcastStateToOpponent
}) {
    const broadcastSoon = useBroadcastSoon({ gameMode, multiplayer, broadcastStateToOpponent });

    // Execute Refresh Phase (CR 6-2)
    const executeRefreshPhase = useCallback((side) => {
        appendLog(`[Refresh Phase] Start ${side}'s turn.`);
        cleanupOnRefreshPhase(side); // Cleanup modifiers and until-next-turn effects
        // TODO: 6-2-2 - Activate "at the start of your/opponent's turn" effects
        returnAllGivenDon(side); // 6-2-3: Return DON from leaders/characters

        // 6-2-4: Set all rested cards to active
        mutateAreas((next) => {
            refreshSideToActive(next, side);
        }, { onErrorLabel: '[Refresh Phase] Failed to set cards active' });

        appendLog('[Refresh Phase] Complete.');
    }, [appendLog, cleanupOnRefreshPhase, returnAllGivenDon, mutateAreas]);

    // Label for Next Action button based on phase
    const nextActionLabel = useMemo(() => {
        if (phaseLower === 'draw') return 'Draw Card';
        if (phaseLower === 'don') {
            const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
            const donDeck = getDonDeckArray(turnSide);
            const availableDon = _.size(donDeck);
            const actualAmount = Math.min(requestedAmount, availableDon);
            return `Gain ${actualAmount} DON!!`;
        }
        return endTurnConfirming ? 'Are you sure?' : 'End Turn';
    }, [phaseLower, turnNumber, turnSide, endTurnConfirming, getDonDeckArray]);

    // Auto-skip DON phase if deck empty
    useEffect(() => {
        if (!canPerformGameAction() || phaseLower !== 'don') return;

        const requestedAmount = turnNumber === 1 && turnSide === 'player' ? 1 : 2;
        const donDeck = getDonDeckArray(turnSide);
        const availableDon = donDeck.length;
        const actualAmount = Math.min(requestedAmount, availableDon);

        if (actualAmount === 0) {
            appendLog('DON!! deck empty: skipping DON phase.');
            setPhase('Main');
        }
    }, [phaseLower, turnNumber, turnSide, canPerformGameAction, getDonDeckArray, appendLog, setPhase]);

    // Handle Draw/DON/End Turn button
    const onNextAction = useCallback(() => {
        // In multiplayer, only allow actions on your turn
        if (gameMode === 'multiplayer' && !isMyTurnInMultiplayer) {
            appendLog('Wait for your turn!');
            return;
        }
        
        if (
            battle ||
            resolvingEffect ||
            targeting.active ||
            (deckSearchRef.current?.active) ||
            triggerPending
        ) {
            appendLog('Cannot end turn while resolving effects or selections.');
            return;
        }
        if (!canPerformGameAction()) return;

        // First turn: the player who won the dice roll's first turn (skip draw, get 1 DON)
        const isFirst = turnNumber === 1 && turnSide === firstPlayer;

        if (phaseLower === 'draw') {
            if (!isFirst) {
                drawCard(turnSide);
            }
            appendLog(isFirst ? 'First turn: skip draw.' : 'Draw 1.');

            setPhase('Don');

            broadcastSoon(100);
            return;
        }

        if (phaseLower === 'don') {
            const amt = isFirst ? 1 : 2;

            const actualGained = donPhaseGain(turnSide, amt);
            if (actualGained === 0) {
                appendLog('DON!! deck empty: gained 0 DON!!');
            } else if (actualGained < amt) {
                appendLog(`DON!! deck low: gained ${actualGained} DON!! (requested ${amt})`);
            } else {
                appendLog(`DON!! +${actualGained}.`);
            }
            setPhase('Main');

            broadcastSoon(100);
            return;
        }

        // Handle end-turn confirmation (first click arms, second click proceeds)
        if (!endTurnWithConfirm(3000)) return;
        
        appendLog('[End Phase] End turn.');
        const nextSide = getOpposingSide(turnSide);
        cancelDonGiving();
        setTurnNumber((n) => n + 1);
        setTurnSide(nextSide);

        // Execute Refresh Phase for the new turn player (rule 6-2)
        executeRefreshPhase(nextSide);

        setPhase('Draw');

        broadcastSoon(125);
    }, [
        battle,
        resolvingEffect,
        targeting,
        triggerPending,
        canPerformGameAction,
        turnNumber,
        turnSide,
        firstPlayer,
        phaseLower,
        drawCard,
        appendLog,
        donPhaseGain,
        getOpposingSide,
        cancelDonGiving,
        executeRefreshPhase,
        endTurnWithConfirm,
        gameMode,
        multiplayer,
        isMyTurnInMultiplayer,
        broadcastStateToOpponent,
        broadcastSoon,
        setPhase,
        setTurnNumber,
        setTurnSide,
        deckSearchRef
    ]);

    return {
        executeRefreshPhase,
        nextActionLabel,
        onNextAction
    };
}
