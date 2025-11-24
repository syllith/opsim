import React, { useState, useMemo } from 'react';
import { Box, Paper, Stack, Typography, Button, Alert } from '@mui/material';

/**
 * DeckSearch - Universal component for deck searching effects
 * Now renders as a horizontal slot above the hand area instead of a dialog
 * 
 * Props:
 * - open: boolean - whether to display the slot
 * - cards: array - card asset objects to display
 * - quantity: number - how many cards to look at (e.g., 5)
 * - filter: object - filter criteria { type: string, color: string, cost: number, etc. }
 * - minSelect: number - minimum cards to select (usually 0 for "up to")
 * - maxSelect: number - maximum cards to select (e.g., 1 for "up to 1")
 * - returnLocation: string - where to put non-selected cards: 'bottom' | 'top' | 'shuffle'
 * - canReorder: boolean - whether player can reorder the returned cards
 * - onConfirm: function(selectedCards, orderedRemainder) - callback with selections
 * - onCancel: function - callback to cancel
 * - getCardMeta: function(cardId) - function to get card metadata for filtering
 * - setHovered: function - set hovered card for card viewer
 * - CARD_W: number - card width constant
 */
export default function DeckSearch({
  open,
  cards = [],
  quantity = 5,
  filter = {},
  minSelect = 0,
  maxSelect = 1,
  returnLocation = 'bottom',
  canReorder = true,
  onConfirm,
  onCancel,
  getCardMeta,
  effectDescription = '',
  setHovered,
  CARD_W = 120
}) {
  const [selected, setSelected] = useState([]);

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
        
        if (onConfirm) onConfirm(selectedCards, remainder);
        setSelected([]);
      }, 150);
    }
  };

  if (!open) return null;

  const canConfirm = selected.length >= minSelect && selected.length <= maxSelect;
  const selectableCount = cardSelectability.filter(c => c.selectable).length;
  
  // Calculate width based on number of cards
  const cardDisplayWidth = (CARD_W + 8) * cards.length; // CARD_W + gap
  const minWidth = 340;
  const calculatedWidth = Math.max(minWidth, Math.min(cardDisplayWidth + 32, 1200)); // 32 for padding

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
}
