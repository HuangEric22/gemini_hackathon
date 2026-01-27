import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,           // Allows using 'describe', 'it', 'expect' without importing
    environment: 'jsdom',    // Simulates a browser (window, document, etc.)
    setupFiles: './src/test/setup.ts', // Runs before every test file
  },
});