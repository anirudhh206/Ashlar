import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The relay server (dashboard/server/relay.ts, `pnpm dashboard-server`) runs on 8789 by default —
// see DASHBOARD_SERVER_PORT. This dev server only serves the static frontend; it never talks to
// Helius or the chain directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
