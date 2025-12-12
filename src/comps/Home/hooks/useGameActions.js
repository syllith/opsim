import { useCallback } from 'react';
import _ from 'lodash';
import { getHandCostRoot, getSideRoot, getZoneArray } from './areasUtils';

export default function useGameActions({
    canPerformGameAction,
    library,
    oppLibrary,
    getAssetForId,
    createCardBacks,
    mutateAreas,
    setLibrary,
    setOppLibrary,
    deckSearchRef,
    appendLog
}) {
    const drawCard = useCallback((side) => {
        if (!canPerformGameAction()) return;
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;
        if (!lib.length) return;

        const cardId = lib[lib.length - 1];
        const asset = getAssetForId ? getAssetForId(cardId) : null;

        mutateAreas((next) => {
            const handLoc = getHandCostRoot(next, side);
            const sideRoot = getSideRoot(next, side);
            const deckLoc = sideRoot?.middle;
            if (!handLoc || !deckLoc) return;

            handLoc.hand = [...(handLoc.hand || []), asset];
            const currentDeckLength = deckLoc.deck?.length || 0;
            if (currentDeckLength > 0) {
                deckLoc.deck = createCardBacks(currentDeckLength - 1);
            }
        }, { onErrorLabel: '[drawCard] Failed' });

        (isPlayer ? setLibrary : setOppLibrary)((prev) => prev.slice(0, -1));
    }, [canPerformGameAction, library, oppLibrary, getAssetForId, createCardBacks, mutateAreas, setLibrary, setOppLibrary]);

    const startDeckSearch = useCallback((config) => {
        if (deckSearchRef && deckSearchRef.current) {
            deckSearchRef.current.start(config);
        }
    }, [deckSearchRef]);

    const returnCardToDeck = useCallback((side, section, keyName, index, location = 'bottom') => {
        const isPlayer = side === 'player';
        let movedCardId = null;

        mutateAreas((next) => {
            const sourceArray = getZoneArray(next, { side, section, keyName });
            if (!sourceArray || index >= sourceArray.length) {
                console.error('[returnCardToDeck] Invalid source:', { side, section, keyName, index });
                throw new Error('Invalid source');
            }

            const [card] = sourceArray.splice(index, 1);
            movedCardId = card?.id || null;

            const sideRoot = getSideRoot(next, side);
            const deckLoc = sideRoot?.middle;
            if (deckLoc) {
                const currentDeckSize = (deckLoc.deck || []).length;
                deckLoc.deck = createCardBacks(currentDeckSize + 1);
            }

            if (movedCardId) {
                appendLog && appendLog(`[Ability Cost] Returned ${movedCardId} to ${location} of ${side}'s deck.`);
            }
        }, { onErrorLabel: '[returnCardToDeck] Failed' });

        if (!movedCardId) return;

        if (location === 'top') {
            (isPlayer ? setLibrary : setOppLibrary)((prevLib) => [...prevLib, movedCardId]);
        } else if (location === 'bottom') {
            (isPlayer ? setLibrary : setOppLibrary)((prevLib) => [movedCardId, ...prevLib]);
        } else if (location === 'shuffle') {
            const currentLib = isPlayer ? library : oppLibrary;
            const newLib = _.shuffle([...currentLib, movedCardId]);
            (isPlayer ? setLibrary : setOppLibrary)(newLib);
        }
    }, [appendLog, createCardBacks, library, mutateAreas, oppLibrary, setLibrary, setOppLibrary]);

    const setCardRested = useCallback((locator, rested, logPrefix) => {
        const { side, section, keyName, index } = locator || {};

        mutateAreas((next) => {
            const sideRoot = getSideRoot(next, side);
            if (!sideRoot) return;

            let card = null;
            let label = null;

            if (section === 'char' && keyName === 'char') {
                card = sideRoot?.char?.[index];
                label = 'Character';
            } else if (section === 'middle' && keyName === 'leader') {
                card = sideRoot?.middle?.leader?.[0];
                label = 'Leader';
            } else if (section === 'middle' && keyName === 'stage') {
                card = sideRoot?.middle?.stage?.[0];
                label = 'Stage';
            }

            if (!card || !label) return;
            card.rested = rested;

            if (appendLog) {
                if (rested) {
                    appendLog(`${logPrefix} ${label} ${card.id}.`);
                } else {
                    appendLog(`${logPrefix} ${label} ${card.id} active.`);
                }
            }
        }, { onErrorLabel: '[setCardRested] Failed' });
    }, [appendLog, mutateAreas]);

    const restCard = useCallback((side, section, keyName, index) => {
        setCardRested({ side, section, keyName, index }, true, '[Ability Cost] Rested');
    }, [setCardRested]);

    const setActive = useCallback((side, section, keyName, index) => {
        setCardRested({ side, section, keyName, index }, false, '[Effect] Set');
    }, [setCardRested]);

    return {
        drawCard,
        startDeckSearch,
        returnCardToDeck,
        restCard,
        setActive
    };
}
