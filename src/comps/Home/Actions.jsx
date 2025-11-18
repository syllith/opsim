// Actions.jsx
// Fixed panel anchored bottom-right to show card abilities and actions
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Paper, Box, Typography, IconButton, Stack, Divider, Button, Chip, Alert, TextField } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Actions - Universal component for displaying and activating card abilities
 * Now integrated with ability handling from JSON data
 */
export default function Actions({ 
  title = 'Actions', 
  onClose, 
  card,
  cardMeta,
  cardIndex,
  actionSource,
  phase,
  turnSide,
  turnNumber,
  isYourTurn,
  canActivateMain,
  areas,
  startTargeting,
  cancelTargeting,
  confirmTargeting,
  targeting,
  getCardMeta,
  applyPowerMod,
  registerUntilNextTurnEffect,
  giveDonToCard,
  startDeckSearch,
  battle,
  battleApplyBlocker,
  battleSkipBlock,
  battleAddCounterFromHand,
  battlePlayCounterEvent,
  battleEndCounterStep,
  battleGetDefPower,
  children,
  width = 420, 
  height, 
  maxHeight = 'calc(100vh - 32px)' 
}) {
  // Local state for ability activation tracking
  const [abilityUsed, setAbilityUsed] = useState({}); // Track once-per-turn abilities
  const [selectedAbilityIndex, setSelectedAbilityIndex] = useState(null);
  const [targetInputs, setTargetInputs] = useState({}); // Store user inputs
  const [autoTriggeredOnPlay, setAutoTriggeredOnPlay] = useState(false); // Track if On Play was auto-triggered

  // Extract card information
  const cardId = card?.id;
  const abilities = cardMeta?.abilities || [];
  const keywords = cardMeta?.keywords || [];
  const cardName = cardMeta?.name || cardId;
  const category = cardMeta?.category || 'Unknown';
  const basePower = cardMeta?.stats?.power || 0;
  const cost = cardMeta?.stats?.cost || 0;
  const life = cardMeta?.stats?.life;
  const counterValue = cardMeta?.stats?.counter?.present ? cardMeta?.stats?.counter?.value : null;

  // Check if card is on the field
  const isOnField = actionSource && (
    (actionSource.section === 'char' && actionSource.keyName === 'char') ||
    (actionSource.section === 'middle' && actionSource.keyName === 'leader')
  );

  // Check if this card was just played this turn (for On Play auto-triggering)
  // According to Rule 8-1-3-1-3, On Play must trigger immediately when played
  const wasJustPlayed = useMemo(() => {
    console.log('[wasJustPlayed] Check:', { 
      justPlayed: actionSource?.justPlayed, 
      enteredTurn: card?.enteredTurn, 
      turnNumber,
      actionSource,
      card
    });
    if (!actionSource?.justPlayed) return false;
    // Also verify the card has the expected enteredTurn marker
    if (card?.enteredTurn === turnNumber) return true;
    return false;
  }, [actionSource, card, turnNumber]);

  // Get abilities that can be activated based on current game state
  const activatableAbilities = useMemo(() => {
    return abilities.map((ability, index) => {
      const type = ability.type?.toLowerCase() || '';
      const condition = ability.condition || {};
      const frequency = ability.frequency?.toLowerCase() || '';

      let canActivate = false;
      let reason = '';

      // Core ability type checks
      switch (type) {
        case 'onplay':
        case 'on play':
          // On Play abilities are AUTO effects that trigger when card is played (Rule 10-2-6, 8-4-5)
          // According to Rule 8-1-3-1-3, they must trigger immediately or are lost
          // They should NOT be manually activatable - they auto-trigger or show as missed
          canActivate = false; // Never manually activatable
          if (abilityUsed[index]) {
            reason = 'On Play already triggered';
          } else if (!isOnField) {
            reason = 'Only triggers when played to field';
          } else if (!wasJustPlayed) {
            reason = 'Missed (should trigger immediately when played)';
          } else {
            reason = 'Will auto-trigger';
          }
          break;

        case 'activatemain':
        case 'activate main':
          // Manual activation during Main Phase
          canActivate = phase?.toLowerCase() === 'main' && isYourTurn && !battle;
          reason = canActivate ? '' : 'Only during your Main Phase';
          break;

        case 'onattack':
        case 'on attack':
          // Triggers when this card attacks
          canActivate = battle && battle.attacker?.id === cardId && battle.step === 'attack';
          reason = canActivate ? '' : 'Only when this card attacks';
          break;

        case 'onblock':
        case 'on block':
          // Triggers when this card blocks
          canActivate = battle && battle.step === 'block' && battle.blockerUsed;
          reason = canActivate ? '' : 'Only when this card blocks';
          break;

        case 'blocker':
          // Blocker is handled separately in battle system
          canActivate = false;
          reason = 'Keyword ability (automatic)';
          break;

        case 'counter':
          // Counter abilities during Counter Step
          canActivate = battle && battle.step === 'counter';
          reason = canActivate ? '' : 'Only during Counter Step';
          break;

        case 'whenko':
        case 'when ko\'d':
          // Triggers when card is KO'd (handled by game engine)
          canActivate = false;
          reason = 'Triggers automatically when KO\'d';
          break;

        case 'endofturn':
        case 'end of turn':
          // Would trigger at end of turn
          canActivate = false;
          reason = 'Triggers at end of turn';
          break;

        case 'opponentturn':
        case 'opponent turn':
          // Activates during opponent's turn (e.g., when they attack)
          canActivate = !isYourTurn && phase?.toLowerCase() === 'main';
          reason = canActivate ? '' : 'Only during opponent\'s turn';
          break;

        case 'continuous':
          // Continuous effects are always active
          canActivate = false;
          reason = 'Passive effect (always active)';
          break;

        default:
          // Unknown or special abilities
          canActivate = phase?.toLowerCase() === 'main' && isYourTurn;
          reason = canActivate ? '' : 'Cannot activate now';
      }

      // Check DON!! requirement (condition.don)
      if (condition.don && condition.don > 0 && isOnField) {
        // Need to verify card has enough DON!! attached
        // Simplified check - full implementation would count actual DON!!
        const donCount = 0; // TODO: Get actual DON!! count from areas
        if (donCount < condition.don) {
          canActivate = false;
          reason = `Needs ${condition.don} DON!! attached`;
        }
      }

      // Check Once Per Turn restriction
      if (frequency === 'once per turn' && abilityUsed[index]) {
        canActivate = false;
        reason = 'Already used this turn';
      }

      return {
        ...ability,
        index,
        canActivate,
        reason,
        type,
        condition
      };
    });
  }, [abilities, phase, isYourTurn, battle, cardId, abilityUsed, isOnField, wasJustPlayed]);

  // Handle ability activation
  const activateAbility = useCallback((abilityIndex) => {
    const ability = activatableAbilities[abilityIndex];
    if (!ability) return;

    // Allow activation even if canActivate is false for auto-triggered On Play abilities
    const abilityType = ability.type?.toLowerCase() || '';
    const isOnPlay = abilityType === 'onplay' || abilityType === 'on play';
    
    // For non-On Play abilities, require canActivate to be true
    if (!isOnPlay && !ability.canActivate) return;

    const effect = ability.effect;
    if (!effect) return;

    // Mark as used IMMEDIATELY when activation starts
    // This prevents exploitation by canceling deck searches or other modal actions
    // According to game rules, these abilities should only trigger once:
    // - Once Per Turn abilities (explicit frequency)
    // - On Play abilities are marked as used by auto-trigger effect, not here
    if (ability.frequency?.toLowerCase() === 'once per turn') {
      setAbilityUsed(prev => ({ ...prev, [abilityIndex]: true }));
    }

    // Parse effect text for action type
    const effectText = (typeof effect === 'string' ? effect : effect.text || '').toLowerCase();

    // Handle different effect types based on keywords in text
    if (effectText.includes('draw')) {
      const match = effectText.match(/draw (\d+)/);
      const quantity = match ? parseInt(match[1]) : 1;
      console.log(`[Ability] Draw ${quantity} card(s)`);
      // TODO: Implement draw in game state
    }

    if (effectText.includes('ko') || effectText.includes('k.o.')) {
      // Start targeting for KO effect
      setSelectedAbilityIndex(abilityIndex);
      const powerMatch = effectText.match(/(\d+)\s*power or less/);
      const powerLimit = powerMatch ? parseInt(powerMatch[1]) : null;
      
      startTargeting({
        side: 'opponent',
        multi: true,
        min: 0,
        max: 1,
        validator: (card, ctx) => {
          if (ctx?.section !== 'char') return false;
          if (powerLimit) {
            const meta = getCardMeta(card.id);
            return (meta?.stats?.power || 0) <= powerLimit;
          }
          return true;
        }
      }, (targets) => {
        targets.forEach(t => {
          console.log(`[Ability] KO target: ${t.card?.id}`);
          // TODO: Implement KO in game state
        });
        setSelectedAbilityIndex(null);
      });
    }

    if (effectText.includes('power') && (effectText.includes('+') || effectText.includes('-'))) {
      // Power modification effect
      const match = effectText.match(/([+-]\d+)\s*power/);
      const amount = match ? parseInt(match[1]) : 0;
      
      setSelectedAbilityIndex(abilityIndex);
      startTargeting({
        side: effectText.includes('opponent') ? 'opponent' : 'player',
        multi: true,
        min: 0,
        max: 1,
        validator: (card, ctx) => {
          if (effectText.includes('leader') && ctx?.section === 'middle' && ctx?.keyName === 'leader') return true;
          if (effectText.includes('character') && ctx?.section === 'char' && ctx?.keyName === 'char') return true;
          return false;
        }
      }, (targets) => {
        targets.forEach(t => {
          if (applyPowerMod) {
            applyPowerMod(t.side, t.section, t.keyName, t.index, amount);
          }
        });
        
        if (effectText.includes('this turn') && registerUntilNextTurnEffect) {
          registerUntilNextTurnEffect(turnSide, `${cardName}: ${effect}`);
        }
        
        setSelectedAbilityIndex(null);
      });
    }

    if (effectText.includes('look at') && effectText.includes('deck')) {
      // Deck search effect - parse parameters from effect text or structured actions
      const effect = ability.effect;
      const actions = typeof effect === 'object' ? effect.actions : null;
      
      let lookCount = 5;
      let filterCriteria = {};
      let minSelect = 0;
      let maxSelect = 1;
      let returnLocation = 'bottom';
      let effectDesc = effectText;
      
      // Try to parse from structured actions first
      if (actions && actions.length > 0) {
        const searchAction = actions.find(a => a.type === 'search');
        if (searchAction) {
          lookCount = searchAction.quantity || 5;
          
          // Parse filter from target field (e.g., "Red Haired Pirates")
          if (searchAction.target) {
            filterCriteria.type = searchAction.target;
          }
          
          // Parse selection limits
          const filterStr = searchAction.filter || '';
          if (filterStr.includes('up to')) {
            const match = filterStr.match(/up to (\d+)/);
            maxSelect = match ? parseInt(match[1]) : 1;
            minSelect = 0;
          }
          
          // Parse return location
          if (searchAction.remainder) {
            if (searchAction.remainder.includes('bottom')) {
              returnLocation = 'bottom';
            } else if (searchAction.remainder.includes('top')) {
              returnLocation = 'top';
            } else if (searchAction.remainder.includes('shuffle')) {
              returnLocation = 'shuffle';
            }
          }
        }
      } else {
        // Fallback: parse from text
        const lookMatch = effectText.match(/top (\d+)/);
        if (lookMatch) lookCount = parseInt(lookMatch[1]);
        
        const selectMatch = effectText.match(/up to (\d+)/);
        if (selectMatch) {
          maxSelect = parseInt(selectMatch[1]);
          minSelect = 0;
        }
        
        // Try to extract type filter from quotes
        const typeMatch = effectText.match(/"([^"]+)"/);
        if (typeMatch) {
          filterCriteria.type = typeMatch[1];
        }
        
        // Determine return location
        if (effectText.includes('bottom')) {
          returnLocation = 'bottom';
        } else if (effectText.includes('top')) {
          returnLocation = 'top';
        } else if (effectText.includes('shuffle')) {
          returnLocation = 'shuffle';
        }
      }
      
      // Determine which side's deck to search
      const searchSide = actionSource?.side || 'player';
      
      if (startDeckSearch) {
        startDeckSearch({
          side: searchSide,
          quantity: lookCount,
          filter: filterCriteria,
          minSelect: minSelect,
          maxSelect: maxSelect,
          returnLocation: returnLocation,
          effectDescription: effectDesc,
          onComplete: (selectedCards, remainder) => {
            console.log(`[Ability] Deck search complete: ${selectedCards.length} selected, ${remainder.length} returned to ${returnLocation}`);
          }
        });
      } else {
        console.log(`[Ability] Look at top ${lookCount} cards (startDeckSearch not available)`);
      }
      
      setSelectedAbilityIndex(null);
    }

    if (effectText.includes('add') && effectText.includes('don')) {
      // DON!! manipulation
      const match = effectText.match(/(\d+)\s*don/i);
      const quantity = match ? parseInt(match[1]) : 1;
      console.log(`[Ability] Add ${quantity} DON!!`);
      // TODO: Implement DON!! adding
    }

    console.log(`[Ability] Activated: ${cardName} - ${effect}`);
  }, [activatableAbilities, applyPowerMod, registerUntilNextTurnEffect, turnSide, cardName, startTargeting, getCardMeta, startDeckSearch, actionSource]);

  // Auto-trigger On Play abilities when card is just played
  // According to Rule 8-1-3-1-3, On Play effects are AUTO effects that must trigger immediately
  useEffect(() => {
    if (!wasJustPlayed || autoTriggeredOnPlay) return;
    if (!abilities || abilities.length === 0) return;
    
    console.log('[Auto-Trigger] Checking for On Play abilities...', { wasJustPlayed, abilities });
    
    // Find On Play abilities that haven't been used yet
    const abilityIndex = abilities.findIndex((ability, index) => {
      const type = ability.type?.toLowerCase() || '';
      const isOnPlay = type === 'onplay' || type === 'on play';
      const notUsed = !abilityUsed[index];
      console.log(`[Auto-Trigger] Ability ${index}:`, { type, isOnPlay, notUsed });
      return isOnPlay && notUsed;
    });
    
    if (abilityIndex === -1) {
      console.log('[Auto-Trigger] No On Play abilities found');
      return;
    }
    
    const ability = abilities[abilityIndex];
    console.log(`[Auto-Trigger] Triggering On Play ability for ${cardName} (index ${abilityIndex})`, ability);
    
    setAutoTriggeredOnPlay(true);
    setAbilityUsed(prev => ({ ...prev, [abilityIndex]: true }));
    
    // Extract effect information
    const effect = ability.effect;
    const effectText = (typeof effect === 'string' ? effect : effect?.text || '').toLowerCase();
    
    // Check if this is a deck search ability
    if (effectText.includes('look at') && effectText.includes('deck')) {
      const actions = typeof effect === 'object' ? effect.actions : null;
      
      let lookCount = 5;
      let filterCriteria = {};
      let minSelect = 0;
      let maxSelect = 1;
      let returnLocation = 'bottom';
      let effectDesc = typeof effect === 'string' ? effect : effect?.text || '';
      
      // Parse from structured actions
      if (actions && actions.length > 0) {
        const searchAction = actions.find(a => a.type === 'search');
        if (searchAction) {
          lookCount = searchAction.quantity || 5;
          if (searchAction.target) {
            filterCriteria.type = searchAction.target;
          }
          const filterStr = searchAction.filter || '';
          if (filterStr.includes('up to')) {
            const match = filterStr.match(/up to (\d+)/);
            maxSelect = match ? parseInt(match[1]) : 1;
            minSelect = 0;
          }
          if (searchAction.remainder) {
            if (searchAction.remainder.includes('bottom')) returnLocation = 'bottom';
            else if (searchAction.remainder.includes('top')) returnLocation = 'top';
            else if (searchAction.remainder.includes('shuffle')) returnLocation = 'shuffle';
          }
        }
      }
      
      const searchSide = actionSource?.side || 'player';
      
      if (startDeckSearch) {
        console.log('[Auto-Trigger] Starting deck search...', { lookCount, filterCriteria, maxSelect });
        startDeckSearch({
          side: searchSide,
          quantity: lookCount,
          filter: filterCriteria,
          minSelect: minSelect,
          maxSelect: maxSelect,
          returnLocation: returnLocation,
          effectDescription: effectDesc,
          onComplete: (selectedCards, remainder) => {
            console.log(`[Auto-Trigger] Deck search complete: ${selectedCards.length} selected, ${remainder.length} returned to ${returnLocation}`);
          }
        });
      }
    }
  }, [wasJustPlayed, autoTriggeredOnPlay, abilities, abilityUsed, cardName, actionSource, startDeckSearch]);

  // If no card provided, render as simple container
  if (!card || !cardMeta) {
    return (
      <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
        <Paper elevation={6} sx={{ width, height: height || 'auto', maxHeight, display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden' }}>
          <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
            {onClose && (
              <IconButton size="small" onClick={onClose} aria-label="close actions">
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Box sx={{ p: 1, flex: 1, minHeight: 0, overflow: 'auto', bgcolor: 'background.paper' }}>
            {children}
          </Box>
        </Paper>
      </Box>
    );
  }

  // Render with card abilities
  return (
    <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1400 }}>
      <Paper elevation={6} sx={{ width, height: height || 'auto', maxHeight, display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {cardId}{cardName && cardName !== cardId ? ` — ${cardName}` : ''}
          </Typography>
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="close actions">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        
        <Box sx={{ p: 1.5, flex: 1, minHeight: 0, overflow: 'auto', bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            {/* Card Type Info */}
            <Typography variant="caption" color="text.secondary">
              {category}
              {cardMeta.attribute && ` • ${cardMeta.attribute}`}
              {cardMeta.types && cardMeta.types.length > 0 && ` • ${cardMeta.types.join('/')}`}
              {cost !== null && cost !== undefined && ` • Cost ${cost}`}
              {basePower > 0 && ` • Power ${basePower}`}
              {life && ` • Life ${life}`}
            </Typography>

            {/* Keywords Display */}
            {keywords.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {keywords.map((keyword, idx) => (
                  <Chip 
                    key={idx} 
                    label={keyword} 
                    size="small" 
                    color={
                      keyword.toLowerCase().includes('rush') ? 'warning' :
                      keyword.toLowerCase().includes('blocker') ? 'info' :
                      keyword.toLowerCase().includes('double attack') ? 'error' :
                      'default'
                    }
                  />
                ))}
              </Stack>
            )}

            {/* Counter Value */}
            {counterValue !== null && (
              <Chip label={`Counter +${counterValue}`} size="small" color="success" />
            )}

            {/* Abilities Section */}
            {abilities.length > 0 ? (
              <Box>
                <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>Abilities</Typography>
                <Stack spacing={1.5}>
                  {activatableAbilities.map((ability, idx) => (
                    <Box 
                      key={idx}
                      sx={{ 
                        p: 1.25, 
                        border: '1px solid',
                        borderColor: ability.canActivate ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: ability.canActivate ? 'action.hover' : 'transparent'
                      }}
                    >
                      {/* Ability Type */}
                      <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip 
                          label={ability.type || 'Unknown'} 
                          size="small" 
                          color="primary"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {ability.frequency && (
                          <Chip label={ability.frequency} size="small" variant="outlined" />
                        )}
                        {ability.condition?.don > 0 && (
                          <Chip label={`DON!! x${ability.condition.don}`} size="small" color="secondary" />
                        )}
                      </Stack>

                      {/* Effect Text */}
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {typeof ability.effect === 'string' ? ability.effect : ability.effect?.text || 'No description'}
                      </Typography>

                      {/* Activation Controls */}
                      {ability.canActivate ? (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => activateAbility(idx)}
                          disabled={selectedAbilityIndex !== null && selectedAbilityIndex !== idx}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Alert 
                          severity={
                            ability.reason === 'Will auto-trigger' ? 'success' :
                            ability.reason?.includes('already') || ability.reason?.includes('Already') ? 'warning' :
                            'info'
                          }
                          sx={{ 
                            py: 0.5, 
                            px: 1.5,
                            alignItems: 'center',
                            '& .MuiAlert-message': { 
                              py: 0,
                              width: '100%'
                            } 
                          }}
                        >
                          {ability.reason || 'Cannot activate now'}
                        </Alert>
                      )}

                      {/* Target Selection UI */}
                      {selectedAbilityIndex === idx && targeting?.active && (
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          {/* Selected targets display */}
                          {targeting.selected && targeting.selected.length > 0 && (
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                Selected Target{targeting.selected.length > 1 ? 's' : ''}:
                              </Typography>
                              {targeting.selected.map((target, tidx) => {
                                let targetName = 'Unknown';
                                if (target.section === 'middle' && target.keyName === 'leader') {
                                  targetName = `${target.side === 'player' ? 'Your' : 'Opponent'} Leader`;
                                } else if (target.section === 'char' && target.keyName === 'char') {
                                  const targetSide = target.side === 'player' ? areas?.player : areas?.opponent;
                                  const targetCard = targetSide?.char?.[target.index];
                                  const targetMeta = targetCard ? getCardMeta(targetCard.id) : null;
                                  targetName = targetMeta?.name || targetCard?.id || 'Character';
                                }
                                return (
                                  <Chip 
                                    key={tidx}
                                    label={targetName}
                                    size="small"
                                    color="warning"
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                  />
                                );
                              })}
                            </Box>
                          )}
                          {/* Action buttons */}
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                              {targeting.selected && targeting.selected.length > 0 
                                ? 'Select more or confirm'
                                : 'Select target(s) on board...'
                              }
                            </Typography>
                            <Button 
                              size="small" 
                              variant="outlined" 
                              onClick={confirmTargeting}
                              disabled={(targeting.selected?.length || 0) < targeting.min}
                            >
                              Confirm
                            </Button>
                            <Button size="small" variant="text" onClick={() => { cancelTargeting(); setSelectedAbilityIndex(null); }}>
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No special abilities
              </Typography>
            )}

            {/* Full Card Text */}
            {cardMeta.text && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {cardMeta.text}
                </Typography>
              </>
            )}

            {/* Trigger Text */}
            {cardMeta.trigger && (
              <Box sx={{ p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
                <Typography variant="caption" fontWeight={700}>
                  [Trigger]: {cardMeta.trigger.text}
                </Typography>
              </Box>
            )}

            {/* Additional children (play controls, attack controls, etc.) */}
            {children}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
