// Don.jsx
// Handles all DON!! card distribution, management, and related game mechanics
// Rules: 6-4 (DON Phase), 6-5-5 (Giving DON), 6-2-3 (Returning DON)

import { useCallback, useState } from 'react';
import _ from 'lodash';

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

//. Helper to deep-clone areas safely
const cloneAreas = (prev) => _.cloneDeep(prev);

// Hook for managing DON-related operations
export const useDonManagement = ({
    areas,
    setAreas,
    turnSide,
    phase,
    battle,
    appendLog,
    canPerformGameAction
}) => {
    //. DON!! Giving Selection System
    const [donGivingMode, setDonGivingMode] = useState({
        active: false,
        side: null,          // which side's DON is being given
        selectedDonIndex: null // index of selected DON in cost area
    });

    //. Helper to get the hand/cost/trash/don container (bottom for player, top for opponent)
    const getHandCostLocationFromNext = useCallback((next, side) => {
        return side === 'player' ? next.player.bottom : next.opponent.top;
    }, []);

    //. Helper to get side location from areas state
    const getSideLocationFromNext = useCallback((next, side) => {
        return side === 'player' ? next.player : next.opponent;
    }, []);

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
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const costLoc = getHandCostLocationFromNext(next, side);
            const costArr = costLoc.cost || [];

            //. Get the selected DON card
            if (donGivingMode.selectedDonIndex >= costArr.length) {
                appendLog('[DON Select] Selected DON index out of range.');
                return prev;
            }

            const donCard = costArr[donGivingMode.selectedDonIndex];
            if (!donCard) {
                appendLog('[DON Select] Selected DON not found.');
                return prev;
            }
            if (donCard.id !== 'DON') {
                appendLog('[DON Select] Selected card is not a DON.');
                return prev;
            }
            if (donCard.rested) {
                appendLog('[DON Select] Selected DON is already rested.');
                return prev;
            }

            //. Remove DON from cost area and mark as rested
            const [removedDon] = costArr.splice(donGivingMode.selectedDonIndex, 1);
            const restedDon = { ...removedDon, rested: true };

            //. Place DON underneath target card
            const sideLoc = getSideLocationFromNext(next, side);
            if (targetSection === 'middle' && targetKeyName === 'leader') {
                if (sideLoc.middle.leader[targetIndex]) {
                    if (!sideLoc.middle.leaderDon) sideLoc.middle.leaderDon = [];
                    sideLoc.middle.leaderDon.push(restedDon);
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
                    sideLoc.charDon[targetIndex].push(restedDon);
                    success = true;
                } else {
                    appendLog(`[DON Select] Character target #${targetIndex + 1} missing.`);
                }
            } else {
                appendLog('[DON Select] Invalid target area.');
            }

            return next;
        });

        if (success) {
            const targetName = targetSection === 'middle' ? 'Leader' : `Character #${targetIndex + 1}`;
            appendLog(`[${side}] Gave 1 DON!! to ${targetName}.`);
        }

        //. Reset DON giving mode
        setDonGivingMode({ active: false, side: null, selectedDonIndex: null });

        return success;
    }, [donGivingMode, appendLog, setAreas, getHandCostLocationFromNext, getSideLocationFromNext]);

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

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const costLoc = getHandCostLocationFromNext(next, controllerSide);
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
                return prev;
            }

            //. Add DON!! to target location
            const targetSideLoc = getSideLocationFromNext(next, targetSide);

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

            return next;
        });

        return success;
    }, [appendLog, setAreas, getHandCostLocationFromNext, getSideLocationFromNext]);

    //. Rule 6-4: DON Phase - gain DON!! cards from deck to cost area
    const donPhaseGain = useCallback((side, count) => {
        if (!canPerformGameAction()) return 0; // Cannot gain DON until opening hand is finalized

        let actualMoved = 0;

        setAreas((prev) => {
            const next = cloneAreas(prev);
            const loc = getHandCostLocationFromNext(next, side);
            const available = (loc.don || []).length;

            //. Rules 6-4-1, 6-4-2, 6-4-3: Handle DON!! deck depletion
            if (available === 0) {
                // Rule 6-4-3: If there are 0 cards in DON!! deck, do not place any
                actualMoved = 0;
                return next;
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
            return next;
        });

        return actualMoved;
    }, [canPerformGameAction, setAreas, getHandCostLocationFromNext]);

    //. Rule 6-2-3: Return all DON!! from Leaders/Characters to cost area (called during Refresh Phase)
    const returnAllGivenDon = useCallback((side) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const costLoc = getHandCostLocationFromNext(next, side);

            //. Return given DON!! from Leader
            if (sideLoc?.middle?.leaderDon && sideLoc.middle.leaderDon.length > 0) {
                const count = sideLoc.middle.leaderDon.length;
                appendLog(`[Refresh] Return ${count} DON!! from Leader to cost area.`);
                costLoc.cost = [
                    ...(costLoc.cost || []),
                    ...sideLoc.middle.leaderDon
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
                    costLoc.cost = [...(costLoc.cost || []), ...allCharDon];
                    //. Clear all character DON arrays
                    sideLoc.charDon = sideLoc.charDon.map(() => []);
                }
            }

            return next;
        });
    }, [setAreas, appendLog, getSideLocationFromNext, getHandCostLocationFromNext]);

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
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const costLoc = getHandCostLocationFromNext(next, side);

            if (section === 'char' && keyName === 'char') {
                const donUnderArr = sideLoc?.charDon?.[index] || [];
                if (donUnderArr.length) {
                    costLoc.cost = [...(costLoc.cost || []), ...donUnderArr];
                    appendLog(
                        `[K.O.] Returned ${donUnderArr.length} DON!! to cost area.`
                    );
                    if (Array.isArray(sideLoc.charDon)) {
                        sideLoc.charDon.splice(index, 1);
                    }
                }
            } else if (section === 'middle' && keyName === 'leader') {
                const leaderDon = sideLoc?.middle?.leaderDon || [];
                if (leaderDon.length) {
                    costLoc.cost = [...(costLoc.cost || []), ...leaderDon];
                    sideLoc.middle.leaderDon = [];
                    appendLog(
                        `[Effect KO] Returned ${leaderDon.length} DON!! from leader to cost area.`
                    );
                }
            }

            return next;
        });
    }, [setAreas, appendLog, getSideLocationFromNext, getHandCostLocationFromNext]);

    //. Return up to N DON from a card to the DON deck (schema: ActionReturnDon)
    const returnDonToDonDeckFromCard = useCallback((side, section, keyName, index, count = 1) => {
        let moved = 0;
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const handCostLoc = getHandCostLocationFromNext(next, side);

            //. Determine attached DON array
            let attachedArrRef = null;
            if (section === 'middle' && keyName === 'leader') {
                attachedArrRef = sideLoc?.middle?.leaderDon;
            } else if (section === 'char' && keyName === 'char') {
                attachedArrRef = sideLoc?.charDon?.[index];
            }

            if (!attachedArrRef || attachedArrRef.length === 0) {
                return prev;
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
            return next;
        });
        return moved;
    }, [setAreas, appendLog, getSideLocationFromNext, getHandCostLocationFromNext]);

    //. Detach up to N DON from a card to the cost area (schema: ActionDetachDon)
    const detachDonFromCard = useCallback((side, section, keyName, index, count = 1) => {
        let moved = 0;
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const costLoc = getHandCostLocationFromNext(next, side);

            //. Determine attached DON array
            let attachedArrRef = null;
            if (section === 'middle' && keyName === 'leader') {
                attachedArrRef = sideLoc?.middle?.leaderDon;
            } else if (section === 'char' && keyName === 'char') {
                attachedArrRef = sideLoc?.charDon?.[index];
            }

            if (!attachedArrRef || attachedArrRef.length === 0) {
                return prev;
            }

            //. Remove up to count DON from attached array
            const toDetach = Math.min(count, attachedArrRef.length);
            const removed = attachedArrRef.splice(attachedArrRef.length - toDetach, toDetach);
            moved = removed.length;

            //. Move removed DON to cost area
            costLoc.cost = [...(costLoc.cost || []), ...removed];
            appendLog(`[DON Detach] Moved ${moved} DON!! from card to cost area.`);
            return next;
        });
        return moved;
    }, [setAreas, appendLog, getSideLocationFromNext, getHandCostLocationFromNext]);

    //. Initialize DON decks for both sides (10 each)
    const initializeDonDecks = useCallback(() => {
        setAreas((prev) => {
            const next = cloneAreas(prev);

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

            return next;
        });
    }, [setAreas]);

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
