import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cast process to any to avoid type error about 'cwd' missing on type 'Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // CRITICAL FIX: Define 'process.env' object to prevent browser crash
      'process.env': {
         API_KEY: env.API_KEY || process.env.API_KEY || ''
      },
      // Also define the specific key replacement just in case
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || '')
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});