/**
 * PromptProvider.jsx - React Provider for Engine Prompts
 * 
 * PURPOSE:
 * Listens for engine prompt events and manages prompt state for UI rendering.
 * This component bridges the engine's prompt system with the React UI.
 * 
 * FLOW:
 * 1. Engine calls engine.prompt('counter', payload)
 * 2. Default handler forwards to promptManager.requestChoice()
 * 3. promptManager emits 'prompt' event via engine.emit('prompt', { prompt })
 * 4. PromptProvider receives the event, stores prompt in state
 * 5. PromptDialog renders the prompt UI to the user
 * 6. User makes selection, PromptProvider calls promptManager.submitChoice()
 * 7. promptManager resolves the promise, engine receives the selection
 * 
 * USAGE:
 * Place near the top of your component tree (e.g., inside Home.jsx):
 *   <PromptProvider myPlayerSide={myMultiplayerSide} />
 */
import React, { useEffect, useState, useCallback } from 'react';
import engine from '../../engine/index.js';
import promptManager from '../../engine/core/promptManager.js';
import PromptDialog from './PromptDialog';

/**
 * PromptProvider Component
 * 
 * @param {object} props
 * @param {string} props.myPlayerSide - The local player's side ('player' or 'opponent')
 *                                      Used to determine which prompts to show and
 *                                      to submit choices with correct playerId.
 */
export default function PromptProvider({ myPlayerSide = 'player' }) {
  // Array of pending prompts (we show one at a time, but queue them)
  const [pending, setPending] = useState([]);

  // Subscribe to engine prompt events
  useEffect(() => {
    const onPrompt = ({ prompt }) => {
      if (!prompt) return;
      
      // Only show prompts intended for this player
      // In multiplayer, each client only sees their own prompts
      if (prompt.playerId !== myPlayerSide) {
        console.log('[PromptProvider] Ignoring prompt for other player:', prompt.playerId);
        return;
      }
      
      setPending((prev) => [...prev, prompt]);
    };

    const onPromptAnswered = ({ promptId }) => {
      // Remove answered prompt from queue
      setPending((prev) => prev.filter((p) => p.id !== promptId));
    };

    const onPromptCancelled = ({ promptId }) => {
      // Remove cancelled prompt from queue
      setPending((prev) => prev.filter((p) => p.id !== promptId));
    };

    const onPromptTimedOut = ({ promptId }) => {
      // Remove timed-out prompt from queue
      setPending((prev) => prev.filter((p) => p.id !== promptId));
    };

    // Register event listeners
    engine.on('prompt', onPrompt);
    engine.on('promptAnswered', onPromptAnswered);
    engine.on('promptCancelled', onPromptCancelled);
    engine.on('promptTimedOut', onPromptTimedOut);

    return () => {
      // Cleanup listeners on unmount
      engine.off('prompt', onPrompt);
      engine.off('promptAnswered', onPromptAnswered);
      engine.off('promptCancelled', onPromptCancelled);
      engine.off('promptTimedOut', onPromptTimedOut);
    };
  }, [myPlayerSide]);

  /**
   * Handle user selection submission
   * @param {string} promptId - The prompt ID
   * @param {any} selection - The user's selection (shape depends on prompt type)
   */
  const handleSubmit = useCallback((promptId, selection) => {
    const result = promptManager.submitChoice(promptId, myPlayerSide, selection);
    
    if (!result.success) {
      console.warn('[PromptProvider] Failed to submit prompt choice:', result.reason);
      // Still remove from UI to prevent stuck state
      setPending((prev) => prev.filter((p) => p.id !== promptId));
    }
    // On success, the 'promptAnswered' event will remove it from queue
  }, [myPlayerSide]);

  /**
   * Handle prompt dismissal/skip (submit null selection)
   * @param {string} promptId - The prompt ID
   */
  const handleDismiss = useCallback((promptId) => {
    handleSubmit(promptId, null);
  }, [handleSubmit]);

  // Don't render if no pending prompts
  if (pending.length === 0) {
    return null;
  }

  // Show the first pending prompt (FIFO queue)
  const currentPrompt = pending[0];

  return (
    <PromptDialog
      prompt={currentPrompt}
      onSubmit={(selection) => handleSubmit(currentPrompt.id, selection)}
      onDismiss={() => handleDismiss(currentPrompt.id)}
      pendingCount={pending.length}
    />
  );
}
