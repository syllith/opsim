import { useCallback } from 'react';
import _ from 'lodash';

// Helper to get the side location from areas (player or opponent)
const getSideLocationFromNext = (next, side) => {
    return side === 'player' ? next.player : next.opponent;
};

// Helper to get hand/cost/trash/don container from areas
const getHandCostLocationFromNext = (next, side) => {
    return side === 'player' ? next.player.bottom : next.opponent.top;
};

/**
 * Hook for resolving card effects including replacement effects
 * Handles removal prevention, effect KO, and related game mechanics
 */
export default function useEffectResolution({
    setAreas,
    appendLog,
    returnDonFromCard,
    metaById,
    getSideLocation,
    turnNumber,
    turnSide,
    applyPowerMod,
    registerUntilNextTurnEffect
}) {
    // Check and apply replacement effect for removal by opponent's effect
    const maybeApplyRemovalReplacement = useCallback((targetSide, section, keyName, index, sourceSide) => {
        try {
            // Only applies when the source is the opponent of the target controller
            if (!targetSide || !sourceSide || targetSide === sourceSide) {
                return false;
            }

            // Only applies to fielded Leader/Character
            const isCharacter = section === 'char' && keyName === 'char';
            const isLeader = section === 'middle' && keyName === 'leader';
            if (!isCharacter && !isLeader) {
                return false;
            }

            // Get the card instance
            const sideLoc = getSideLocation(targetSide);
            const cardInstance = isCharacter ? sideLoc?.char?.[index] : sideLoc?.middle?.leader?.[0];
            if (!cardInstance?.id) {
                return false;
            }

            // Check if card has replacement ability (new schema)
            const meta = metaById.get(cardInstance.id);
            if (!meta) { return false; }

            const abilities = _.get(meta, 'abilities', []);
            
            // Events that represent "would be removed by opponent's effect"
            const removalEvents = [
                'beforeThisRemovedByOpponentsEffect',
                'wouldBeRemovedFromFieldByOpponentsEffect',
                'thisCardWouldBeRemovedFromFieldByOpponentsEffect'
            ];
            
            // Find replacement effect action for removal prevention
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
            
            if (!foundAction) { return false; }

            // Check frequency: oncePerTurn
            const usedTurnProp = '__replacementUsedTurn';
            const frequency = foundAbility.frequency || 'none';
            
            if (frequency === 'oncePerTurn') {
                if (cardInstance[usedTurnProp] === turnNumber) {
                    return false;
                }
            }
            
            // Check maxTriggers if specified
            const maxTriggers = foundAction.maxTriggers || Infinity;
            const triggersUsedProp = '__replacementTriggersUsed';
            const triggersUsed = cardInstance[triggersUsedProp] || 0;
            if (triggersUsed >= maxTriggers) {
                return false;
            }

            // Execute nested actions from the replacement effect
            const nestedActions = foundAction.actions || [];
            const expireOnSide = turnSide === 'player' ? 'opponent' : 'player';
            const cardIndex = isCharacter ? index : 0;
            
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

            // Persist the usage flag on areas
            setAreas((prev) => {
                const next = _.cloneDeep(prev);
                const loc = getSideLocationFromNext(next, targetSide);

                if (isCharacter && loc?.char?.[cardIndex]) {
                    loc.char[cardIndex][usedTurnProp] = turnNumber;
                    loc.char[cardIndex][triggersUsedProp] = triggersUsed + 1;
                } else if (isLeader && loc?.middle?.leader?.[0]) {
                    loc.middle.leader[0][usedTurnProp] = turnNumber;
                    loc.middle.leader[0][triggersUsedProp] = triggersUsed + 1;
                }

                return next;
            });

            // Return any given DON!! to cost area
            returnDonFromCard(targetSide, section, keyName, index);
            return true;
        } catch {
            return false;
        }
    }, [setAreas, appendLog, returnDonFromCard, metaById, getSideLocation, turnNumber, turnSide, applyPowerMod, registerUntilNextTurnEffect]);

    const removeCardByEffect = useCallback((targetSide, section, keyName, index, sourceSide) => {
        // Check replacement effect first (e.g., -2000 power instead of removal)
        const wasReplaced = maybeApplyRemovalReplacement(targetSide, section, keyName, index, sourceSide);
        if (wasReplaced) {
            return false;
        }

        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const sideLoc = getSideLocationFromNext(next, targetSide);
            const trashLoc = getHandCostLocationFromNext(next, targetSide);

            // Handle Character removal
            if (section === 'char' && keyName === 'char') {
                const charArr = sideLoc?.char || [];
                if (!charArr[index]) return prev;

                const removed = charArr.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] ${removed.id} was removed by effect.`);
            }
            // Handle Leader removal (rare)
            else if (section === 'middle' && keyName === 'leader') {
                const leaderArr = sideLoc?.middle?.leader || [];
                if (!leaderArr[0]) return prev;

                const removed = leaderArr.splice(0, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Effect KO] Leader ${removed.id} was removed by effect.`);
            }
            // Handle card trashed from hand
            else if ((section === 'bottom' || section === 'top') && keyName === 'hand') {
                const handLoc = targetSide === 'player' ? next.player?.bottom : next.opponent?.top;
                const hand = handLoc?.hand || [];
                if (!hand[index]) return prev;

                const removed = hand.splice(index, 1)[0];
                trashLoc.trash = [...(trashLoc.trash || []), removed];
                appendLog(`[Ability Cost] Trashed ${removed.id} from hand.`);
            }

            return next;
        });

        // Return any given DON!! to cost area
        returnDonFromCard(targetSide, section, keyName, index);
        return true;
    }, [maybeApplyRemovalReplacement, setAreas, appendLog, returnDonFromCard]);

    // Pay life as cost (no Trigger check)
    const payLife = useCallback((side, amount) => {
        if (!amount || amount <= 0) return 0;
        let paid = 0;

        setAreas((prev) => {
            const next = _.cloneDeep(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            const handLoc = getHandCostLocationFromNext(next, side);
            const lifeArr = sideLoc.life || [];
            const toPay = Math.min(amount, lifeArr.length);
            if (toPay <= 0) return prev;

            for (let i = 0; i < toPay; i++) {
                const card = sideLoc.life.pop();
                if (card) {
                    handLoc.hand = [...(handLoc.hand || []), card];
                    paid++;
                }
            }
            return next;
        });

        if (paid > 0) {
            appendLog(`[Ability Cost] ${side} paid ${paid} life (added to hand).`);
        }
        return paid;
    }, [setAreas, appendLog]);

    return {
        maybeApplyRemovalReplacement,
        removeCardByEffect,
        payLife
    };
}
