import { defineConfig } from 'vitest/config';

// Served from https://<user>.github.io/<repo>/, so every asset path is relative.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
