import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const t = 'http://localhost:3100';
export default defineConfig({ plugins: [react()], server: { port: 5300, strictPort: true, proxy: { '/sim': t, '/auth': t, '/me': t, '/game': t } } });
