import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Os testes compartilham um único banco; rodar arquivos em paralelo os faria se atropelar.
    fileParallelism: false,
  },
});
