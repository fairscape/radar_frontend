import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_DEV_PORT and VITE_DEV_BACKEND override the defaults below.
// `loadEnv` rather than `process.env`: no @types/node in this project.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const backend = env.VITE_DEV_BACKEND || 'http://localhost:8000';
  const port = Number(env.VITE_DEV_PORT) || 5173;

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': {
          target: backend,
          timeout: 600000,
        },
      },
    },
  };
});
