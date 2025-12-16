import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress, Typography } from '@mui/material';
import { custom } from './theme';
import { AuthProvider } from './AuthContext';
import Home from './comps/Home/Home';
import engine from './engine/index.js';

function App() {
    const [engineReady, setEngineReady] = useState(false);
    const [engineError, setEngineError] = useState(null);

    // Load engine card data at startup
    useEffect(() => {
        (async () => {
            try {
                await engine.loadCardData();
                console.log('[App] Engine card data loaded');
                setEngineReady(true);
            } catch (e) {
                console.warn('[App] Failed to load engine card data:', e);
                setEngineError(e);
                // Still allow app to run with fallback card data
                setEngineReady(true);
            }
        })();
    }, []);

    // Show loading state while engine initializes
    if (!engineReady) {
        return (
            <ThemeProvider theme={custom}>
                <CssBaseline />
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100vh',
                        gap: 2
                    }}
                >
                    <CircularProgress />
                    <Typography variant="body1" color="text.secondary">
                        Loading game engine...
                    </Typography>
                </Box>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider theme={custom}>
            <CssBaseline />
            <AuthProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Home />} />
                    </Routes>
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
