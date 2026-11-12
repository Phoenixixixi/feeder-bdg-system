import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 68 << 16,
        safari: 12 << 16,
        edge: 79 << 16,
        firefox: 68 << 16,
      },
    },
  },
  build: {
    cssMinify: 'lightningcss',
    cssTarget: 'chrome68',
    target: ['es2015', 'chrome68'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
});
