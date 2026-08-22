import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The API runs as a separate service in production, but proxying it here
    // keeps local development same-origin so CORS and the Enable Banking
    // redirect URL both behave exactly as they do when deployed.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_URL ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
