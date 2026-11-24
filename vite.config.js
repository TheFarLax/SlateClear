import {defineConfig} from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/viem/')) return 'wallet-sdk';
          if (id.includes('/node_modules/genlayer-js/')) return 'genlayer-sdk';
        },
      },
    },
  },
});
