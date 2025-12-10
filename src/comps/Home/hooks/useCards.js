import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import _ from 'lodash';
import { loadAllCards as loadCardJson } from '../../../data/cards/loader';

export default function useCards({ isLoggedIn }) {
    const [hovered, setHovered] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);
    const [loadingCards, setLoadingCards] = useState(false);
    const [cardError, setCardError] = useState('');
    const [allCards, setAllCards] = useState([]);
    const allById = useMemo(() => _.keyBy(allCards, 'id'), [allCards]);
    const [metaById, setMetaById] = useState(() => new Map());

    // Load card JSON metadata on mount
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { byId } = await loadCardJson();
                if (alive) setMetaById(byId);
            } catch (e) {
                console.warn('Failed to load card JSON metadata:', e);
            }
        })();
        return () => { alive = false; };
    }, []);

    // Load all cards once on login
    const cardsLoadedRef = useRef(false);
    useEffect(() => {
        if (!isLoggedIn || cardsLoadedRef.current) { return; }
        cardsLoadedRef.current = true;

        const fetchAll = async () => {
            setLoadingCards(true);
            setCardError('');
            try {
                const res = await fetch('/api/cardsAll');
                const data = await res.json();
                if (!res.ok) { throw new Error(data.error || 'Failed to load cards'); }
                setAllCards(data.cards || []);
                setHovered(null);
            } catch (e) {
                setCardError(e.message);
                setAllCards([]);
                setHovered(null);
                cardsLoadedRef.current = false; // allow retry on error
            } finally {
                setLoadingCards(false);
            }
        };
        fetchAll();
    }, [isLoggedIn]);

    // Returns random card for demo/testing
    const getRandomCard = useCallback(() => {
        if (_.isEmpty(allCards)) { return null; }
        return _.sample(allCards);
    }, [allCards]);

    return {
        hovered,
        setHovered,
        selectedCard,
        setSelectedCard,
        loadingCards,
        cardError,
        allCards,
        setAllCards,
        allById,
        metaById,
        getRandomCard
    };
}
