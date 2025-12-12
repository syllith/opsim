// DiceRoll.jsx - Dice roll component to determine who goes first
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Paper, Typography, Button, CircularProgress } from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';

const DiceRoll = ({
  onComplete, // Called with { firstPlayer: 'player' | 'opponent' }
  visible = false,
  isHost = true, // In multiplayer, only host determines outcome
  isMultiplayer = false, // Is this a multiplayer game?
  syncedResult = null, // Result received from host (for guest)
  onDiceRolled = null // Called by host when dice result is determined (for broadcasting)
}) => {
  const [rolling, setRolling] = useState(false);
  const [playerRoll, setPlayerRoll] = useState(null);
  const [opponentRoll, setOpponentRoll] = useState(null);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [finalRolls, setFinalRolls] = useState(null); // Store final roll values
  const [countdown, setCountdown] = useState(null); // Auto-continue countdown

  const timersRef = useRef({ startTimer: null, rollInterval: null });

  const myCanonicalSide = useMemo(() => {
    if (!isMultiplayer) return 'player';
    return isHost ? 'player' : 'opponent';
  }, [isMultiplayer, isHost]);

  const youRoll = useMemo(() => {
    if (playerRoll === null || opponentRoll === null) return null;
    return myCanonicalSide === 'player' ? playerRoll : opponentRoll;
  }, [playerRoll, opponentRoll, myCanonicalSide]);

  const oppRoll = useMemo(() => {
    if (playerRoll === null || opponentRoll === null) return null;
    return myCanonicalSide === 'player' ? opponentRoll : playerRoll;
  }, [playerRoll, opponentRoll, myCanonicalSide]);

  const youGoFirst = useMemo(() => {
    if (!result) return false;
    return result === myCanonicalSide;
  }, [result, myCanonicalSide]);

  const clearTimers = useCallback(() => {
    if (timersRef.current.startTimer) {
      clearTimeout(timersRef.current.startTimer);
      timersRef.current.startTimer = null;
    }
    if (timersRef.current.rollInterval) {
      clearInterval(timersRef.current.rollInterval);
      timersRef.current.rollInterval = null;
    }
  }, []);

  const rollDice = useCallback((presetResult = null) => {
    clearTimers();
    setRolling(true);
    setPlayerRoll(null);
    setOpponentRoll(null);
    setResult(null);
    setShowResult(false);
    setCountdown(null);

    const tickMs = 100;

    // Multiplayer: server provides predetermined result + timing.
    if (presetResult && typeof presetResult === 'object') {
      const pRoll = presetResult.playerRoll;
      const oRoll = presetResult.opponentRoll;
      const firstPlayer = presetResult.firstPlayer;
      const startAt = typeof presetResult.startAt === 'number' ? presetResult.startAt : Date.now();
      const revealAt = typeof presetResult.revealAt === 'number' ? presetResult.revealAt : startAt + 1500;

      const startDelay = Math.max(0, startAt - Date.now());
      timersRef.current.startTimer = setTimeout(() => {
        timersRef.current.rollInterval = setInterval(() => {
          setPlayerRoll(Math.floor(Math.random() * 6) + 1);
          setOpponentRoll(Math.floor(Math.random() * 6) + 1);

          if (Date.now() >= revealAt) {
            clearTimers();
            setPlayerRoll(pRoll);
            setOpponentRoll(oRoll);
            setRolling(false);
            setResult(firstPlayer);
            setFinalRolls({ playerRoll: pRoll, opponentRoll: oRoll });
            setShowResult(true);
            setCountdown(3);
          }
        }, tickMs);
      }, startDelay);

      return;
    }

    // Non-multiplayer fallback: local roll.
    let pRoll;
    let oRoll;
    do {
      pRoll = Math.floor(Math.random() * 6) + 1;
      oRoll = Math.floor(Math.random() * 6) + 1;
    } while (pRoll === oRoll);
    const firstPlayer = pRoll > oRoll ? 'player' : 'opponent';

    // Animate for a fixed duration then reveal.
    const startAt = Date.now();
    const revealAt = startAt + 1500;

    timersRef.current.rollInterval = setInterval(() => {
      setPlayerRoll(Math.floor(Math.random() * 6) + 1);
      setOpponentRoll(Math.floor(Math.random() * 6) + 1);

      if (Date.now() >= revealAt) {
        clearTimers();
        setPlayerRoll(pRoll);
        setOpponentRoll(oRoll);
        setRolling(false);
        setResult(firstPlayer);
        setFinalRolls({ playerRoll: pRoll, opponentRoll: oRoll });
        setShowResult(true);
        setCountdown(3);

        if (onDiceRolled) {
          onDiceRolled({ firstPlayer, playerRoll: pRoll, opponentRoll: oRoll });
        }
      }
    }, tickMs);
  }, [clearTimers, onDiceRolled]);

  const handleContinue = useCallback(() => {
    if (result && finalRolls) {
      setCountdown(null); // Clear countdown
      onComplete({ firstPlayer: result, ...finalRolls });
    }
  }, [result, finalRolls, onComplete]);

  // Auto-continue countdown effect
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    
    const timer = setTimeout(() => {
      if (countdown === 1) {
        // Countdown finished, auto-continue
        handleContinue();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [countdown, handleContinue]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Auto-roll when component becomes visible
  useEffect(() => {
    if (visible && !rolling && !result) {
      if (isMultiplayer) {
        if (!syncedResult) {
          return;
        }
        const timer = setTimeout(() => rollDice(syncedResult), 0);
        return () => clearTimeout(timer);
      }

      const timer = setTimeout(() => rollDice(), 200);
      return () => clearTimeout(timer);
    }
  }, [visible, rolling, result, rollDice, isMultiplayer, isHost, syncedResult]);

  if (!visible) return null;

  // Multiplayer waiting for server roll scheduling
  if (isMultiplayer && !syncedResult && !rolling && !result) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Paper
          elevation={12}
          sx={{
            p: 4,
            minWidth: 400,
            maxWidth: 500,
            textAlign: 'center',
            bgcolor: 'background.paper',
            border: '3px solid',
            borderColor: 'primary.main',
            borderRadius: 3
          }}
        >
          <CircularProgress size={64} sx={{ mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Waiting for Server
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Waiting for the dice roll to start...
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Paper
        elevation={12}
        sx={{
          p: 4,
          minWidth: 400,
          maxWidth: 500,
          textAlign: 'center',
          bgcolor: 'background.paper',
          border: '3px solid',
          borderColor: 'primary.main',
          borderRadius: 3
        }}
      >
        <CasinoIcon
          sx={{
            fontSize: 64,
            color: 'primary.main',
            mb: 2,
            animation: rolling ? 'spin 0.3s linear infinite' : 'none',
            '@keyframes spin': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' }
            }
          }}
        />

        <Typography variant="h4" fontWeight={700} gutterBottom>
          Rolling for First Turn
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {rolling
            ? 'Rolling dice...'
            : result
            ? 'Roll complete!'
            : 'Starting dice roll...'}
        </Typography>

        {/* Dice Display */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
            mb: 3
          }}
        >
          {/* You */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              You
            </Typography>
            <Box
              sx={{
                width: 80,
                height: 80,
                bgcolor: result ? (youGoFirst ? 'success.main' : 'grey.800') : 'grey.800',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid',
                borderColor: result ? (youGoFirst ? 'success.light' : 'grey.600') : 'grey.600',
                transition: 'all 0.3s ease',
                transform: rolling ? 'scale(1.05)' : 'scale(1)',
                animation: rolling ? 'shake 0.1s linear infinite' : 'none',
                '@keyframes shake': {
                  '0%, 100%': { transform: 'translateX(0)' },
                  '25%': { transform: 'translateX(-2px)' },
                  '75%': { transform: 'translateX(2px)' }
                }
              }}
            >
              <Typography
                variant="h3"
                fontWeight={700}
                sx={{ color: 'white' }}
              >
                {youRoll || '-'}
              </Typography>
            </Box>
          </Box>

          {/* VS */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              pt: 3
            }}
          >
            <Typography variant="h5" fontWeight={700} color="text.secondary">
              VS
            </Typography>
          </Box>

          {/* Opponent */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Opponent
            </Typography>
            <Box
              sx={{
                width: 80,
                height: 80,
                bgcolor: result ? (!youGoFirst ? 'success.main' : 'grey.800') : 'grey.800',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid',
                borderColor: result ? (!youGoFirst ? 'success.light' : 'grey.600') : 'grey.600',
                transition: 'all 0.3s ease',
                transform: rolling ? 'scale(1.05)' : 'scale(1)',
                animation: rolling ? 'shake 0.1s linear infinite' : 'none'
              }}
            >
              <Typography
                variant="h3"
                fontWeight={700}
                sx={{ color: 'white' }}
              >
                {oppRoll || '-'}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Result */}
        {showResult && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{
                color: 'success.main',
                animation: 'fadeIn 0.5s ease',
                '@keyframes fadeIn': {
                  '0%': { opacity: 0, transform: 'translateY(-10px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' }
                }
              }}
            >
              {youGoFirst ? 'You go first!' : 'Opponent goes first!'}
            </Typography>
          </Box>
        )}

        {/* Auto-continue countdown */}
        {showResult && countdown !== null && (
          <Box sx={{ animation: 'fadeIn 0.5s ease' }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              Continuing to Opening Hands in {countdown}...
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleContinue}
              sx={{ opacity: 0.7 }}
            >
              Skip
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default DiceRoll;
