import { useCallback } from 'react';

export default function useMultiplayerBroadcast({
    multiplayer,
    gameMode,
    areas,
    library,
    oppLibrary,
    turnSide,
    turnNumber,
    phase,
    firstPlayer,
    currentHandSide,
    setupPhase,
    openingHandShown,
    playerHandSelected,
    opponentHandSelected,
    getModifierState,
    battle,
    currentAttack,
    battleArrow,
    oncePerTurnUsage,
    attackLocked
}) {
    const broadcastStateToOpponent = useCallback(() => {
        if (gameMode !== 'multiplayer' || !multiplayer.gameStarted || !multiplayer.isHost) {
            return;
        }

        const gameState = {
            areas,
            library,
            oppLibrary,
            turnSide,
            turnNumber,
            phase,
            firstPlayer,
            currentHandSide,
            setupPhase,
            openingHandShown,
            playerHandSelected,
            opponentHandSelected,
            modifiers: getModifierState && getModifierState(),
            battle,
            currentAttack,
            battleArrow,
            oncePerTurnUsage,
            attackLocked
        };

        console.log('[Multiplayer] Host broadcasting comprehensive state');
        multiplayer.broadcastGameState(gameState);
    }, [
        gameMode, multiplayer, areas, library, oppLibrary,
        turnSide, turnNumber, phase, firstPlayer, currentHandSide,
        setupPhase, openingHandShown, playerHandSelected, opponentHandSelected,
        getModifierState, battle, currentAttack, battleArrow, oncePerTurnUsage, attackLocked
    ]);

    const broadcastStateToOpponentBasic = useCallback(() => {
        if (gameMode !== 'multiplayer' || !multiplayer.gameStarted || !multiplayer.isHost) {
            return;
        }

        const gameState = {
            areas,
            library,
            oppLibrary,
            turnSide,
            turnNumber,
            phase,
            firstPlayer,
            currentHandSide,
            setupPhase,
            openingHandShown,
            playerHandSelected,
            opponentHandSelected
        };

        console.log('[Multiplayer] Host broadcasting state (basic)');
        multiplayer.broadcastGameState(gameState);
    }, [gameMode, multiplayer, areas, library, oppLibrary, turnSide, turnNumber, phase, firstPlayer, currentHandSide, setupPhase, openingHandShown, playerHandSelected, opponentHandSelected]);

    return { broadcastStateToOpponent, broadcastStateToOpponentBasic };
}
