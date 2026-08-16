import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The relay server (dashboard/server/relay.ts, `pnpm dashboard-server`) runs on 8789 by default —
// see DASHBOARD_SERVER_PORT. This dev server only serves the static frontend; it never talks to
// Helius or the chain directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
