/**
 * Lobby.jsx
 * 
 * Multiplayer lobby component for creating and joining game lobbies.
 * Shows available lobbies, waiting room UI, and deck selection.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    Stack,
    TextField,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Chip,
    Divider,
    CircularProgress,
    Alert,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

export default function Lobby({
    multiplayer,
    onBack,
    onGameStart,
    userDecks = [],
    selectedDeck,
    onSelectDeck
}) {
    const {
        connected,
        connectionError,
        lobbies,
        currentLobby,
        playerRole,
        isHost,
        opponentInfo,
        opponentLeft,
        createLobby,
        joinLobby,
        leaveLobby,
        setReady,
        refreshLobbies,
        updateDeck
    } = multiplayer;

    const [lobbyName, setLobbyName] = useState('');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Get current player info from lobby
    const currentPlayer = currentLobby?.players?.find(p => p.role === playerRole);

    // Handle deck selection change
    const handleDeckChange = useCallback((event) => {
        const deckName = event.target.value;
        onSelectDeck(deckName);
        if (currentLobby) {
            const deck = userDecks.find(d => d.name === deckName);
            updateDeck(deck || null);
        }
    }, [onSelectDeck, currentLobby, userDecks, updateDeck]);

    // Handle ready status toggle
    const handleReadyToggle = useCallback(() => {
        const newReady = !isReady;
        setIsReady(newReady);
        setReady(newReady);
    }, [isReady, setReady]);

    // Handle create lobby
    const handleCreateLobby = useCallback(() => {
        const deck = userDecks.find(d => d.name === selectedDeck);
        createLobby(lobbyName || null, deck || null);
        setCreateDialogOpen(false);
        setLobbyName('');
    }, [createLobby, lobbyName, selectedDeck, userDecks]);

    // Handle join lobby
    const handleJoinLobby = useCallback((lobbyId) => {
        const deck = userDecks.find(d => d.name === selectedDeck);
        joinLobby(lobbyId, deck || null);
    }, [joinLobby, selectedDeck, userDecks]);

    // Handle leave lobby
    const handleLeaveLobby = useCallback(() => {
        setIsReady(false);
        leaveLobby();
    }, [leaveLobby]);

    // Reset ready state when leaving lobby
    useEffect(() => {
        if (!currentLobby) {
            setIsReady(false);
        }
    }, [currentLobby]);

    // Derived: are both players present and marked ready?
    const bothReady = currentLobby && currentLobby.players.length === 2 &&
                      currentLobby.players.every(p => p.ready);

    // Safety-net: if both players are ready, call parent's onGameStart callback
    // so the parent can transition into the game even if a socket event was missed.
    useEffect(() => {
        if (bothReady && typeof onGameStart === 'function') {
            onGameStart();
        }
    }, [bothReady, onGameStart]);

    // If in a lobby, show the waiting room
    if (currentLobby) {

        return (
            <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
                <Paper elevation={3} sx={{ p: 3 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                        <IconButton onClick={handleLeaveLobby}>
                            <ArrowBackIcon />
                        </IconButton>
                        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
                            {currentLobby.name}
                        </Typography>
                        <Chip
                            label={`ID: ${currentLobby.id}`}
                            size="small"
                            variant="outlined"
                        />
                    </Stack>

                    {opponentLeft && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Your opponent has left the lobby.
                        </Alert>
                    )}

                    <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
                        Players ({currentLobby.players.length}/2)
                    </Typography>

                    <List>
                        {/* Host player (always first) */}
                        {currentLobby.players.map((player) => (
                            <ListItem
                                key={player.socketId}
                                sx={{
                                    bgcolor: player.role === playerRole ? 'action.selected' : 'transparent',
                                    borderRadius: 1,
                                    mb: 1
                                }}
                            >
                                <PersonIcon sx={{ mr: 2, color: 'primary.main' }} />
                                <ListItemText
                                    primary={
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <span>{player.username}</span>
                                            {player.socketId === currentLobby.hostId && (
                                                <Chip label="Host" size="small" color="primary" />
                                            )}
                                            {player.role === playerRole && (
                                                <Chip label="You" size="small" color="info" />
                                            )}
                                        </Stack>
                                    }
                                    secondary={
                                        player.deckConfig?.name
                                            ? `Deck: ${player.deckConfig.name}`
                                            : 'No deck selected'
                                    }
                                />
                                <ListItemSecondaryAction>
                                    {player.ready ? (
                                        <CheckCircleIcon color="success" />
                                    ) : (
                                        <RadioButtonUncheckedIcon color="disabled" />
                                    )}
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}

                        {/* Empty slot */}
                        {currentLobby.players.length < 2 && (
                            <ListItem sx={{ opacity: 0.5 }}>
                                <PersonIcon sx={{ mr: 2, color: 'text.disabled' }} />
                                <ListItemText
                                    primary="Waiting for opponent..."
                                    secondary="Share the lobby ID to invite a friend"
                                />
                            </ListItem>
                        )}
                    </List>

                    <Divider sx={{ my: 2 }} />

                    {/* Deck selection */}
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Your Deck</InputLabel>
                        <Select
                            value={selectedDeck || ''}
                            label="Your Deck"
                            onChange={handleDeckChange}
                            disabled={isReady}
                        >
                            <MenuItem value="">
                                <em>Demo Deck</em>
                            </MenuItem>
                            {userDecks.map((deck) => (
                                <MenuItem key={deck.name} value={deck.name}>
                                    {deck.name} ({deck.size || 50} cards)
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Ready button */}
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant={isReady ? 'outlined' : 'contained'}
                            color={isReady ? 'warning' : 'primary'}
                            fullWidth
                            onClick={handleReadyToggle}
                            disabled={currentLobby.players.length < 2}
                        >
                            {isReady ? 'Cancel Ready' : 'Ready'}
                        </Button>
                    </Stack>

                    {currentLobby.players.length < 2 && (
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 2, textAlign: 'center' }}
                        >
                            Waiting for another player to join...
                        </Typography>
                    )}

                    {bothReady && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            Both players ready! Game starting...
                        </Alert>
                    )}
                </Paper>
            </Box>
        );
    }

    // Show lobby browser
    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', py: 4 }}>
            {/* Header */}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <IconButton onClick={onBack}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 700 }}>
                    Multiplayer Lobbies
                </Typography>
                <IconButton onClick={refreshLobbies} disabled={!connected}>
                    <RefreshIcon />
                </IconButton>
            </Stack>

            {/* Connection status */}
            {!connected && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {connectionError || 'Connecting to game server...'}
                    {!connectionError && <CircularProgress size={16} sx={{ ml: 1 }} />}
                </Alert>
            )}

            {/* Deck selection (before joining) */}
            <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Select Your Deck
                </Typography>
                <FormControl fullWidth size="small">
                    <InputLabel>Deck</InputLabel>
                    <Select
                        value={selectedDeck || ''}
                        label="Deck"
                        onChange={handleDeckChange}
                    >
                        <MenuItem value="">
                            <em>Demo Deck</em>
                        </MenuItem>
                        {userDecks.map((deck) => (
                            <MenuItem key={deck.name} value={deck.name}>
                                {deck.name} ({deck.size || 50} cards)
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Paper>

            {/* Action buttons */}
            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setCreateDialogOpen(true)}
                    disabled={!connected}
                >
                    Create Lobby
                </Button>
            </Stack>

            {/* Lobby list */}
            <Paper elevation={3}>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6">
                        Available Lobbies ({lobbies.filter(l => l.status === 'waiting').length})
                    </Typography>
                </Box>

                {lobbies.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">
                            No lobbies available. Create one to get started!
                        </Typography>
                    </Box>
                ) : (
                    <List>
                        {lobbies.map((lobby) => (
                            <ListItem
                                key={lobby.id}
                                divider
                                sx={{
                                    opacity: lobby.status !== 'waiting' ? 0.6 : 1
                                }}
                            >
                                <ListItemText
                                    primary={
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <span>{lobby.name}</span>
                                            <Chip
                                                label={lobby.status}
                                                size="small"
                                                color={
                                                    lobby.status === 'waiting'
                                                        ? 'success'
                                                        : lobby.status === 'playing'
                                                        ? 'warning'
                                                        : 'default'
                                                }
                                            />
                                        </Stack>
                                    }
                                    secondary={`Host: ${lobby.hostName} • ${lobby.playerCount}/${lobby.maxPlayers} players`}
                                />
                                <ListItemSecondaryAction>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => handleJoinLobby(lobby.id)}
                                        disabled={!connected || lobby.status !== 'waiting' || lobby.playerCount >= 2}
                                    >
                                        Join
                                    </Button>
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>

            {/* Create lobby dialog */}
            <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
                <DialogTitle>Create New Lobby</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Lobby Name (optional)"
                        fullWidth
                        variant="outlined"
                        value={lobbyName}
                        onChange={(e) => setLobbyName(e.target.value)}
                        placeholder="My Awesome Lobby"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateLobby} variant="contained">
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
