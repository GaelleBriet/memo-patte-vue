import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

import type { ExportFile } from './export-format'

export type DeliveryMode = 'save' | 'share'

export type DeliveryOutcome = 'saved' | 'shared' | 'cancelled'

export const EXPORTS_DIR = 'exports'

const SAVED_EXPORTS_DIR = 'MémoPatte'

/** Message de rejet du plugin Android quand la feuille de partage est fermée. */
const SHARE_CANCELED = /cancel/i

const PERMISSION_DENIED = 'OS-PLUG-FILE-0007'

const DOES_NOT_EXIST = 'OS-PLUG-FILE-0008'

const MAX_COPIES = 100

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function writeFile(path: string, file: ExportFile, directory: Directory) {
  return typeof file.content === 'string'
    ? Filesystem.writeFile({
        path,
        data: file.content,
        directory,
        encoding: Encoding.UTF8,
        recursive: true,
      })
    : Filesystem.writeFile({ path, data: toBase64(file.content), directory, recursive: true })
}

/**
 * Vide le dossier d'exports du cache : avant chaque écriture et au lancement de l'app. Un partage
 * accepté ne peut pas l'effacer lui-même, le destinataire lit l'URI après que l'app a rendu la main.
 */
export async function clearExports(): Promise<void> {
  try {
    // Le pont Capacitor journalise tout rejet natif, même rattrapé : ne pas laisser rmdir échouer.
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache })
    if (!files.some(({ name }) => name === EXPORTS_DIR)) return
    await Filesystem.rmdir({ path: EXPORTS_DIR, directory: Directory.Cache, recursive: true })
  } catch (cause) {
    console.warn('Exports précédents non effacés :', cause)
  }
}

async function share(file: ExportFile, dialogTitle: string): Promise<'shared' | 'cancelled'> {
  await clearExports()
  const { uri } = await writeFile(`${EXPORTS_DIR}/${file.name}`, file, Directory.Cache)
  try {
    await Share.share({ files: [uri], dialogTitle })
    return 'shared'
  } catch (cause) {
    await clearExports()
    if (cause instanceof Error && SHARE_CANCELED.test(cause.message)) return 'cancelled'
    throw cause
  }
}

function numbered(name: string, copy: number): string {
  if (copy === 0) return name
  const dot = name.includes('.') ? name.lastIndexOf('.') : name.length
  return `${name.slice(0, dot)} (${copy})${name.slice(dot)}`
}

function hasCode(cause: unknown, code: string): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === code
}

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Documents })
    return true
  } catch (cause) {
    if (hasCode(cause, DOES_NOT_EXIST)) return false
    throw cause
  }
}

async function freePath(name: string): Promise<string> {
  for (let copy = 0; copy < MAX_COPIES; copy += 1) {
    const path = `${SAVED_EXPORTS_DIR}/${numbered(name, copy)}`
    if (!(await exists(path))) return path
  }
  throw new Error(`Aucun nom libre pour ${name} dans ${SAVED_EXPORTS_DIR}/`)
}

async function writeToDocuments(file: ExportFile): Promise<void> {
  const path = await freePath(file.name)
  try {
    await writeFile(path, file, Directory.Documents)
  } catch (cause) {
    // Sans l'accès, sur Android 10 et moins, effacer rouvrirait la demande d'Android.
    if (!hasCode(cause, PERMISSION_DENIED)) {
      await Filesystem.deleteFile({ path, directory: Directory.Documents }).catch(() => {})
    }
    throw cause
  }
}

function download(file: ExportFile): void {
  const content = typeof file.content === 'string' ? file.content : new Uint8Array(file.content)
  const url = URL.createObjectURL(new Blob([content]))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}

async function save(file: ExportFile): Promise<'saved'> {
  if (Capacitor.isNativePlatform()) await writeToDocuments(file)
  else download(file)
  return 'saved'
}

export function deliverExportFile(
  file: ExportFile,
  mode: DeliveryMode,
  dialogTitle: string,
): Promise<DeliveryOutcome> {
  return mode === 'save' ? save(file) : share(file, dialogTitle)
}
