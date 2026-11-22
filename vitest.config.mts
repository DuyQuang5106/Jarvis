import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Each DB test holds an in-memory PGlite (a few hundred MB of RSS): one worker per core swaps the machine.
    maxWorkers: 4,
  },
});
