import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // caminhos relativos: o build funciona em qualquer hospedagem estática (Netlify, GitHub Pages em /repo/)
  base: './',
  server: { port: 5173 },
  test: { environment: 'node' },
} as any);
