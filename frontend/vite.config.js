import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // lucide-react expose chaque icône comme son propre module — sans
          // ce regroupement, Rollup les scinde chacune en un mini-fichier
          // séparé (15-20 fichiers de 0,1 à 0,4 Ko) dès qu'une icône est
          // utilisée par plusieurs pages chargées en lazy. Chaque petit
          // fichier est une requête réseau de plus à chaque changement de
          // page — pénalisant sur une connexion mobile en zone rurale (cf.
          // conversation du 05/08/2026 avec Serge : "lenteur au chargement
          // de l'application"). Un seul paquet d'icônes = une seule requête,
          // mise en cache une fois pour toutes par le service worker.
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' plutôt que 'autoUpdate' : un rechargement silencieux et
      // automatique pourrait interrompre une saisie en cours (ex: un
      // formulaire hors-ligne pas encore envoyé) — on affiche un bandeau
      // et c'est l'utilisateur qui choisit le moment de recharger (cf.
      // App.jsx, MiseAJourDisponible, et conversation du 05/08/2026 avec
      // Serge — l'app de Jeannot gardait une version obsolète en cache
      // tant qu'elle n'était pas complètement fermée puis rouverte).
      registerType: 'prompt',
      devOptions: {
        // Active le service worker sous `npm run dev` pour pouvoir tester
        // le mode hors-ligne sans build de prod.
        enabled: true,
        type: 'module',
      },
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
        runtimeCaching: [
          {
            // Réponses GET de l'API (fermes, bandes, stock...) mises en cache
            // pour rester consultables hors-ligne ; les écritures (POST/PATCH)
            // ne sont jamais mises en cache ici, elles passent par la file
            // d'attente IndexedDB (cf. src/offline/).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vde-api-cache',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
