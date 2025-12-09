// DiceRoll.jsx - Dice roll component to determine who goes first
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Button } from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';

const DiceRoll = ({
  onComplete, // Called with { firstPlayer: 'player' | 'opponent' }
  visible = false
}) => {
  const [rolling, setRolling] = useState(false);
  const [playerRoll, setPlayerRoll] = useState(null);
  const [opponentRoll, setOpponentRoll] = useState(null);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const rollDice = useCallback(() => {
    setRolling(true);
    setPlayerRoll(null);
    setOpponentRoll(null);
    setResult(null);
    setShowResult(false);

    // Animate dice rolling
    let rollCount = 0;
    const maxRolls = 15;
    const rollInterval = setInterval(() => {
      setPlayerRoll(Math.floor(Math.random() * 6) + 1);
      setOpponentRoll(Math.floor(Math.random() * 6) + 1);
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(rollInterval);

        // Final roll
        let pRoll, oRoll;
        do {
          pRoll = Math.floor(Math.random() * 6) + 1;
          oRoll = Math.floor(Math.random() * 6) + 1;
        } while (pRoll === oRoll); // Re-roll on tie

        setPlayerRoll(pRoll);
        setOpponentRoll(oRoll);
        setRolling(false);

        const firstPlayer = pRoll > oRoll ? 'player' : 'opponent';
        setResult(firstPlayer);

        // Show result after a brief pause
        setTimeout(() => {
          setShowResult(true);
        }, 500);
      }
    }, 100);
  }, []);

  const handleContinue = useCallback(() => {
    if (result) {
      onComplete({ firstPlayer: result });
    }
  }, [result, onComplete]);

  // Auto-roll when component becomes visible
  useEffect(() => {
    if (visible && !rolling && !result) {
      // Small delay before starting roll
      const timer = setTimeout(rollDice, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, rolling, result, rollDice]);

  if (!visible) return null;

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
          {/* Bottom Player (You) */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Bottom Player
            </Typography>
            <Box
              sx={{
                width: 80,
                height: 80,
                bgcolor: result === 'player' ? 'success.main' : 'grey.800',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid',
                borderColor: result === 'player' ? 'success.light' : 'grey.600',
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
                {playerRoll || '-'}
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

          {/* Top Player (Opponent) */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Top Player
            </Typography>
            <Box
              sx={{
                width: 80,
                height: 80,
                bgcolor: result === 'opponent' ? 'success.main' : 'grey.800',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid',
                borderColor: result === 'opponent' ? 'success.light' : 'grey.600',
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
                {opponentRoll || '-'}
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
              {result === 'player'
                ? '🎉 Bottom Player goes first!'
                : '🎉 Top Player goes first!'}
            </Typography>
          </Box>
        )}

        {/* Continue Button */}
        {showResult && (
          <Button
            variant="contained"
            size="large"
            onClick={handleContinue}
            sx={{
              px: 6,
              py: 1.5,
              fontSize: '1.1rem',
              animation: 'fadeIn 0.5s ease'
            }}
          >
            Continue to Opening Hands
          </Button>
        )}
      </Paper>
    </Box>
  );
};

export default DiceRoll;
