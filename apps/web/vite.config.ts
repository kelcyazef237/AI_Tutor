import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // Reachable on the WLAN (http://<your-lan-ip>:5173). The /api proxy keeps
    // everything same-origin, so no CORS setup is needed for dev on the LAN.
    host: true,
    allowedHosts: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
