import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "Volailles de l'Est — Point Journalier",
        short_name: 'VDE',
        description: "Saisie du point journalier et pilotage des fermes avicoles",
        theme_color: '#1E5A38',
        background_color: '#EDEAE0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Mise en cache de l'app shell — tolère les coupures réseau sur le
        // terrain (cf. cahier des charges technique, section 6).
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
