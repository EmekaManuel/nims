import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The game server (npm run server, with OJA_DEV=1) listens on :3000; the browser only ever talks to Vite.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/auth': 'http://localhost:3000', '/me': 'http://localhost:3000', '/game': 'http://localhost:3000' } },
});
