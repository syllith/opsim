/**
 * useTurn.js - React State Wrapper for Turn/Phase
 * 
 * PURPOSE: Provides React state for turn tracking that triggers re-renders.
 * This is a THIN WRAPPER - the engine will manage turn/phase transitions.
 * 
 * FUTURE: When engine is implemented:
 * 1. Engine manages canonical turn state
 * 2. This hook subscribes to engine.on('turnChange', ...)
 * 3. UI calls engine.actions.endTurn() instead of directly setting state
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export default function useTurn(initial = { side: 'player', number: 1, phase: 'Draw' }) {
    // Turn state - mirrors engine state for React re-renders
    const [turnSide, setTurnSide] = useState(initial.side);
    const [turnNumber, setTurnNumber] = useState(initial.number);
    const [phase, setPhase] = useState(initial.phase);
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);

    // Ref for async callbacks (avoids stale closures)
    const turnRef = useRef({ turnNumber: initial.number, turnSide: initial.side, phase: initial.phase });
    useEffect(() => {
        turnRef.current = { turnNumber, turnSide, phase };
    }, [turnNumber, turnSide, phase]);

    // Game log (UI feature, not game state)
    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        const { turnNumber: tn, turnSide: ts, phase: ph } = turnRef.current;
        setLog((prev) => [
            ...prev.slice(-199),
            `[T${tn} ${ts} ${ph}] ${msg}`
        ]);
    }, []);
    const resetLog = useCallback(() => setLog([]), []);

    // End turn confirmation (UI feature)
    const [endTurnConfirming, setEndTurnConfirming] = useState(false);
    const endTurnTimeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (endTurnTimeoutRef.current) clearTimeout(endTurnTimeoutRef.current);
        };
    }, []);

    const endTurnWithConfirm = useCallback((confirmTimeout = 2000) => {
        if (!endTurnConfirming) {
            setEndTurnConfirming(true);
            endTurnTimeoutRef.current = setTimeout(() => setEndTurnConfirming(false), confirmTimeout);
            return false;
        }
        setEndTurnConfirming(false);
        return true;
    }, [endTurnConfirming]);

    return {
        // Turn state (will be driven by engine)
        turnSide,
        setTurnSide,
        turnNumber,
        setTurnNumber,
        phase,
        setPhase,
        phaseLower,
        
        // Game log (UI feature)
        log,
        appendLog,
        resetLog,
        
        // End turn confirmation (UI feature)
        endTurnConfirming,
        setEndTurnConfirming,
        endTurnWithConfirm
    };
}
