import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export default function useTurn(initial = { side: 'player', number: 1, phase: 'Draw' }) {
    const [turnSide, setTurnSide] = useState(initial.side);
    const [turnNumber, setTurnNumber] = useState(initial.number);
    const [phase, setPhase] = useState(initial.phase);
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);

    const turnRef = useRef({ turnNumber: initial.number, turnSide: initial.side, phase: initial.phase });
    useEffect(() => {
        turnRef.current = { turnNumber, turnSide, phase };
    }, [turnNumber, turnSide, phase]);

    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        const { turnNumber: tn, turnSide: ts, phase: ph } = turnRef.current;
        setLog((prev) => [
            ...prev.slice(-199),
            `[T${tn} ${ts} ${ph}] ${msg}`
        ]);
    }, []);

    const [endTurnConfirming, setEndTurnConfirming] = useState(false);
    const endTurnTimeoutRef = useRef(null);

    useEffect(() => {
        return () => {
            if (endTurnTimeoutRef.current) {
                clearTimeout(endTurnTimeoutRef.current);
            }
        };
    }, []);

    const endTurnWithConfirm = useCallback((confirmTimeout = 2000) => {
        if (!endTurnConfirming) {
            setEndTurnConfirming(true);
            endTurnTimeoutRef.current = setTimeout(() => setEndTurnConfirming(false), confirmTimeout);
            return false; // not ended yet
        }
        setEndTurnConfirming(false);
        return true; // proceed to end
    }, [endTurnConfirming]);

    return {
        turnSide,
        setTurnSide,
        turnNumber,
        setTurnNumber,
        phase,
        setPhase,
        phaseLower,
        log,
        appendLog,
        resetLog: () => setLog([]),
        endTurnConfirming,
        setEndTurnConfirming,
        endTurnWithConfirm
    };
}
