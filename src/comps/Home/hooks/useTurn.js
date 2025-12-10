import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import _ from 'lodash';

export default function useTurn(initial = { side: 'player', number: 1, phase: 'Draw' }) {
    const [turnSide, setTurnSide] = useState(initial.side);
    const [turnNumber, setTurnNumber] = useState(initial.number);
    const [phase, setPhase] = useState(initial.phase);
    const phaseLower = useMemo(() => phase.toLowerCase(), [phase]);

    const [log, setLog] = useState([]);
    const appendLog = useCallback((msg) => {
        setLog((prev) => [
            ..._.takeRight(prev, 199),
            `[T${turnNumber} ${turnSide} ${phase}] ${msg}`
        ]);
    }, [turnNumber, turnSide, phase]);

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
