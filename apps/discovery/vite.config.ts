import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Desktop-only patron-discovery SPA. Base is relative so the built
// bundle can be dropped into out/ or any static host without rewrites.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180, open: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
