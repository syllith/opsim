import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        cors: false,
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: 'http://localhost:5583',
                changeOrigin: true,
                secure: false
            },
            '/socket.io': {
                target: 'http://localhost:5583',
                changeOrigin: true,
                secure: false,
                ws: true
            }
        }
    }
})
