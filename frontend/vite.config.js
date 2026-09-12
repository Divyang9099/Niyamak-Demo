import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const PWA_ICONS = [
  { src: '/icons/pwa-72x72.png',       sizes: '72x72',   type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-96x96.png',       sizes: '96x96',   type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-128x128.png',     sizes: '128x128', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-144x144.png',     sizes: '144x144', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-152x152.png',     sizes: '152x152', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-192x192.png',     sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-384x384.png',     sizes: '384x384', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-512x512.png',     sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/maskable-192x192.png',sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/maskable-512x512.png',sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Strategy: we write our own SW, plugin only injects the precache manifest
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',

      // Auto-registers the SW on page load; update flow is driven by usePWA hook
      registerType: 'prompt',
      injectRegister: 'auto',

      // Assets to include in precache beyond what Vite emits
      includeAssets: [
        'favicon.png', 'favicon.svg', 'apple-touch-icon.png',
        'fonts/**/*', 'icons/*.png', 'offline.html',
      ],

      // ── Web App Manifest ────────────────────────────────────────────────────
      manifest: {
        name: 'Niyamak',
        short_name: 'Niyamak',
        description:
          'Drone Operations Management Platform — plan, schedule, and monitor aerial survey missions across India.',
        id: '/',
        scope: '/',
        start_url: '/?source=pwa',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        lang: 'en',
        dir: 'ltr',
        background_color: '#121317',
        theme_color: '#8b5cf6',
        categories: ['business', 'productivity', 'utilities'],

        icons: PWA_ICONS,

        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'Operations overview and live KPIs',
            url: '/?source=pwa-shortcut',
            icons: [{ src: '/icons/shortcut-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Projects',
            short_name: 'Projects',
            description: 'Manage drone survey projects',
            url: '/projects?source=pwa-shortcut',
            icons: [{ src: '/icons/shortcut-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Pipeline',
            short_name: 'Pipeline',
            description: 'Sales pipeline and leads board',
            url: '/pipeline?source=pwa-shortcut',
            icons: [{ src: '/icons/shortcut-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Calendar',
            short_name: 'Calendar',
            description: 'Schedule and resource calendar',
            url: '/calendar?source=pwa-shortcut',
            icons: [{ src: '/icons/shortcut-96x96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],

        screenshots: [
          // Desktop screenshots improve install dialog on Chrome/Edge.
          // Replace with actual screenshots once available.
          // {
          //   src: '/screenshots/desktop.png',
          //   sizes: '1280x800',
          //   type: 'image/png',
          //   form_factor: 'wide',
          //   label: 'Niyamak Dashboard',
          // },
        ],

        // File handling — register as handler for KML/GeoJSON survey files
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/vnd.google-earth.kml+xml': ['.kml'],
              'application/geo+json': ['.geojson'],
            },
          },
        ],

        // Web Share Target — allow other apps to share files/URLs into Niyamak
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
          },
        },

        // Edge sidebar mode (optional: makes Niyamak work in Edge sidebar)
        edge_side_panel: {
          preferred_width: 400,
        },
      },

      // ── injectManifest options ──────────────────────────────────────────────
      injectManifest: {
        // File types to include in the Workbox precache manifest
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp,json}'],
        // Exclude large auth banner images — they're only shown on login, fetched fresh
        globIgnores: ['**/auth_forgot_side_2.png'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB safety ceiling
      },

      devOptions: {
        enabled: false, // disable in dev — SW interferes with HMR
      },
    }),
  ],

  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) requires manualChunks to be a function
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
            return 'vendor-map';
          }
          if (id.includes('node_modules/@fullcalendar')) {
            return 'vendor-calendar';
          }
        },
      },
    },
  },
});
