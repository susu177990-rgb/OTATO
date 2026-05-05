import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  server: {
    port: 4000,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
});
