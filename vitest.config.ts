import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@chupa/cloth': fileURLToPath(new URL('./packages/cloth/src/index.ts', import.meta.url)),
      '@chupa/body': fileURLToPath(new URL('./packages/body/src/index.ts', import.meta.url)),
      '@chupa/garment': fileURLToPath(new URL('./packages/garment/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
