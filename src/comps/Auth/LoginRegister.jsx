// LoginRegister.jsx
// Encapsulates login and registration form logic and UI.
import React, { useState, useContext } from 'react';
import { AuthContext } from '../../AuthContext';
import { Paper, Typography, Stack, Button, TextField, Alert, Box } from '@mui/material';
import { handleLogin, handleRegister } from '../../utils/utils';

export default function LoginRegister({ compact }) {
    const { setIsLoggedIn, setUser, setUserSettings } = useContext(AuthContext);

    // Form state
    const [form, setForm] = useState({ username: '', password: '', confirmPassword: '' });
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const submit = async () => {
        setError('');
        setBusy(true);
        try {
            const data = mode === 'login'
                ? await handleLogin(form.username, form.password)
                : await handleRegister(form.username, form.password, form.confirmPassword);
            setIsLoggedIn(true);
            setUser(data.username);
            if (data.settings) setUserSettings(data.settings);
            setForm({ username: '', password: '', confirmPassword: '' });
        } catch (e) {
            setError(e.message || 'Request failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <Paper variant="outlined" sx={{ width: '100%', maxWidth: 460, p: 3, borderRadius: 1 }}>
                {!compact && (
                    <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                        Welcome to the One Piece TCG Simulator
                    </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mb: 2, justifyContent: 'center' }}>
                    <Button variant={mode === 'login' ? 'contained' : 'text'} onClick={() => setMode('login')}>Sign in</Button>
                    <Button variant={mode === 'register' ? 'contained' : 'text'} onClick={() => setMode('register')}>Create account</Button>
                </Stack>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Stack spacing={2}>
                    <TextField name="username" label="Username" value={form.username} onChange={onChange} autoComplete="username" fullWidth />
                    <TextField name="password" type="password" label="Password" value={form.password} onChange={onChange} autoComplete="current-password" fullWidth />
                    {mode === 'register' && (
                        <TextField name="confirmPassword" type="password" label="Confirm Password" value={form.confirmPassword} onChange={onChange} autoComplete="new-password" fullWidth />
                    )}
                    <Button variant="contained" onClick={submit} disabled={busy || !form.username || !form.password}>
                        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
}
