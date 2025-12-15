/**
 * useCardStats - STUB
 * TODO: Replace with engine.modifiers and engine.query calls
 * 
 * This hook previously computed card statistics (power, cost, keywords).
 * Now returns stub functions that return base values only.
 * Real implementation will be in src/engine/modifiers/
 */
import { useCallback } from 'react';
import _ from 'lodash';

export default function useCardStats({ metaById }) {
    // Get base power from card metadata (no modifiers)
    const getBasePower = useCallback((id) => {
        const meta = metaById.get(id) || {};
        return _.get(meta, 'power', 0);
    }, [metaById]);

    // STUB: Engine will handle power modifiers
    const getPowerMod = useCallback(() => 0, []);

    // STUB: Engine will handle aura calculations
    const getAuraPowerMod = useCallback(() => 0, []);

    // STUB: Returns base power only (no modifiers)
    const getTotalPower = useCallback((side, section, keyName, index, id) => {
        return getBasePower(id);
    }, [getBasePower]);

    // STUB: Engine will handle cost modifiers
    const getAuraCostMod = useCallback(() => 0, []);

    // Get base cost from card metadata (no modifiers)
    const getCardCost = useCallback((id) => {
        if (!id) return 0;
        const meta = metaById.get(id);
        const baseCost = _.get(meta, 'cost', 0);
        return _.isNumber(baseCost) && baseCost > 0 ? baseCost : 0;
    }, [metaById]);

    // Get keywords from card metadata
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
