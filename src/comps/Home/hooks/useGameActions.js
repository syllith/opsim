import { useCallback } from 'react';
import _ from 'lodash';

export default function useGameActions({
    canPerformGameAction,
    library,
    oppLibrary,
    getAssetForId,
    createCardBacks,
    setAreas,
    setLibrary,
    setOppLibrary,
    cloneAreas,
    deckSearchRef,
    getSideLocationFromNext,
    createCardBacksFn,
    appendLog,
    getAsset,
    getCardCost,
    hasEnoughDonFor
}) {
    const drawCard = useCallback((side) => {
        if (!canPerformGameAction()) return;
        const isPlayer = side === 'player';
        const lib = isPlayer ? library : oppLibrary;
        if (!lib.length) return;

        const cardId = lib[lib.length - 1];
        const asset = getAssetForId ? getAssetForId(cardId) : (getAsset ? getAsset(cardId) : null);

        setAreas((prevAreas) => {
            const next = cloneAreas(prevAreas);
            const handLoc = isPlayer ? next.player.bottom : next.opponent.top;
            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            handLoc.hand = [...(handLoc.hand || []), asset];
            const currentDeckLength = deckLoc.deck?.length || 0;
            if (currentDeckLength > 0) {
                deckLoc.deck = createCardBacks(currentDeckLength - 1);
            }
            return next;
        });

        (isPlayer ? setLibrary : setOppLibrary)((prev) => prev.slice(0, -1));
    }, [canPerformGameAction, library, oppLibrary, getAssetForId, createCardBacks, setAreas, setLibrary, setOppLibrary, cloneAreas]);

    const startDeckSearch = useCallback((config) => {
        if (deckSearchRef && deckSearchRef.current) {
            deckSearchRef.current.start(config);
        }
    }, [deckSearchRef]);

    const returnCardToDeck = useCallback((side, section, keyName, index, location = 'bottom') => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const isPlayer = side === 'player';
            const sideRoot = getSideLocationFromNext(next, side);

            let sourceArray;
            if (section === 'top' || section === 'middle' || section === 'bottom') {
                const container = sideRoot[section];
                sourceArray = container?.[keyName];
            } else {
                sourceArray = sideRoot[section] || sideRoot[keyName];
            }

            if (!sourceArray || index >= sourceArray.length) {
                console.error('[returnCardToDeck] Invalid source:', { side, section, keyName, index });
                return prev;
            }

            const card = sourceArray[index];

            if (section === 'top' || section === 'middle' || section === 'bottom') {
                sideRoot[section][keyName] = sourceArray.filter((_, i) => i !== index);
            } else {
                sideRoot[section] = sourceArray.filter((_, i) => i !== index);
            }

            if (location === 'top') {
                if (isPlayer) {
                    setLibrary(prevLib => [...prevLib, card.id]);
                } else {
                    setOppLibrary(prevLib => [...prevLib, card.id]);
                }
            } else if (location === 'bottom') {
                if (isPlayer) {
                    setLibrary(prevLib => [card.id, ...prevLib]);
                } else {
                    setOppLibrary(prevLib => [card.id, ...prevLib]);
                }
            } else if (location === 'shuffle') {
                const currentLib = isPlayer ? library : oppLibrary;
                const newLib = _.shuffle([...currentLib, card.id]);
                if (isPlayer) {
                    setLibrary(newLib);
                } else {
                    setOppLibrary(newLib);
                }
            }

            const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
            const currentDeckSize = (deckLoc.deck || []).length;
            deckLoc.deck = createCardBacks(currentDeckSize + 1);

            appendLog && appendLog(`[Ability Cost] Returned ${card.id} to ${location} of ${side}'s deck.`);

            return next;
        });
    }, [library, oppLibrary, createCardBacks, appendLog, setAreas, setLibrary, setOppLibrary, cloneAreas, getSideLocationFromNext]);

    const restCard = useCallback((side, section, keyName, index) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            try {
                if (section === 'char' && keyName === 'char') {
                    if (sideLoc?.char?.[index]) {
                        sideLoc.char[index].rested = true;
                        appendLog && appendLog(`[Ability Cost] Rested Character ${sideLoc.char[index].id}.`);
                    }
                } else if (section === 'middle' && keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = true;
                        appendLog && appendLog(`[Ability Cost] Rested Leader ${sideLoc.middle.leader[0].id}.`);
                    }
                } else if (section === 'middle' && keyName === 'stage') {
                    if (sideLoc?.middle?.stage?.[0]) {
                        sideLoc.middle.stage[0].rested = true;
                        appendLog && appendLog(`[Ability Cost] Rested Stage ${sideLoc.middle.stage[0].id}.`);
                    }
                }
            } catch (e) {
                console.warn('[restCard] Failed to rest', { side, section, keyName, index }, e);
                return prev;
            }
            return next;
        });
    }, [setAreas, appendLog, cloneAreas, getSideLocationFromNext]);

    const setActive = useCallback((side, section, keyName, index) => {
        setAreas((prev) => {
            const next = cloneAreas(prev);
            const sideLoc = getSideLocationFromNext(next, side);
            try {
                if (section === 'char' && keyName === 'char') {
                    if (sideLoc?.char?.[index]) {
                        sideLoc.char[index].rested = false;
                        appendLog && appendLog(`[Effect] Set Character ${sideLoc.char[index].id} active.`);
                    }
                } else if (section === 'middle' && keyName === 'leader') {
                    if (sideLoc?.middle?.leader?.[0]) {
                        sideLoc.middle.leader[0].rested = false;
                        appendLog && appendLog(`[Effect] Set Leader ${sideLoc.middle.leader[0].id} active.`);
                    }
                } else if (section === 'middle' && keyName === 'stage') {
                    if (sideLoc?.middle?.stage?.[0]) {
                        sideLoc.middle.stage[0].rested = false;
                        appendLog && appendLog(`[Effect] Set Stage ${sideLoc.middle.stage[0].id} active.`);
                    }
                }
            } catch (e) {
                console.warn('[setActive] Failed to set active', { side, section, keyName, index }, e);
                return prev;
            }
            return next;
        });
    }, [setAreas, appendLog, cloneAreas, getSideLocationFromNext]);

    return {
        drawCard,
        startDeckSearch,
        returnCardToDeck,
        restCard,
        setActive
    };
}
