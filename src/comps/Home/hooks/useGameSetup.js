/**
 * useGameSetup - STUB
 * TODO: Replace with engine initialization flow
 * 
 * This hook previously managed game setup state machine.
 * Now returns stub state and functions.
 * Real implementation will coordinate with src/engine/
 */
import { useState, useCallback } from 'react';

export default function useGameSetup() {
    const [setupPhase, setSetupPhase] = useState('idle');
    const [firstPlayer, setFirstPlayer] = useState(null);

    // STUB: Engine will handle game start
    const startGame = useCallback(() => {
        console.warn('[useGameSetup.startGame] STUB - engine not implemented');
        setSetupPhase('complete');
    }, []);

    // STUB: Engine will handle setup phases
    const advanceSetup = useCallback(() => {
        console.warn('[useGameSetup.advanceSetup] STUB - engine not implemented');
    }, []);

    // STUB: Reset to idle
    const resetSetup = useCallback(() => {
        setSetupPhase('idle');
        setFirstPlayer(null);
    }, []);

    return {
        setupPhase,
        setSetupPhase,
        firstPlayer,
        setFirstPlayer,
        startGame,
        advanceSetup,
        resetSetup
    };
}
