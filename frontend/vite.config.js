import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['sqlchat.skdevlogs.com'],
    proxy: {
      // Proxy /api calls to backend so no CORS issues in dev
      '/api': 'http://localhost:3005',
    },
  },
});
