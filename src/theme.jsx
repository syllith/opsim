import { createTheme } from '@mui/material';

export const custom = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#1976d2' },
        background: { default: '#121212', paper: '#1e1e1e' },
    },
    typography: {
        fontFamily: 'Lexend, Open Sans, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif',
    },
});