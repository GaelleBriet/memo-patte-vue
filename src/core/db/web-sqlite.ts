import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'

const JEEP_SQLITE = 'jeep-sqlite'

/** Outil de prévisualisation `pnpm dev` : sans effet ailleurs que sur la plateforme `web`. */
export async function prepareWebSqlite(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return

  const { defineCustomElements } = await import('jeep-sqlite/loader')
  await defineCustomElements(window)
  if (!customElements.get(JEEP_SQLITE)) {
    throw new Error('SQLite web indisponible : jeep-sqlite non chargé')
  }

  if (!document.querySelector(JEEP_SQLITE)) {
    const element = document.createElement(JEEP_SQLITE)
    element.autoSave = true
    document.body.append(element)
  }
  await CapacitorSQLite.initWebStore()
}
