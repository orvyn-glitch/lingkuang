import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                       // Electron file:// 兼容
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
