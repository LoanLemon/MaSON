import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // FORCE Vitest to treat your exact file name as a test file
    include: ['tests/test.ts'],
  },
});