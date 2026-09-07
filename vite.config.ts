import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Épinglé pour le live reload Android (`pnpm dev:mobile`) : `adb reverse`
    // se connecte en IPv4 sur 127.0.0.1, et Node 26 fait résoudre `localhost`
    // en IPv6 d'abord ; strictPort évite que Vite glisse sur 5174 en silence.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
