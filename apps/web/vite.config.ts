import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento a API roda em outra porta; o proxy faz o navegador
    // enxergar tudo na mesma origem, então o cookie de sessão funciona sem CORS.
    // changeOrigin: false mantém o Host original (localhost:5173), que a API
    // compara com o Origin da requisição como defesa contra CSRF.
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } },
  },
});
