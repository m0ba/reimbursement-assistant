import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '报销助手',
        short_name: '报销助手',
        description: '发票拼版、发票信息表与轨迹图，全部在本机处理',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }: any) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 2 },
          },
        ],
      },
    }),
  ],
  server: { port: 4173, host: true },
  preview: { port: 4173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
  worker: { format: 'es' },
});
