import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'assets/js/face-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/face-liveness.jsx',
      name: 'AttendanceFaceLiveness',
      formats: ['iife'],
      fileName: 'face-liveness'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
