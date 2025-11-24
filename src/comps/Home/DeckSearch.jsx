import React, { useState, useMemo, useCallback } from 'react';
import { Box, Paper, Stack, Typography, Button, Alert } from '@mui/material';

/**
 * useDeckSearch - Custom hook for deck searching effects
 * Manages its own state and handles all deck search logic internally
 * 
 * Returns an object with:
 * - start: function to initiate a search
 * - active: boolean indicating if search is active
 * - Component: React component to render
 */
export function useDeckSearch({
  side,
  library,
  setLibrary,
  getAssetForId,
  getCardMeta,
  createCardBacks,
  setAreas,
  appendLog,
  setHovered,
  CARD_W = 120,
  onComplete
}) {
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState(null);
  const [selected, setSelected] = useState([]);

  // Start a deck search with the given configuration
  const start = useCallback((searchConfig) => {
    const { quantity, filter, minSelect, maxSelect, returnLocation, effectDescription, onSearchComplete } = searchConfig;
    
    if (!library || !library.length) {
      if (appendLog) appendLog(`[Deck Search] No cards in deck!`);
      return;
    }

    // Get top X cards from library (top of deck is at end of array)
    const lookCount = Math.min(quantity, library.length);
    const topCards = library.slice(-lookCount);
    const cardAssets = topCards.map(id => getAssetForId(id)).filter(Boolean);

    setConfig({
      cards: cardAssets,
      quantity: lookCount,
      filter: filter || {},
      minSelect: minSelect || 0,
      maxSelect: maxSelect || 1,
      returnLocation: returnLocation || 'bottom',
      canReorder: true,
      effectDescription: effectDescription || '',
      onSearchComplete
    });
    setActive(true);
    setSelected([]);
  }, [library, getAssetForId, appendLog]);

  // Handle confirmation of selection
  const handleConfirm = useCallback((selectedCards, remainder) => {
    if (!config) return;

    const selectedIds = selectedCards.map(c => c.id);
    const remainderIds = remainder.map(c => c.id);

    // Add selected cards to hand
    setAreas((prev) => {
      const next = structuredClone(prev);
      const isPlayer = side === 'player';
      const handLoc = isPlayer ? next.player.bottom : next.opponent.top;

      selectedCards.forEach(card => {
        handLoc.hand = [...(handLoc.hand || []), card];
      });

      return next;
    });

    // Update library: remove looked cards, add remainder back based on returnLocation
    setLibrary((prev) => {
      // Remove all looked cards from top of deck
      const newLib = prev.slice(0, -config.quantity);

      if (config.returnLocation === 'bottom') {
        // Add remainder to bottom of deck (start of array)
        return [...remainderIds, ...newLib];
      } else if (config.returnLocation === 'top') {
        // Add remainder to top of deck (end of array)
        return [...newLib, ...remainderIds];
      } else if (config.returnLocation === 'shuffle') {
        // Shuffle remainder back in
        const combined = [...newLib, ...remainderIds];
        // Simple shuffle
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }
        return combined;
      }
      return newLib;
    });

    // Update deck visual
    setAreas((prev) => {
      const next = structuredClone(prev);
      const isPlayer = side === 'player';
      const deckLoc = isPlayer ? next.player.middle : next.opponent.middle;
      const newDeckSize = library.length - config.quantity + remainderIds.length;
      deckLoc.deck = createCardBacks(Math.max(0, newDeckSize));
      return next;
    });

    if (appendLog) {
      appendLog(`[Deck Search] Added ${selectedIds.length} card(s) to hand, returned ${remainderIds.length} to ${config.returnLocation} of deck.`);
    }

    // Call custom completion handler if provided
    if (config.onSearchComplete) {
      config.onSearchComplete(selectedCards, remainder);
    }

    // Close modal
    setActive(false);
    setConfig(null);
    setSelected([]);
    
    if (onComplete) onComplete();
  }, [config, side, library, setAreas, setLibrary, createCardBacks, appendLog, onComplete]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setActive(false);
    setConfig(null);
    setSelected([]);
    if (onComplete) onComplete();
  }, [onComplete]);

  // Always extract config values (use defaults if not active)
  const cards = config?.cards || [];
  const quantity = config?.quantity || 5;
  const filter = config?.filter || {};
  const minSelect = config?.minSelect || 0;
  const maxSelect = config?.maxSelect || 1;
  const returnLocation = config?.returnLocation || 'bottom';
  const canReorder = config?.canReorder !== false;
  const effectDescription = config?.effectDescription || '';

  // Apply filter to determine which cards are selectable
  const cardSelectability = useMemo(() => {
    return cards.map((card) => {
      const meta = getCardMeta ? getCardMeta(card.id) : null;
      if (!meta) return { selectable: false, reason: 'Card data not found' };

      // Check type filter (e.g., "Red Haired Pirates")
      if (filter.type) {
        const types = meta.types || [];
        const typeMatch = types.some(t => 
          t.toLowerCase().includes(filter.type.toLowerCase()) ||
          filter.type.toLowerCase().includes(t.toLowerCase())
        );
        if (!typeMatch) {
          return { selectable: false, reason: `Type must contain "${filter.type}"` };
        }
      }

      // Check color filter
      if (filter.color) {
        const colors = meta.colors || [];
        const colorMatch = colors.some(c => c.toLowerCase() === filter.color.toLowerCase());
        if (!colorMatch) {
          return { selectable: false, reason: `Must be ${filter.color}` };
        }
      }

      // Check attribute filter
      if (filter.attribute) {
        const attr = (meta.attribute || '').toLowerCase();
        if (attr !== String(filter.attribute).toLowerCase()) {
          return { selectable: false, reason: `Must have ${filter.attribute} attribute` };
        }
      }

      // Check cost filter
      if (typeof filter.cost === 'number') {
        const cardCost = meta.stats?.cost;
        if (cardCost !== filter.cost) {
          return { selectable: false, reason: `Cost must be ${filter.cost}` };
        }
      }

      // Check cost range (e.g., cost <= 3)
      if (typeof filter.maxCost === 'number') {
        const cardCost = meta.stats?.cost || 0;
        if (cardCost > filter.maxCost) {
          return { selectable: false, reason: `Cost must be ${filter.maxCost} or less` };
        }
      }

      // Check power filter
      if (typeof filter.power === 'number') {
        const cardPower = meta.stats?.power || 0;
        if (cardPower !== filter.power) {
          return { selectable: false, reason: `Power must be ${filter.power}` };
        }
      }

      // Check category filter (Leader, Character, Event, Stage)
      if (filter.category) {
        const category = meta.category;
        if (category?.toLowerCase() !== filter.category.toLowerCase()) {
          return { selectable: false, reason: `Must be ${filter.category}` };
        }
      }

      return { selectable: true, reason: '' };
    });
  }, [cards, filter, getCardMeta]);

  const handleToggleSelect = (index) => {
    const isSelectable = cardSelectability[index]?.selectable;
    if (!isSelectable) return;

    // Build the selection
    const isCurrentlySelected = selected.includes(index);
    let newSelected;
    
    if (isCurrentlySelected) {
      newSelected = selected.filter(i => i !== index);
    } else {
      if (selected.length >= maxSelect) {
        // Already at max: replace first selection
        newSelected = [...selected.slice(1), index];
      } else {
        newSelected = [...selected, index];
      }
    }
    
    setSelected(newSelected);
    
      // Auto-confirm if we have the minimum required selections
    if (newSelected.length >= minSelect && newSelected.length <= maxSelect && !isCurrentlySelected) {
      // Slight delay to show the selection visually
      setTimeout(() => {
        const selectedCards = newSelected.map(i => cards[i]);
        const remainderIndices = cards.map((_, i) => i).filter(i => !newSelected.includes(i));
        const remainder = remainderIndices.map(i => cards[i]);
        
        handleConfirm(selectedCards, remainder);
      }, 150);
    }
  };

  const canConfirm = selected.length >= minSelect && selected.length <= maxSelect;
  const selectableCount = cardSelectability.filter(c => c.selectable).length;
  
  // Calculate width based on number of cards
  const cardDisplayWidth = (CARD_W + 8) * cards.length; // CARD_W + gap
  const minWidth = 340;
  const calculatedWidth = Math.max(minWidth, Math.min(cardDisplayWidth + 32, 1200)); // 32 for padding

  const Component = useMemo(() => () => {
    if (!active || !config) return null;
    
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 1,
          bgcolor: 'rgba(44,44,44,0.85)',
          color: 'white',
          width: calculatedWidth,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
          borderWidth: 2,
          borderColor: '#ff9800',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
      {/* Header with title and info */}
      <Box sx={{ mb: 1, px: 1, maxWidth: '100%' }}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: 15, lineHeight: 1.1 }}>
          Deck Search
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 11, opacity: 0.8, display: 'block', mt: 0.5, whiteSpace: 'normal', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
          Top {quantity} card{quantity !== 1 ? 's' : ''}.
          {minSelect === 0 && maxSelect > 0 && ` Click to select up to ${maxSelect}.`}
          {minSelect > 0 && ` Click to select ${minSelect === maxSelect ? minSelect : `${minSelect}-${maxSelect}`}.`}
          {selectableCount === 0 && ' (No matches)'}
        </Typography>
        {effectDescription && (
          <Typography variant="caption" sx={{ fontSize: 11, color: '#90caf9', display: 'block', mt: 0.5, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
            {effectDescription}
          </Typography>
        )}
        <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.7, display: 'block', mt: 0.5, whiteSpace: 'normal', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
          {returnLocation === 'bottom' && `Rest goes to bottom${canReorder ? ' (any order)' : ''}`}
          {returnLocation === 'top' && 'Rest goes to top'}
          {returnLocation === 'shuffle' && 'Rest shuffled back'}
        </Typography>
      </Box>

      {/* Card display area - horizontal layout like character area */}
      <Box sx={{ display: 'flex', gap: 1, px: 1, pb: 1, overflowX: 'auto' }}>
        {cards.map((card, idx) => {
          const isSelected = selected.includes(idx);
          const { selectable, reason } = cardSelectability[idx] || { selectable: false, reason: 'Unknown' };
          
          return (
            <Box
              key={`${card?.id || 'card'}-${idx}`}
              sx={{
                position: 'relative',
                flexShrink: 0,
                opacity: selectable ? 1 : 0.5,
                cursor: selectable ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                '&:hover': selectable ? {
                  transform: 'translateY(-4px)',
                } : {}
              }}
              onClick={() => handleToggleSelect(idx)}
              title={selectable ? 'Click to select/deselect' : reason}
            >
              <img 
                src={card?.thumb || card?.full} 
                alt={card?.id} 
                style={{ 
                  width: CARD_W, 
                  height: 'auto', 
                  borderRadius: 4,
                  display: 'block',
                  border: isSelected ? '3px solid #2196f3' : (selectable ? '2px solid #666' : '2px solid #d32f2f')
                }} 
                onMouseEnter={() => setHovered && setHovered(card)}
                onMouseLeave={() => setHovered && setHovered(null)}
              />
              {isSelected && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    bgcolor: '#2196f3',
                    color: 'white',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.75rem'
                  }}
                >
                  ✓
                </Box>
              )}
              {!selectable && (
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 4,
                    left: 4,
                    right: 4,
                    bgcolor: 'rgba(0,0,0,0.85)',
                    color: 'white',
                    fontSize: '0.65rem',
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    textAlign: 'center'
                  }}
                >
                  {reason}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
    );
  }, [active, config, cards, quantity, filter, minSelect, maxSelect, returnLocation, canReorder, effectDescription, cardSelectability, selected, handleConfirm, setHovered, CARD_W, selectableCount, calculatedWidth, canConfirm, handleToggleSelect]);

  return { start, active, Component };
}

// Export as default for backward compatibility
export default useDeckSearch;
