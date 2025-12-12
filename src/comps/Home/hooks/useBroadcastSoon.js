import { useCallback } from 'react';

export default function useBroadcastSoon({ gameMode, multiplayer, broadcastStateToOpponent }) {
    return useCallback((delayMs = 100) => {
        if (gameMode === 'multiplayer' && multiplayer?.gameStarted && typeof broadcastStateToOpponent === 'function') {
            setTimeout(() => broadcastStateToOpponent(), delayMs);
        }
    }, [gameMode, multiplayer, broadcastStateToOpponent]);
}
