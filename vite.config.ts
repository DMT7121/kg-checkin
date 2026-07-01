import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (
            path.includes('/node_modules/react/') ||
            path.includes('/node_modules/react-dom/') ||
            path.includes('/node_modules/scheduler/')
          ) return 'react';
          if (
            path.includes('/node_modules/framer-motion/') ||
            path.includes('/node_modules/motion-dom/') ||
            path.includes('/node_modules/motion-utils/')
          ) return 'motion';
          if (path.includes('/node_modules/lucide-react/')) return 'icons';
          if (path.includes('/node_modules/sweetalert2/')) return 'alerts';
          if (path.includes('/node_modules/canvas-confetti/')) return 'confetti';
          if (path.includes('/node_modules/face-api.js/')) return 'vision';
        },
      },
    },
  },
})
