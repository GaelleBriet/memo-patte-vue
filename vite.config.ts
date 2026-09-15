import { readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'

function dropWebSqliteWasmFromBuild(): Plugin {
  let outDir = ''
  return {
    name: 'memo-patte:drop-web-sqlite-wasm',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      rmSync(join(outDir, 'assets', 'sql-wasm.wasm'), { force: true })
    },
  }
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

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
    dropWebSqliteWasmFromBuild(),
  ],
  define: {
    // Version release-please : `versionName` d'Android n'est pas tenu à jour.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
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
    // Un build Gradle écrit dans `android/…/build` : sans ça, chaque build recharge
    // la page de l'app en live reload.
    watch: { ignored: ['**/android/**', '**/ios/**'] },
  },
})
