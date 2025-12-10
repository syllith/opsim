import { useCallback } from 'react';
import _ from 'lodash';

export default function useCardStats({ metaById, getSideLocation, getPowerMod, getDonPowerBonus }) {
    const getBasePower = useCallback((id) => {
        const meta = metaById.get(id) || {};
        return _.get(meta, 'power', 0);
    }, [metaById]);

    const getAuraPowerMod = useCallback((targetSide, section, keyName, index) => {
        try {
            const appliesToLeader = section === 'middle' && keyName === 'leader';
            const appliesToChar = section === 'char' && keyName === 'char';

            if (!appliesToLeader && !appliesToChar) {
                return 0;
            }

            const resolveTargetSide = (controllerSide, relative) => {
                if (relative === 'both') return 'both';
                if (relative === 'opponent') {
                    return controllerSide === 'player' ? 'opponent' : 'player';
                }
                return controllerSide;
            };

            const actionAppliesToTarget = (action, srcSide) => {
                if (action?.type !== 'powerMod') return false;
                if (action.mode && action.mode !== 'aura') return false;

                const actualSide = resolveTargetSide(srcSide, action.targetSide || 'player');
                if (actualSide !== 'both' && actualSide !== targetSide) return false;

                const targetType = action.targetType || 'any';
                const leaderOk = targetType === 'leader' || targetType === 'any';
                const charOk = targetType === 'character' || targetType === 'any';

                return (appliesToLeader && leaderOk) || (appliesToChar && charOk);
            };

            const processAbilityActions = (abilities, srcSide) => {
                let modSum = 0;

                for (const ability of abilities) {
                    if (ability?.timing !== 'static') continue;

                    const actions = Array.isArray(ability.actions) ? ability.actions : [];
                    for (const action of actions) {
                        if (actionAppliesToTarget(action, srcSide)) {
                            modSum += action.amount || 0;
                            continue;
                        }
                        if (action?.type === 'modifyStat' && action.stat === 'power' && action.duration === 'permanent') {
                            const sel = action.target;
                            const selector = typeof sel === 'object' ? sel : null;
                            if (selector) {
                                const actualSide = selector.side === 'self'
                                  ? srcSide
                                  : selector.side === 'opponent'
                                  ? (srcSide === 'player' ? 'opponent' : 'player')
                                  : targetSide;
                                if (actualSide === targetSide || actualSide === 'both') {
                                    const targetType = selector.type || 'any';
                                    const leaderOk = targetType === 'leader' || targetType === 'leaderOrCharacter' || targetType === 'any';
                                    const charOk = targetType === 'character' || targetType === 'leaderOrCharacter' || targetType === 'any';
                                    if ((appliesToLeader && leaderOk) || (appliesToChar && charOk)) {
                                        modSum += action.amount || 0;
                                    }
                                }
                            }
                        }
                    }
                }

                return modSum;
            };

            let totalMod = 0;
            const sides = ['player', 'opponent'];

            for (const srcSide of sides) {
                const srcLoc = getSideLocation(srcSide);
                if (!srcLoc) continue;

                const leaderCard = srcLoc?.middle?.leader?.[0];
                if (leaderCard?.id) {
                    const meta = metaById.get(leaderCard.id);
                    if (meta?.abilities) {
                        totalMod += processAbilityActions(meta.abilities, srcSide);
                    }
                }

                const chars = srcLoc?.char || [];
                for (const charCard of chars) {
                    if (!charCard?.id) continue;

                    const meta = metaById.get(charCard.id);
                    if (meta?.abilities) {
                        totalMod += processAbilityActions(meta.abilities, srcSide);
                    }
                }
            }

            return totalMod;
        } catch {
            return 0;
        }
    }, [metaById, getSideLocation]);

    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        const base = getBasePower(id);
        const mod = getPowerMod(side, section, keyName, index) || 0;
        const aura = getAuraPowerMod(side, section, keyName, index) || 0;
        const donBonus = getDonPowerBonus(side, section, keyName, index) || 0;
        return base + mod + aura + donBonus;
    }, [getBasePower, getPowerMod, getAuraPowerMod, getDonPowerBonus]);

    const getAuraCostMod = useCallback((cardId, side, section, keyName, index, getTotalPowerFn) => {
        try {
            const isInHand = (section === 'bottom' || section === 'top') && keyName === 'hand';
            if (!isInHand) return 0;

            const meta = metaById.get(cardId);
            const abilities = _.get(meta, 'abilities', []);
            if (_.isEmpty(abilities)) return 0;

            let totalMod = 0;

            for (const ability of abilities) {
                const isOldContinuous = _.get(ability, 'type') === 'Continuous';
                const isNewStatic = _.get(ability, 'timing') === 'static';
                if (!isOldContinuous && !isNewStatic) continue;

                let actions = _.get(ability, 'actions', []);
                if (_.isEmpty(actions)) {
                    actions = _.get(ability, 'effect.actions', []);
                }
                if (_.isEmpty(actions)) continue;

                for (const action of actions) {
                    if (action?.type === 'costMod') {
                        if (!action.appliesToHand || !action.targetSelf) continue;

                        const condition = ability.condition || {};
                        let conditionMet = true;

                        if (condition.allyCharacterPower) {
                            const sideLoc = getSideLocation(side);
                            const chars = sideLoc?.char || [];
                            conditionMet = _.some(chars, (char, i) => {
                                if (!char?.id) return false;
                                const totalPower = getTotalPowerFn(side, 'char', 'char', i, char.id);
                                return totalPower >= condition.allyCharacterPower;
                            });
                        }

                        if (conditionMet) {
                            totalMod += action.amount || 0;
                        }
                    }

                    if (action?.type === 'modifyStat' && action?.stat === 'cost' && action?.target === 'thisCard') {
                        const actionCondition = action.condition || {};
                        let conditionMet = true;

                        if (actionCondition.logic === 'AND' && Array.isArray(actionCondition.all)) {
                            conditionMet = actionCondition.all.every(cond => {
                                if (cond.field === 'selfZone' && cond.op === '=' && cond.value === 'hand') {
                                    return isInHand;
                                }

                                if (cond.field === 'selectorCount' && cond.selector) {
                                    const selector = ability.selectors?.[cond.selector];
                                    if (!selector) return false;

                                    const selectorSide = selector.side === 'self' ? side : (side === 'player' ? 'opponent' : 'player');
                                    const sideLoc = getSideLocation(selectorSide);
                                    let matchCount = 0;

                                    const zones = selector.zones || [];
                                    if (zones.includes('character') && sideLoc?.char) {
                                        for (let i = 0; i < sideLoc.char.length; i++) {
                                            const char = sideLoc.char[i];
                                            if (!char?.id) continue;

                                            let matches = true;
                                            for (const filter of (selector.filters || [])) {
                                                if (filter.field === 'power') {
                                                    const charPower = getTotalPowerFn(selectorSide, 'char', 'char', i, char.id);
                                                    if (filter.op === '>=' && charPower < filter.value) matches = false;
                                                    if (filter.op === '<=' && charPower > filter.value) matches = false;
                                                    if (filter.op === '>' && charPower <= filter.value) matches = false;
                                                    if (filter.op === '<' && charPower >= filter.value) matches = false;
                                                    if (filter.op === '=' && charPower !== filter.value) matches = false;
                                                }
                                            }
                                            if (matches) matchCount++;
                                        }
                                    }

                                    if (cond.op === '>=' && matchCount < cond.value) return false;
                                    if (cond.op === '<=' && matchCount > cond.value) return false;
                                    if (cond.op === '>' && matchCount <= cond.value) return false;
                                    if (cond.op === '<' && matchCount >= cond.value) return false;
                                    if (cond.op === '=' && matchCount !== cond.value) return false;
                                }

                                return true;
                            });
                        }

                        if (conditionMet) {
                            totalMod += action.amount || 0;
                        }
                    }
                }
            }

            return totalMod;
        } catch {
            return 0;
        }
    }, [metaById, getSideLocation]);

    const getCardCost = useCallback((id, side = null, section = null, keyName = null, index = null) => {
        if (!id) return 0;
        const meta = metaById.get(id);
        const baseCost = _.get(meta, 'cost', 0);
        const cost = _.isNumber(baseCost) && baseCost > 0 ? baseCost : 0;

        if (side !== null && section !== null && keyName !== null && index !== null) {
            const auraMod = getAuraCostMod(id, side, section, keyName, index, getTotalPower);
            return Math.max(0, cost + auraMod);
        }

        return cost;
    }, [metaById, getAuraCostMod, getTotalPower]);

    const getKeywordsFor = useCallback((id) => {
        return _.get(metaById.get(id), 'keywords', []);
    }, [metaById]);

    return {
        getBasePower,
        getAuraPowerMod,
        getTotalPower,
        getAuraCostMod,
        getCardCost,
        getKeywordsFor
    };
}
