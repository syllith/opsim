import { useState, useCallback } from 'react';
import _ from 'lodash';
import { createInitialAreas } from './useDeckInitializer';

export default function useBoard() {
    const [areas, setAreas] = useState(createInitialAreas);

    // Returns deep-cloned board areas (for safe mutation)
    const cloneAreas = useCallback((prev) => _.cloneDeep(prev), []);

    // Centralized areas mutation wrapper (clone once, try/catch).
    const mutateAreas = useCallback((recipeFn, { onErrorLabel } = {}) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            try {
                recipeFn(next, prev);
                return next;
            } catch (error) {
                console.warn(onErrorLabel || '[mutateAreas] Failed', error);
                return prev;
            }
        });
    }, [cloneAreas]);

    // Add a card object to a specific area. Caller should clone card if needed.
    const addCardToArea = useCallback((side, section, key, card) => {
        if (!card) return;
        setAreas(prev => {
            const sideData = prev[side];
            const targetSection = sideData[section];

            if (_.isArray(targetSection)) {
                return {
                    ...prev,
                    [side]: {
                        ...sideData,
                        [section]: [...targetSection, _.clone(card)]
                    }
                };
            }

            const targetArray = targetSection[key];
            return {
                ...prev,
                [side]: {
                    ...sideData,
                    [section]: {
                        ...targetSection,
                        [key]: [...targetArray, _.clone(card)]
                    }
                }
            };
        });
    }, []);

    const removeCardFromArea = useCallback((side, section, key) => {
        setAreas(prev => {
            const targetSection = _.get(prev, [side, section]);
            if (!targetSection) { return prev; }

            if (_.isArray(targetSection)) {
                if (_.isEmpty(targetSection)) { return prev; }
                return {
                    ...prev,
                    [side]: {
                        ...prev[side],
                        [section]: _.dropRight(targetSection)
                    }
                };
            }

            const target = targetSection[key];
            if (!target?.length) { return prev; }

            return {
                ...prev,
                [side]: {
                    ...prev[side],
                    [section]: {
                        ...targetSection,
                        [key]: _.dropRight(target)
                    }
                }
            };
        });
    }, []);

    // Get side root from areas
    const getSideLocation = useCallback((side) => _.get(areas, side), [areas]);

    // Get hand/cost/trash/don container
    const getHandCostLocation = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.bottom' : 'opponent.top'),
        [areas]
    );

    // Get character array
    const getCharArray = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.char' : 'opponent.char', []),
        [areas]
    );

    // Get leader array
    const getLeaderArray = useCallback(
        (side) => _.get(areas, side === 'player' ? 'player.middle.leader' : 'opponent.middle.leader', []),
        [areas]
    );

    return {
        areas,
        setAreas,
        cloneAreas,
        mutateAreas,
        addCardToArea,
        removeCardFromArea,
        getSideLocation,
        getHandCostLocation,
        getCharArray,
        getLeaderArray
    };
}
