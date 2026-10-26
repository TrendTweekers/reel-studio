import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const target = 'http://localhost:8787';

export default defineConfig({
  root: here,
  base: '/',
  plugins: [react()],
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    fs: { allow: [repo] },
    proxy: {
      '/api': target,
      '/media': target,
      '/board': target,
      '/sfx': target,
      '/music': target,
    },
  },
});
