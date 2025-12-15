/**
 * PromptDialog.jsx - UI Component for Engine Prompts
 * 
 * Renders different dialogs based on prompt type:
 * - counter: Select counter cards to trash from hand
 * - blocker: Choose a blocker or skip blocking
 * - lifeTrigger: Activate trigger or add to hand
 * - replacement: Accept or decline a replacement effect
 * 
 * PAYLOAD STRUCTURES (from engine):
 * 
 * counter: {
 *   battleId, defenderOwner, targetInstanceId,
 *   handCounterCandidates: [{ instanceId, cardId, printedName, counter }],
 *   eventCounterCandidates: [{ instanceId, cardId, printedName, costDesc, printedText }]
 * }
 * 
 * blocker: {
 *   battleId, attackerInstanceId, targetInstanceId, defenderOwner,
 *   blockers: [{ instanceId, cardId, printedName, basePower, keywords }]
 * }
 * 
 * lifeTrigger: {
 *   side,
 *   lifeCard: { instanceId, cardId, printedName, hasTrigger, printedText }
 * }
 * 
 * replacement: {
 *   eventName,
 *   replacements: [{ id, sourceInstanceId, ownerId, description, actions }]
 * }
 */
import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  Divider,
  Box,
  Chip,
  Paper,
  Alert
} from '@mui/material';

/**
 * Get prompt type from choiceSpec
 */
function getPromptType(prompt) {
  if (!prompt || !prompt.choiceSpec) return 'unknown';
  const spec = prompt.choiceSpec;
  
  // Detect type from payload structure
  if (spec.handCounterCandidates !== undefined || spec.eventCounterCandidates !== undefined) {
    return 'counter';
  }
  if (spec.blockers !== undefined) {
    return 'blocker';
  }
  if (spec.lifeCard !== undefined) {
    return 'lifeTrigger';
  }
  if (spec.replacements !== undefined) {
    return 'replacement';
  }
  
  return 'unknown';
}

