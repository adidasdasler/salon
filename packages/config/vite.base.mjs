/**
 * Shared Vite config factory for SALON SPAs (spec §6).
 * React + Tailwind (via postcss) + PWA manifest; dev server proxies /v1 to backend.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export function salonViteConfig(opts) {
  const theme = opts.themeColor ?? '#6d3fe4';
  return defineConfig({
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: opts.name,
          short_name: opts.shortName,
          theme_color: theme,
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallbackDenylist: [/^\/v1\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/v1/'),
              handler: 'NetworkOnly', // never cache API responses
            },
          ],
        },
      }),
    ],
    server: {
      port: opts.port ?? 5173,
      ...(opts.apiProxyTarget
        ? { proxy: { '/v1': { target: opts.apiProxyTarget, changeOrigin: true, ws: true } } }
        : {}),
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  });
}
