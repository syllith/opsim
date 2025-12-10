import { useState, useCallback, useEffect } from 'react';
import _ from 'lodash';

/**
 * Hook for attack-related helpers and state management
 * Handles attack locking, once-per-turn tracking, and attack cancellation
 */
export default function useAttackHelpers({
    modKey,
    battle,
    currentAttack,
    setAreas,
    appendLog,
    cancelTargeting,
    setBattle,
    setCurrentAttack,
    turnSide,
    turnNumber
}) {
    const [oncePerTurnUsage, setOncePerTurnUsage] = useState({});
    const [attackLocked, setAttackLocked] = useState(false);

    // Reset Once Per Turn usage each turn
    useEffect(() => {
        setOncePerTurnUsage({});
        setAttackLocked(false);
    }, [turnSide, turnNumber]);

    // Reset attackLocked when attack/battle ends OR when a new attack begins
    useEffect(() => {
        if (!currentAttack && !battle) {
            // No active attack or battle: reset lock
            setAttackLocked(false);
        } else if (currentAttack && battle?.step === 'declaring') {
            // New attack just started in declaring phase: reset lock
            setAttackLocked(false);
        }
    }, [currentAttack, battle]);

    const lockCurrentAttack = useCallback((source, abilityIndex) => {
        try {
            if (!currentAttack || !source) { return; }
            const isLeaderAttack = currentAttack.isLeader;
            const sameSide = source.side === currentAttack.side;
            const sameSection = source.section === (isLeaderAttack ? 'middle' : 'char');
            const sameKey = source.keyName === (isLeaderAttack ? 'leader' : 'char');
            const sameIndex = (source.index ?? 0) === (currentAttack.index ?? 0);
            if (sameSide && sameSection && sameKey && sameIndex) {
                setAttackLocked(true);
            }
        } catch { /* noop */ }
    }, [currentAttack]);

    // Cancel an attack during declaring phase - un-rests the attacker and clears battle state
    const cancelAttack = useCallback(() => {
        if (attackLocked) { return; } // Cannot cancel if locked by When Attacking ability
        if (!battle || battle.step !== 'declaring') { return; } // Only cancel during declaring phase

        const attacker = battle.attacker;
        if (attacker) {
            // Un-rest the attacker
            setAreas((prev) => {
                const next = _.cloneDeep(prev);
                const sideLoc = attacker.side === 'player' ? next.player : next.opponent;
                if (attacker.section === 'char' && attacker.keyName === 'char') {
                    if (sideLoc?.char?.[attacker.index]) {
                        sideLoc.char[attacker.index].rested = false;
                    }
                } else if (attacker.section === 'middle' && attacker.keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = false;
                    }
                }
                return next;
            });
            appendLog(`[Attack] Cancelled attack with ${attacker.id}.`);
        }

        // Clear battle and targeting state
        cancelTargeting();
        setBattle(null);
        setCurrentAttack(null);
    }, [attackLocked, battle, cancelTargeting, setAreas, appendLog, setBattle, setCurrentAttack]);

    const markOncePerTurnUsed = useCallback((source, abilityIndex) => {
        if (!source || typeof abilityIndex !== 'number') { return; }
        const side = source.side || 'player';
        const section = source.section || 'char';
        const keyName = source.keyName || 'char';
        const index = _.isNumber(source.index) ? source.index : 0;
        const key = modKey(side, section, keyName, index);
        setOncePerTurnUsage((prev) => {
            const existing = prev[key] || {};
            if (existing[abilityIndex]) { return prev; }
            return {
                ...prev,
                [key]: { ...existing, [abilityIndex]: true }
            };
        });
    }, [modKey]);

    // Check if two sources reference same card
    const sameOrigin = useCallback((a, b) => {
        return !!(
            a && b &&
            a.side === b.side &&
            a.section === b.section &&
            a.keyName === b.keyName &&
            a.index === b.index
        );
    }, []);

    // Get opposing side helper
    const getOpposingSide = useCallback((side) => {
        return side === 'player' ? 'opponent' : 'player';
    }, []);

    return {
        oncePerTurnUsage,
        setOncePerTurnUsage,
        attackLocked,
        setAttackLocked,
        lockCurrentAttack,
        cancelAttack,
        markOncePerTurnUsed,
        sameOrigin,
        getOpposingSide
    };
}