// =============================================================================
// Counter Prompt Component
// =============================================================================
function CounterPrompt({ choiceSpec, onSubmit, onDismiss }) {
  const [selectedHandIds, setSelectedHandIds] = useState([]);
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  
  const { handCounterCandidates = [], eventCounterCandidates = [] } = choiceSpec;
  
  const handleHandToggle = useCallback((instanceId) => {
    setSelectedHandIds((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      return [...prev, instanceId];
    });
  }, []);
  
  const handleEventToggle = useCallback((instanceId) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      return [...prev, instanceId];
    });
  }, []);
  
  const handleConfirm = () => {
    onSubmit({
      trashedHandIds: selectedHandIds,
      activatedEventIds: selectedEventIds
    });
  };
  
  const handleSkip = () => {
    onSubmit({
      trashedHandIds: [],
      activatedEventIds: []
    });
  };
  
  const totalSelected = selectedHandIds.length + selectedEventIds.length;
  
  return (
    <>
      <DialogTitle>Counter Step</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select cards to use as counters. Counter cards will be trashed to add their counter value to your defender's power.
        </Typography>
        
        {handCounterCandidates.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Hand Counter Cards (trash to add counter)
            </Typography>
            <List dense>
              {handCounterCandidates.map((card) => (
                <ListItem key={card.instanceId} disablePadding>
                  <ListItemButton onClick={() => handleHandToggle(card.instanceId)}>
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedHandIds.includes(card.instanceId)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={card.printedName || card.cardId}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', gap: 1 }}>
                          <Chip size="small" label={`+${card.counter || 0} Power`} color="primary" />
                          <Typography variant="caption" component="span">{card.cardId}</Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
        
        {eventCounterCandidates.length > 0 && (
          <>
            {handCounterCandidates.length > 0 && <Divider sx={{ my: 2 }} />}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Event Counter Cards (activate counter ability)
            </Typography>
            <List dense>
              {eventCounterCandidates.map((card) => (
                <ListItem key={card.instanceId} disablePadding>
                  <ListItemButton onClick={() => handleEventToggle(card.instanceId)}>
                    <ListItemIcon>
                      <Checkbox
                        edge="start"
                        checked={selectedEventIds.includes(card.instanceId)}
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={card.printedName || card.cardId}
                      secondary={
                        <Typography variant="caption" component="span" sx={{ 
                          display: 'block', 
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {card.printedText || card.costDesc || card.cardId}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
        
        {handCounterCandidates.length === 0 && eventCounterCandidates.length === 0 && (
          <Alert severity="info">No counter cards available.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSkip} color="secondary">
          Skip Counter
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained" 
          disabled={totalSelected === 0}
        >
          Use Counter{totalSelected > 0 ? ` (${totalSelected})` : ''}
        </Button>
      </DialogActions>
    </>
  );
}

// =============================================================================
// Blocker Prompt Component
// =============================================================================
function BlockerPrompt({ choiceSpec, onSubmit, onDismiss }) {
  const [selectedBlockerId, setSelectedBlockerId] = useState(null);
  
  const { blockers = [] } = choiceSpec;
  
  const handleConfirm = () => {
    onSubmit({
      chosenBlockerId: selectedBlockerId
    });
  };
  
  const handleSkip = () => {
    onSubmit({
      chosenBlockerId: null
    });
  };
  
  return (
    <>
      <DialogTitle>Block Attack?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a character with Blocker to intercept the attack, or skip to let the attack proceed.
        </Typography>
        
        {blockers.length > 0 ? (
          <List dense>
            {blockers.map((blocker) => (
              <ListItem key={blocker.instanceId} disablePadding>
                <ListItemButton 
                  onClick={() => setSelectedBlockerId(blocker.instanceId)}
                  selected={selectedBlockerId === blocker.instanceId}
                >
                  <ListItemIcon>
                    <Radio
                      checked={selectedBlockerId === blocker.instanceId}
                      tabIndex={-1}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={blocker.printedName || blocker.cardId}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip size="small" label={`${blocker.basePower || 0} Power`} />
                        {blocker.keywords?.includes('Blocker') && (
                          <Chip size="small" label="Blocker" color="info" variant="outlined" />
                        )}
                        <Typography variant="caption" component="span">{blocker.cardId}</Typography>
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Alert severity="info">No blockers available.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSkip} color="secondary">
          Don't Block
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={!selectedBlockerId}
        >
          Block with Selected
        </Button>
      </DialogActions>
    </>
  );
}

// =============================================================================
// Life Trigger Prompt Component
// =============================================================================
function LifeTriggerPrompt({ choiceSpec, onSubmit, onDismiss }) {
  const { lifeCard } = choiceSpec;
  
  const handleActivate = () => {
    onSubmit({ action: 'activate' });
  };
  
  const handleAddToHand = () => {
    onSubmit({ action: 'addToHand' });
  };
  
  if (!lifeCard) {
    return (
      <>
        <DialogTitle>Life Trigger</DialogTitle>
        <DialogContent>
          <Alert severity="error">No life card information available.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onSubmit({ action: 'addToHand' })}>
            Add to Hand
          </Button>
        </DialogActions>
      </>
    );
  }
  
  return (
    <>
      <DialogTitle>Life Trigger!</DialogTitle>
      <DialogContent dividers>
        <Paper elevation={2} sx={{ p: 2, mb: 2, backgroundColor: 'action.hover' }}>
          <Typography variant="h6" gutterBottom>
            {lifeCard.printedName || lifeCard.cardId}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {lifeCard.cardId}
          </Typography>
          {lifeCard.printedText && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
              {lifeCard.printedText}
            </Typography>
          )}
        </Paper>
        
        <Typography variant="body2" color="text.secondary">
          This life card has a Trigger ability. Would you like to activate its effect, or add it to your hand?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleAddToHand} color="secondary">
          Add to Hand
        </Button>
        <Button onClick={handleActivate} variant="contained" color="primary">
          Activate Trigger
        </Button>
      </DialogActions>
    </>
  );
}

// =============================================================================
// Replacement Prompt Component
// =============================================================================
function ReplacementPrompt({ choiceSpec, onSubmit, onDismiss }) {
  const [selectedReplacementId, setSelectedReplacementId] = useState(null);
  
  const { replacements = [], eventName } = choiceSpec;
  
  // Auto-select if only one replacement
  React.useEffect(() => {
    if (replacements.length === 1 && !selectedReplacementId) {
      setSelectedReplacementId(replacements[0].id);
    }
  }, [replacements, selectedReplacementId]);
  
  const handleAccept = () => {
    onSubmit({
      accept: true,
      chosenReplacementId: selectedReplacementId || (replacements[0]?.id)
    });
  };
  
  const handleDecline = () => {
    onSubmit({
      accept: false,
      chosenReplacementId: null
    });
  };
  
  return (
    <>
      <DialogTitle>Replacement Effect</DialogTitle>
      <DialogContent dividers>
        {eventName && (
          <Alert severity="info" sx={{ mb: 2 }}>
            A replacement effect can modify the "{eventName}" event.
          </Alert>
        )}
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {replacements.length === 1 
            ? 'Would you like to apply this replacement effect?'
            : 'Choose a replacement effect to apply:'}
        </Typography>
        
        {replacements.length > 0 ? (
          <List dense>
            {replacements.map((repl) => (
              <ListItem key={repl.id} disablePadding>
                <ListItemButton 
                  onClick={() => setSelectedReplacementId(repl.id)}
                  selected={selectedReplacementId === repl.id}
                >
                  {replacements.length > 1 && (
                    <ListItemIcon>
                      <Radio
                        checked={selectedReplacementId === repl.id}
                        tabIndex={-1}
                      />
                    </ListItemIcon>
                  )}
                  <ListItemText
                    primary={repl.description || 'Replacement Effect'}
                    secondary={repl.sourceInstanceId ? `Source: ${repl.sourceInstanceId}` : null}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ) : (
          <Alert severity="warning">No replacement effects available.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDecline} color="secondary">
          Decline
        </Button>
        <Button 
          onClick={handleAccept} 
          variant="contained"
          disabled={replacements.length > 1 && !selectedReplacementId}
        >
          Apply Replacement
        </Button>
      </DialogActions>
    </>
  );
}

// =============================================================================
// Unknown Prompt Component (fallback)
// =============================================================================
function UnknownPrompt({ choiceSpec, onSubmit, onDismiss }) {
  return (
    <>
      <DialogTitle>Game Prompt</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Unknown prompt type. The game is waiting for your response.
        </Alert>
        <Typography variant="body2" component="pre" sx={{ 
          overflow: 'auto', 
          maxHeight: 200,
          backgroundColor: 'action.hover',
          p: 1,
          borderRadius: 1,
          fontSize: '0.75rem'
        }}>
          {JSON.stringify(choiceSpec, null, 2)}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDismiss} color="secondary">
          Dismiss
        </Button>
        <Button onClick={() => onSubmit(null)} variant="contained">
          Continue
        </Button>
      </DialogActions>
    </>
  );
}

// =============================================================================
// Main PromptDialog Component
// =============================================================================
export default function PromptDialog({ prompt, onSubmit, onDismiss, pendingCount = 1 }) {
  if (!prompt) return null;
  
  const promptType = getPromptType(prompt);
  const choiceSpec = prompt.choiceSpec || {};
  
  // Render appropriate prompt component based on type
  const renderPromptContent = () => {
    switch (promptType) {
      case 'counter':
        return <CounterPrompt choiceSpec={choiceSpec} onSubmit={onSubmit} onDismiss={onDismiss} />;
      case 'blocker':
        return <BlockerPrompt choiceSpec={choiceSpec} onSubmit={onSubmit} onDismiss={onDismiss} />;
      case 'lifeTrigger':
        return <LifeTriggerPrompt choiceSpec={choiceSpec} onSubmit={onSubmit} onDismiss={onDismiss} />;
      case 'replacement':
        return <ReplacementPrompt choiceSpec={choiceSpec} onSubmit={onSubmit} onDismiss={onDismiss} />;
      default:
        return <UnknownPrompt choiceSpec={choiceSpec} onSubmit={onSubmit} onDismiss={onDismiss} />;
    }
  };
  
  return (
    <Dialog
      open={true}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown
      aria-labelledby="prompt-dialog-title"
    >
      {pendingCount > 1 && (
        <Box sx={{ 
          position: 'absolute', 
          top: 8, 
          right: 48,
          zIndex: 1
        }}>
          <Chip 
            size="small" 
            label={`${pendingCount} pending`} 
            color="warning"
          />
        </Box>
      )}
      {renderPromptContent()}
    </Dialog>
  );
}
