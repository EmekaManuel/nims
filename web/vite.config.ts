import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The game server (npm run server) listens on :3000; the browser only ever talks to Vite.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/sim': 'http://localhost:3000', '/auth': 'http://localhost:3000', '/me': 'http://localhost:3000', '/game': 'http://localhost:3000', '/stats': 'http://localhost:3000', '/chain': 'http://localhost:3000' } },
  test: { setupFiles: ['./src/test/test-setup.ts'] },
});
