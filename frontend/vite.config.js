import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const api = process.env.VITE_API_URL || env.VITE_API_URL;
  const apiOrigin = api ? new URL(api).origin : '';
  return {
    base: './',
    plugins: [react(), {
      name: 'production-security-policy',
      transformIndexHtml() {
        if (command !== 'build') return [];
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content:
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self' ${apiOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'` }, injectTo: 'head-prepend' }];
      },
    }],
  };
});
