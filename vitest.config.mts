import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.tsx'],
  },
});
