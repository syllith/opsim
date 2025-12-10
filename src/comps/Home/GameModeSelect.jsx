// GameModeSelect.jsx - Game mode selection component
import React from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    Stack,
    Chip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import ComputerIcon from '@mui/icons-material/Computer';

const GAME_MODES = [
    {
        id: 'self-vs-self',
        name: 'Self VS Self',
        description: 'Practice mode - control both sides of the board to test decks and strategies.',
        icon: PersonIcon,
        available: true,
    },
    {
        id: 'vs-ai',
        name: 'VS AI',
        description: 'Play against a computer opponent.',
        icon: ComputerIcon,
        available: false,
        comingSoon: true,
    },
    {
        id: 'multiplayer',
        name: 'Multiplayer',
        description: 'Play against another player online in real-time.',
        icon: GroupIcon,
        available: true,
    },
];

export default function GameModeSelect({ onSelectMode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                py: 4,
            }}
        >
            <Typography
                variant="h4"
                gutterBottom
                sx={{ mb: 1, fontWeight: 700 }}
            >
                Select Game Mode
            </Typography>
            <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 4 }}
            >
                Choose how you want to play
            </Typography>

            <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={3}
                sx={{ maxWidth: 900 }}
            >
                {GAME_MODES.map((mode) => {
                    const IconComponent = mode.icon;
                    return (
                        <Paper
                            key={mode.id}
                            elevation={mode.available ? 4 : 1}
                            sx={{
                                p: 3,
                                width: { xs: '100%', md: 260 },
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                                cursor: mode.available ? 'pointer' : 'default',
                                opacity: mode.available ? 1 : 0.6,
                                transition: 'all 0.2s ease-in-out',
                                border: '2px solid',
                                borderColor: mode.available ? 'primary.main' : 'divider',
                                '&:hover': mode.available
                                    ? {
                                          transform: 'translateY(-4px)',
                                          boxShadow: 8,
                                          borderColor: 'primary.light',
                                      }
                                    : {},
                            }}
                            onClick={() => mode.available && onSelectMode(mode.id)}
                        >
                            <Box
                                sx={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: '50%',
                                    bgcolor: mode.available ? 'primary.main' : 'action.disabled',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    mb: 2,
                                }}
                            >
                                <IconComponent
                                    sx={{
                                        fontSize: 32,
                                        color: 'white',
                                    }}
                                />
                            </Box>

                            <Typography
                                variant="h6"
                                sx={{ mb: 1, fontWeight: 600 }}
                            >
                                {mode.name}
                            </Typography>

                            {mode.comingSoon && (
                                <Chip
                                    label="Coming Soon"
                                    size="small"
                                    color="secondary"
                                    sx={{ mb: 1 }}
                                />
                            )}

                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mb: 2, minHeight: 40 }}
                            >
                                {mode.description}
                            </Typography>

                            <Button
                                variant={mode.available ? 'contained' : 'outlined'}
                                disabled={!mode.available}
                                fullWidth
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (mode.available) {
                                        onSelectMode(mode.id);
                                    }
                                }}
                            >
                                {mode.available ? 'Play' : 'Unavailable'}
                            </Button>
                        </Paper>
                    );
                })}
            </Stack>
        </Box>
    );
}
