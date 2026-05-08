import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API + healthcheck routes to the Fastify server during dev so the
    // browser sees a single origin. Production uses the single-image deploy
    // where the Fastify process serves the client static files directly.
    proxy: {
      '/todos': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
});
