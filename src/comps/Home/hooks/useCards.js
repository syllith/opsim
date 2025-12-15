/**
 * useCards.js - Card Data Loading & UI Selection State
 * 
 * PURPOSE: 
 * 1. Load card metadata from server (JSON files)
 * 2. Load card assets from API 
 * 3. Track UI hover/selection state (not game state)
 * 
 * NOTE: This is separate from engine because:
 * - Card metadata loading is a one-time data fetch
 * - Hover/selection is UI state, not game state
 * - The engine will receive metaById as a dependency
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import _ from 'lodash';
import { loadAllCards as loadCardJson } from '../../../data/cards/loader';

export default function useCards({ isLoggedIn }) {
    // UI state (not game state)
    const [hovered, setHovered] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);

    // Loading state
    const [loadingCards, setLoadingCards] = useState(false);
    const [cardError, setCardError] = useState('');

    // Card data
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
                console.warn('[useCards] Failed to load card JSON metadata:', e);
            }
        })();
        return () => { alive = false; };
    }, []);

    // Load card assets from API once logged in
    const cardsLoadedRef = useRef(false);
    useEffect(() => {
        if (!isLoggedIn || cardsLoadedRef.current) return;
        cardsLoadedRef.current = true;

        const fetchAll = async () => {
            setLoadingCards(true);
            setCardError('');
            try {
                const res = await fetch('/api/cardsAll');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load cards');
                setAllCards(data.cards || []);
            } catch (e) {
                setCardError(e.message);
                setAllCards([]);
                cardsLoadedRef.current = false;
            } finally {
                setLoadingCards(false);
            }
        };
        fetchAll();
    }, [isLoggedIn]);

    // Helper to get random card (for testing)
    const getRandomCard = useCallback(() => {
        return _.isEmpty(allCards) ? null : _.sample(allCards);
    }, [allCards]);

    return {
        // UI state
        hovered,
        setHovered,
        selectedCard,
        setSelectedCard,
        
        // Loading state
        loadingCards,
        cardError,
        
        // Card data (passed to engine)
        allCards,
        setAllCards,
        allById,
        metaById,
        
        // Helpers
        getRandomCard
    };
}
