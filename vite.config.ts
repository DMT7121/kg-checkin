import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  build: {
    emptyOutDir: true,
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
          if (path.includes('/node_modules/@tensorflow/tfjs-core/')) return 'tfjs-core';
          if (path.includes('/node_modules/face-api.js/')) return 'vision';
          if (path.includes('/node_modules/onnxruntime-web/') || path.includes('/node_modules/@mediapipe/tasks-vision/')) return 'face-v2-biometrics';
          if (path.endsWith('/src/pages/sopData.ts') || path.endsWith('/src/pages/cukcukData.ts')) return 'knowledge-data';
        },
      },
    },
  },
})
