import { useCallback } from 'react';
import _ from 'lodash';
import { getHandCostRoot, getSideRoot, payLifeCostMutate, returnDonFromCardMutate } from './areasUtils';

/**
 * Hook for resolving card effects including replacement effects
 * Handles removal prevention, effect KO, and related game mechanics
 */
export default function useEffectResolution({
    mutateAreas,
    appendLog,
    metaById,
    getSideLocation,
    turnNumber,
    turnSide,
    applyPowerMod,
    registerUntilNextTurnEffect
}) {
    const getRemovalReplacementAction = useCallback((targetSide, section, keyName, index, sourceSide) => {
        try {
            // Only applies when the source is the opponent of the target controller
            if (!targetSide || !sourceSide || targetSide === sourceSide) {
                return null;
            }

            // Only applies to fielded Leader/Character
            const isCharacter = section === 'char' && keyName === 'char';
            const isLeader = section === 'middle' && keyName === 'leader';
            if (!isCharacter && !isLeader) {
                return null;
            }

            // Get the card instance
            const sideLoc = getSideLocation(targetSide);
            const cardInstance = isCharacter ? sideLoc?.char?.[index] : sideLoc?.middle?.leader?.[0];
            if (!cardInstance?.id) {
                return null;
            }

            const meta = metaById.get(cardInstance.id);
            if (!meta) { return null; }

            const abilities = _.get(meta, 'abilities', []);

            // Events that represent "would be removed by opponent's effect"
            const removalEvents = [
                'beforeThisRemovedByOpponentsEffect',
                'wouldBeRemovedFromFieldByOpponentsEffect',
                'thisCardWouldBeRemovedFromFieldByOpponentsEffect'
            ];

            let foundAbility = null;
            let foundAction = null;

            for (let abilityIdx = 0; abilityIdx < abilities.length; abilityIdx++) {
                const ability = abilities[abilityIdx];
                // Only static/continuous abilities can have permanent replacement effects
                if (ability.timing !== 'static') continue;

                const actions = _.get(ability, 'actions', []);
                for (const action of actions) {
                    if (action.type !== 'replacementEffect') continue;
                    if (!removalEvents.includes(action.event)) continue;

                    // Check that target refers to this card
                    const targetRef = action.target;
                    let targetSelector = null;
                    if (typeof targetRef === 'string') {
                        if (targetRef === 'selfThisCard' || targetRef === 'thisCard') {
                            targetSelector = { side: 'self', type: 'thisCard' };
                        } else if (ability.selectors && ability.selectors[targetRef]) {
                            targetSelector = ability.selectors[targetRef];
                        }
                    } else if (typeof targetRef === 'object') {
                        targetSelector = targetRef;
                    }

                    if (!targetSelector || targetSelector.type !== 'thisCard') continue;

                    foundAbility = ability;
                    foundAction = action;
                    break;
                }
                if (foundAction) break;
            }

            if (!foundAction) { return null; }

            // Check frequency: oncePerTurn
            const usedTurnProp = '__replacementUsedTurn';
            const frequency = foundAbility.frequency || 'none';
            if (frequency === 'oncePerTurn') {
                if (cardInstance[usedTurnProp] === turnNumber) {
                    return null;
                }
            }

            // Check maxTriggers if specified
            const maxTriggers = foundAction.maxTriggers || Infinity;
            const triggersUsedProp = '__replacementTriggersUsed';
            const triggersUsed = cardInstance[triggersUsedProp] || 0;
            if (triggersUsed >= maxTriggers) {
                return null;
            }

            return {
                isCharacter,
                isLeader,
                cardInstance,
                meta,
                foundAbility,
                foundAction,
                usedTurnProp,
                triggersUsedProp,
                triggersUsed,
                cardIndex: isCharacter ? index : 0
            };
        } catch {
            return null;
        }
    }, [getSideLocation, metaById, turnNumber]);

    const applyRemovalReplacementAction = useCallback((targetSide, section, keyName, index, actionInfo) => {
        try {
            if (!actionInfo) return false;

            const {
                isCharacter,
                isLeader,
                cardInstance,
                meta,
                foundAbility,
                foundAction,
                usedTurnProp,
                triggersUsedProp,
                triggersUsed,
                cardIndex
            } = actionInfo;

            const nestedActions = foundAction.actions || [];
            const expireOnSide = turnSide === 'player' ? 'opponent' : 'player';

            let appliedAnyEffect = false;

            for (const nestedAction of nestedActions) {
                if (nestedAction.type === 'noop') {
                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} cannot be removed by opponent's effect.`);
                } else if (nestedAction.type === 'modifyStat' && nestedAction.stat === 'power') {
                    const amount = nestedAction.amount || 0;
                    const duration = nestedAction.duration || 'thisTurn';

                    applyPowerMod(targetSide, section, keyName, cardIndex, amount, expireOnSide);

                    if (registerUntilNextTurnEffect && duration === 'thisTurn') {
                        registerUntilNextTurnEffect(
                            expireOnSide,
                            `${meta.cardName || cardInstance.id}: replacement ${amount} power applied instead of removal`
                        );
                    }

                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} gains ${amount} power instead of being removed.`);
                } else if (nestedAction.type === 'preventKO') {
                    appliedAnyEffect = true;
                    appendLog(`[Replacement Effect] ${meta.cardName || cardInstance.id} KO prevented.`);
                }
            }

            if (!appliedAnyEffect) {
                return false;
            }

            // Persist the usage flag on areas + return any given DON!! to cost area (single pass)
            mutateAreas((next) => {
                const loc = getSideRoot(next, targetSide);
                if (isCharacter && loc?.char?.[cardIndex]) {
                    loc.char[cardIndex][usedTurnProp] = turnNumber;
                    loc.char[cardIndex][triggersUsedProp] = triggersUsed + 1;
                } else if (isLeader && loc?.middle?.leader?.[0]) {
                    loc.middle.leader[0][usedTurnProp] = turnNumber;
                    loc.middle.leader[0][triggersUsedProp] = triggersUsed + 1;
                }

                const returned = returnDonFromCardMutate(next, targetSide, section, keyName, index);
                if (returned > 0) {
                    if (section === 'char' && keyName === 'char') {
                        appendLog(`[K.O.] Returned ${returned} DON!! to cost area.`);
                    } else if (section === 'middle' && keyName === 'leader') {
                        appendLog(`[Effect KO] Returned ${returned} DON!! from leader to cost area.`);
                    }
                }
            }, { onErrorLabel: '[Replacement Effect] Failed to persist usage' });

            // Keep behavior identical: replacement consumes the removal.
            return true;
        } catch {
            return false;
        }
    }, [appendLog, applyPowerMod, mutateAreas, registerUntilNextTurnEffect, turnNumber, turnSide]);

    // Check and apply replacement effect for removal by opponent's effect
    const maybeApplyRemovalReplacement = useCallback((targetSide, section, keyName, index, sourceSide) => {
        const actionInfo = getRemovalReplacementAction(targetSide, section, keyName, index, sourceSide);
        if (!actionInfo) return false;

        return applyRemovalReplacementAction(targetSide, section, keyName, index, actionInfo);
    }, [applyRemovalReplacementAction, getRemovalReplacementAction]);

    const removeCardByEffect = useCallback((targetSide, section, keyName, index, sourceSide) => {
        // Check replacement effect first (e.g., -2000 power instead of removal)
        const wasReplaced = maybeApplyRemovalReplacement(targetSide, section, keyName, index, sourceSide);
        if (wasReplaced) {
            return false;
        }

        mutateAreas((next) => {
            const sideLoc = getSideRoot(next, targetSide);
            const trashLoc = getHandCostRoot(next, targetSide);
            if (!sideLoc || !trashLoc) return;

            // Handle Character removal
            if (section === 'char' && keyName === 'char') {
                const charArr = sideLoc?.char || [];
                if (!charArr[index]) throw new Error('Invalid character index');

                const removed = charArr.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] ${removed.id} was removed by effect.`);

                const returned = returnDonFromCardMutate(next, targetSide, section, keyName, index);
                if (returned > 0) {
                    appendLog(`[K.O.] Returned ${returned} DON!! to cost area.`);
                }
            }
            // Handle Leader removal (rare)
            else if (section === 'middle' && keyName === 'leader') {
                const leaderArr = sideLoc?.middle?.leader || [];
                if (!leaderArr[0]) throw new Error('Invalid leader');

                const removed = leaderArr.splice(0, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] Leader ${removed.id} was removed by effect.`);

                const returned = returnDonFromCardMutate(next, targetSide, section, keyName, index);
                if (returned > 0) {
                    appendLog(`[Effect KO] Returned ${returned} DON!! from leader to cost area.`);
                }
            }
            // Handle card trashed from hand
            else if ((section === 'bottom' || section === 'top') && keyName === 'hand') {
                const handLoc = getHandCostRoot(next, targetSide);
                const hand = handLoc?.hand || [];
                if (!hand[index]) throw new Error('Invalid hand index');

                const removed = hand.splice(index, 1)[0];
                handLoc.hand = hand;
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Ability Cost] Trashed ${removed.id} from hand.`);

                const returned = returnDonFromCardMutate(next, targetSide, section, keyName, index);
                if (returned > 0) {
                    appendLog(`[K.O.] Returned ${returned} DON!! to cost area.`);
                }
            }
        }, { onErrorLabel: '[removeCardByEffect] Failed' });

        return true;
    }, [appendLog, maybeApplyRemovalReplacement, mutateAreas]);

    // Pay life as cost (no Trigger check)
    const payLife = useCallback((side, amount) => {
        if (!amount || amount <= 0) return 0;
        let paid = 0;

        mutateAreas((next) => {
            paid = payLifeCostMutate(next, side, amount);
        }, { onErrorLabel: '[payLife] Failed' });

        if (paid > 0) {
            appendLog(`[Ability Cost] ${side} paid ${paid} life (added to hand).`);
        }
        return paid;
    }, [appendLog, mutateAreas]);

    return {
        maybeApplyRemovalReplacement,
        removeCardByEffect,
        payLife
    };
}
