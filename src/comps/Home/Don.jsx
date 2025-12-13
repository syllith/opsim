// Don.jsx
// Handles all DON!! card distribution, management, and related game mechanics
// Rules: 6-4 (DON Phase), 6-5-5 (Giving DON), 6-2-3 (Returning DON)

import { useCallback, useState } from 'react';
import _ from 'lodash';
import { getHandCostRoot, getSideRoot, returnDonFromCardMutate } from './hooks/areasUtils';

// DON!! card constants
export const DON_FRONT_CONSTANT = {
    id: 'DON',
    full: '/api/cards/assets/Don/Don.png',
    thumb: '/api/cards/assets/Don/Don.png'
};

export const DON_BACK_CONSTANT = {
    id: 'DON_BACK',
    full: '/api/cards/assets/Card%20Backs/CardBackDon.png',
    thumb: '/api/cards/assets/Card%20Backs/CardBackDon.png'
};

// Hook for managing DON-related operations
export const useDonManagement = ({
    areas,
    setAreas,
    mutateAreas,
    turnSide,
    phase,
    battle,
    appendLog,
    canPerformGameAction
}) => {
    const mutateAreasSafe = useCallback((recipeFn, { onErrorLabel } = {}) => {
        if (typeof mutateAreas === 'function') {
            mutateAreas(recipeFn, { onErrorLabel });
            return;
        }

        // Back-compat fallback if caller still passes setAreas only.
        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            try {
                recipeFn(next, prev);
                return next;
            } catch (error) {
                console.warn(onErrorLabel || '[mutateAreasSafe] Failed', error);
                return prev;
            }
        });
    }, [mutateAreas, setAreas]);
    //. DON!! Giving Selection System
    const [donGivingMode, setDonGivingMode] = useState({
        active: false,
        side: null,          // which side's DON is being given
        selectedDonIndex: null // index of selected DON in cost area
    });

    //. Helper to get DON deck array for a side
    const getDonDeckArray = useCallback((side) => {
        return side === 'player'
            ? (areas?.player?.bottom?.don || [])
            : (areas?.opponent?.top?.don || []);
    }, [areas]);

    //. Rule 6-5-5: Start DON!! giving mode - select a DON!! card from cost area
    const startDonGiving = useCallback((side, donIndex) => {
        if (!canPerformGameAction()) return; // Cannot give DON until opening hand is finalized

        if (side !== turnSide) {
            appendLog(`Cannot give DON: not ${side}'s turn.`);
            return;
        }

        const phaseLower = phase.toLowerCase();
        if (phaseLower !== 'main') {
            appendLog('Cannot give DON: must be Main Phase.');
            return;
        }

        if (battle) {
            appendLog('Cannot give DON during battle.');
            return;
        }

        setDonGivingMode({
            active: true,
            side,
            selectedDonIndex: donIndex
        });
        appendLog('[DON Select] Click a Leader or Character to give DON!!.');
    }, [canPerformGameAction, turnSide, phase, battle, appendLog]);

    //. Cancel DON!! giving mode
    const cancelDonGiving = useCallback(() => {
        if (donGivingMode.active) {
            appendLog('[DON Select] Cancelled.');
        }
        setDonGivingMode({ active: false, side: null, selectedDonIndex: null });
    }, [donGivingMode.active, appendLog]);

    //. Rule 6-5-5: Give DON!! Cards - complete the giving action
    const giveDonToCard = useCallback((side, targetSection, targetKeyName, targetIndex) => {
        if (!donGivingMode.active) {
            appendLog('[DON Select] Not in DON giving mode.');
            return false;
        }
        if (donGivingMode.side !== side) {
            appendLog(`[DON Select] Wrong side for giving (expected ${donGivingMode.side}, got ${side}).`);
            return false;
        }

        let success = false;
        mutateAreasSafe((next) => {
            const costLoc = getHandCostRoot(next, side);
            const costArr = costLoc?.cost || [];

            //. Get the selected DON card
            if (donGivingMode.selectedDonIndex >= costArr.length) {
                appendLog('[DON Select] Selected DON index out of range.');
                return;
            }

            const donCard = costArr[donGivingMode.selectedDonIndex];
            if (!donCard) {
                appendLog('[DON Select] Selected DON not found.');
                return;
            }
            if (donCard.id !== 'DON') {
                appendLog('[DON Select] Selected card is not a DON.');
                return;
            }
            if (donCard.rested) {
                appendLog('[DON Select] Selected DON is already rested.');
                return;
            }

            //. Remove DON from cost area and give it to the card.
            //. CR 6-5-5-1: you place 1 ACTIVE DON!! under the card (giving does not rest it).
            const [removedDon] = costArr.splice(donGivingMode.selectedDonIndex, 1);
            const givenDon = { ...removedDon, rested: false };

            //. Place DON underneath target card
            const sideLoc = getSideRoot(next, side);
            if (targetSection === 'middle' && targetKeyName === 'leader') {
                if (sideLoc.middle.leader[targetIndex]) {
                    if (!sideLoc.middle.leaderDon) sideLoc.middle.leaderDon = [];
                    sideLoc.middle.leaderDon.push(givenDon);
                    success = true;
                } else {
                    appendLog('[DON Select] Leader target missing.');
                }
            } else if (targetSection === 'char' && targetKeyName === 'char') {
                if (sideLoc.char && sideLoc.char[targetIndex]) {
                    if (!sideLoc.charDon) sideLoc.charDon = [];
                    while (sideLoc.charDon.length <= targetIndex) {
                        sideLoc.charDon.push([]);
                    }
                    sideLoc.charDon[targetIndex].push(givenDon);
                    success = true;
                } else {
                    appendLog(`[DON Select] Character target #${targetIndex + 1} missing.`);
                }
            } else {
                appendLog('[DON Select] Invalid target area.');
            }

        }, { onErrorLabel: '[giveDonToCard] Failed' });

        if (success) {
            const targetName = targetSection === 'middle' ? 'Leader' : `Character #${targetIndex + 1}`;
            appendLog(`[${side}] Gave 1 DON!! to ${targetName}.`);
        }

        //. Reset DON giving mode
        setDonGivingMode({ active: false, side: null, selectedDonIndex: null });

        return success;
    }, [donGivingMode, appendLog, mutateAreasSafe]);

    //. Move DON!! from cost area to a card (for ability effects, bypasses donGivingMode)
    const moveDonFromCostToCard = useCallback((
        controllerSide,
        targetSide,
        targetSection,
        targetKeyName,
        targetIndex,
        quantity = 1,
        onlyRested = true
    ) => {
        let success = false;

        mutateAreasSafe((next) => {
            const costLoc = getHandCostRoot(next, controllerSide);
            const sourceCostArr = costLoc.cost || [];

            //. Find and remove DON!! from cost area
            const donToMove = [];
            while (donToMove.length < quantity) {
                const donIndex = sourceCostArr.findIndex(
                    (d) => d.id === 'DON' && (onlyRested ? d.rested : true)
                );
                if (donIndex < 0) break;
                const [don] = sourceCostArr.splice(donIndex, 1);
                donToMove.push(don);
            }

            if (!donToMove.length) {
                appendLog('[giveDon] No DON!! found to move');
                return;
            }

            //. Add DON!! to target location
            const targetSideLoc = getSideRoot(next, targetSide);

            if (targetSection === 'middle' && targetKeyName === 'leader') {
                targetSideLoc.middle.leaderDon = [
                    ...(targetSideLoc.middle.leaderDon || []),
                    ...donToMove
                ];
                appendLog(`[giveDon] Moved ${donToMove.length} DON!! to ${targetSide} leader`);
                success = true;
            } else if (targetSection === 'char' && targetKeyName === 'char') {
                if (!targetSideLoc.charDon) targetSideLoc.charDon = [];
                if (!targetSideLoc.charDon[targetIndex]) {
                    targetSideLoc.charDon[targetIndex] = [];
                }
                targetSideLoc.charDon[targetIndex] = [
                    ...targetSideLoc.charDon[targetIndex],
                    ...donToMove
                ];
                appendLog(
                    `[giveDon] Moved ${donToMove.length} DON!! to ${targetSide} character at index ${targetIndex}`
                );
                success = true;
            }

        }, { onErrorLabel: '[moveDonFromCostToCard] Failed' });

        return success;
    }, [appendLog, mutateAreasSafe]);

    //. Rule 6-4: DON Phase - gain DON!! cards from deck to cost area
    const donPhaseGain = useCallback((side, count) => {
        if (!canPerformGameAction()) return 0; // Cannot gain DON until opening hand is finalized

        let actualMoved = 0;

        mutateAreasSafe((next) => {
            const loc = getHandCostRoot(next, side);
            const available = (loc.don || []).length;

            //. Rules 6-4-1, 6-4-2, 6-4-3: Handle DON!! deck depletion
            if (available === 0) {
                // Rule 6-4-3: If there are 0 cards in DON!! deck, do not place any
                actualMoved = 0;
                return;
            }

            //. Rule 6-4-2: If only 1 card in DON!! deck, place only 1
            const toMove = Math.min(count, available);
            actualMoved = toMove;

            const moved = Array.from(
                { length: toMove },
                () => ({ ...DON_FRONT_CONSTANT, rested: false })
            );
            loc.don = (loc.don || []).slice(0, -toMove);
            loc.cost = [...(loc.cost || []), ...moved];
        }, { onErrorLabel: '[donPhaseGain] Failed' });

        return actualMoved;
    }, [canPerformGameAction, mutateAreasSafe]);

    //. Rule 6-2-3: Return all DON!! from Leaders/Characters to cost area (called during Refresh Phase)
    const returnAllGivenDon = useCallback((side) => {
        mutateAreasSafe((next) => {
            const sideLoc = getSideRoot(next, side);
            const costLoc = getHandCostRoot(next, side);

            //. Return given DON!! from Leader
            if (sideLoc?.middle?.leaderDon && sideLoc.middle.leaderDon.length > 0) {
                const count = sideLoc.middle.leaderDon.length;
                appendLog(`[Refresh] Return ${count} DON!! from Leader to cost area.`);
                costLoc.cost = [
                    ...(costLoc.cost || []),
                    ...sideLoc.middle.leaderDon.map((d) => ({ ...d, rested: true }))
                ];
                sideLoc.middle.leaderDon = [];
            }

            //. Return given DON!! from Characters
            if (Array.isArray(sideLoc?.charDon)) {
                let totalReturned = 0;
                const allCharDon = [];

                sideLoc.charDon.forEach((donArr) => {
                    if (donArr && donArr.length > 0) {
                        totalReturned += donArr.length;
                        allCharDon.push(...donArr);
                    }
                });

                if (totalReturned > 0) {
                    appendLog(
                        `[Refresh] Return ${totalReturned} DON!! from Characters to cost area.`
                    );
                    costLoc.cost = [
                        ...(costLoc.cost || []),
                        ...allCharDon.map((d) => ({ ...d, rested: true }))
                    ];
                    //. Clear all character DON arrays
                    sideLoc.charDon = sideLoc.charDon.map(() => []);
                }
            }

        }, { onErrorLabel: '[returnAllGivenDon] Failed' });
    }, [mutateAreasSafe, appendLog]);

    //. Helper to get cost array for a side
    const getCostArray = useCallback((side) => {
        return side === 'player'
            ? (areas?.player?.bottom?.cost || [])
            : (areas?.opponent?.top?.cost || []);
    }, [areas]);

    //. Check if a side has enough active DON!! to pay a cost
    const hasEnoughDonFor = useCallback((side, cost) => {
        if (!cost || cost <= 0) return true;
        const arr = getCostArray(side);
        const active = arr.filter((c) => c.id === 'DON' && !c.rested).length;
        return active >= cost;
    }, [getCostArray]);

    //. Calculate DON bonus power (Rule 6-5-5-2: +1000 per DON during your turn)
    const getDonPowerBonus = useCallback((side, section, keyName, index) => {
        if (side !== turnSide) return 0;

        try {
            const sideLoc = side === 'player' ? areas.player : areas.opponent;

            if (section === 'middle' && keyName === 'leader') {
                const leaderDonArr = sideLoc?.middle?.leaderDon || [];
                return leaderDonArr.length * 1000;
            }

            if (section === 'char' && keyName === 'char') {
                const charDonArr = sideLoc?.charDon?.[index] || [];
                return charDonArr.length * 1000;
            }
        } catch {
            // Ignore errors during power calculation
        }
        return 0;
    }, [areas, turnSide]);

    //. Rule 6-5-5-4: Return given DON!! to cost area when a card moves from field
    const returnDonFromCard = useCallback((side, section, keyName, index) => {
        mutateAreasSafe((next) => {
            const returned = returnDonFromCardMutate(next, side, section, keyName, index);
            if (returned > 0) {
                if (section === 'char' && keyName === 'char') {
                    appendLog(
                        `[K.O.] Returned ${returned} DON!! to cost area.`
                    );
                } else if (section === 'middle' && keyName === 'leader') {
                    appendLog(
                        `[Effect KO] Returned ${returned} DON!! from leader to cost area.`
                    );
                }
            }
        }, { onErrorLabel: '[returnDonFromCard] Failed' });
    }, [appendLog, mutateAreasSafe]);

    //. Return up to N DON from a card to the DON deck (schema: ActionReturnDon)
    const returnDonToDonDeckFromCard = useCallback((side, section, keyName, index, count = 1) => {
        let moved = 0;
        mutateAreasSafe((next) => {
            const sideLoc = getSideRoot(next, side);
            const handCostLoc = getHandCostRoot(next, side);

            //. Determine attached DON array
            let attachedArrRef = null;
            if (section === 'middle' && keyName === 'leader') {
                attachedArrRef = sideLoc?.middle?.leaderDon;
            } else if (section === 'char' && keyName === 'char') {
                attachedArrRef = sideLoc?.charDon?.[index];
            }

            if (!attachedArrRef || attachedArrRef.length === 0) {
                return;
            }

            //. Remove up to count DON from attached array
            const toReturn = Math.min(count, attachedArrRef.length);
            const removed = attachedArrRef.splice(attachedArrRef.length - toReturn, toReturn);
            moved = removed.length;

            //. Push DON_BACK entries into DON deck (maintain deck count semantics)
            const donDeckArr = handCostLoc.don || [];
            for (let i = 0; i < moved; i++) {
                donDeckArr.push({ ...DON_BACK_CONSTANT });
            }
            handCostLoc.don = donDeckArr;

            appendLog(`[DON Return] Returned ${moved} DON!! to ${side} DON deck.`);
        }, { onErrorLabel: '[returnDonToDonDeckFromCard] Failed' });
        return moved;
    }, [appendLog, mutateAreasSafe]);

    //. Detach up to N DON from a card to the cost area (schema: ActionDetachDon)
    const detachDonFromCard = useCallback((side, section, keyName, index, count = 1) => {
        let moved = 0;
        mutateAreasSafe((next) => {
            const sideLoc = getSideRoot(next, side);
            const costLoc = getHandCostRoot(next, side);

            //. Determine attached DON array
            let attachedArrRef = null;
            if (section === 'middle' && keyName === 'leader') {
                attachedArrRef = sideLoc?.middle?.leaderDon;
            } else if (section === 'char' && keyName === 'char') {
                attachedArrRef = sideLoc?.charDon?.[index];
            }

            if (!attachedArrRef || attachedArrRef.length === 0) {
                return;
            }

            //. Remove up to count DON from attached array
            const toDetach = Math.min(count, attachedArrRef.length);
            const removed = attachedArrRef.splice(attachedArrRef.length - toDetach, toDetach);
            moved = removed.length;

            //. Move removed DON to cost area
            costLoc.cost = [...(costLoc.cost || []), ...removed];
            appendLog(`[DON Detach] Moved ${moved} DON!! from card to cost area.`);
        }, { onErrorLabel: '[detachDonFromCard] Failed' });
        return moved;
    }, [appendLog, mutateAreasSafe]);

    //. Initialize DON decks for both sides (10 each)
    const initializeDonDecks = useCallback(() => {
        mutateAreasSafe((next) => {
            //. DON!! decks (10 each)
            next.player.bottom.don = Array.from(
                { length: 10 },
                () => ({ ...DON_BACK_CONSTANT })
            );
            next.opponent.top.don = Array.from(
                { length: 10 },
                () => ({ ...DON_BACK_CONSTANT })
            );

            //. Cost areas empty
            next.player.bottom.cost = [];
            next.opponent.top.cost = [];
        }, { onErrorLabel: '[initializeDonDecks] Failed' });
    }, [mutateAreasSafe]);

    return {
        donGivingMode,
        startDonGiving,
        cancelDonGiving,
        giveDonToCard,
        moveDonFromCostToCard,
        donPhaseGain,
        returnAllGivenDon,
        getDonPowerBonus,
        returnDonFromCard,
            returnDonToDonDeckFromCard,
            detachDonFromCard,
        initializeDonDecks,
        getDonDeckArray,
        hasEnoughDonFor
    };
};
