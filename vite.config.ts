import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '');

  // ── APK / production build guard ──────────────────────────────────────────
  // A `vite build` (command === 'build') bakes VITE_API_URL into the bundle at
  // build time. If it is missing or points at localhost, the resulting APK /
  // Vercel bundle cannot reach the Render backend. Fail loudly so we never ship
  // an accidental localhost build. Dev (`vite`/`tsx server.ts`) is unaffected.
  if (command === 'build') {
    const apiUrl = env.VITE_API_URL?.trim();
    const isLocal = !apiUrl || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(apiUrl);
    const allowLocal = env.ALLOW_LOCAL_API_BUILD === 'true';
    if (isLocal && !allowLocal) {
      throw new Error(
        '\n\n🛑 Build aborted: VITE_API_URL must point to the production backend.\n' +
        `   Current value: ${apiUrl || '(unset)'}\n` +
        '   Expected:      https://nexuscapitalearnings.onrender.com\n\n' +
        '   Fix: set VITE_API_URL in your .env before `npm run build` / APK build.\n' +
        '   (To intentionally build against localhost, set ALLOW_LOCAL_API_BUILD=true.)\n'
      );
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: 'Nexus Capital',
          short_name: 'NexusCapital',
          description: 'Professional Investment Platform — Earn Daily ROI',
          theme_color: '#00e6a0',
          background_color: '#070b14',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
            { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
            { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
            { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
            { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
            { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
            { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          categories: ['finance', 'business'],
          screenshots: [],
        },
        workbox: {
          // Pre-cache the app shell
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Never cache API calls — always go to network
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/nexuscapitalearnings\.onrender\.com\/api\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'api-cache' },
            },
          ],
          // Clean old caches on update
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: false, // don't activate SW in dev mode
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // Ensure Capacitor can find the built output
    build: {
      outDir: 'dist',
    },
  };
});
