import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

import type { ExportFile } from './export-format'

export type DeliveryOutcome = 'shared' | 'cancelled'

const EXPORTS_DIR = 'exports'

/** Message de rejet du plugin Android quand la feuille de partage est fermée. */
const SHARE_CANCELED = /cancel/i

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

async function clearExports(): Promise<void> {
  await Filesystem.rmdir({ path: EXPORTS_DIR, directory: Directory.Cache, recursive: true }).catch(
    () => undefined,
  )
}

async function writeToCache(file: ExportFile): Promise<string> {
  await clearExports()
  const path = `${EXPORTS_DIR}/${file.name}`
  const { uri } =
    typeof file.content === 'string'
      ? await Filesystem.writeFile({
          path,
          data: file.content,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        })
      : await Filesystem.writeFile({
          path,
          data: toBase64(file.content),
          directory: Directory.Cache,
          recursive: true,
        })
  return uri
}

export async function deliverExportFile(
  file: ExportFile,
  dialogTitle: string,
): Promise<DeliveryOutcome> {
  const uri = await writeToCache(file)
  try {
    await Share.share({ files: [uri], dialogTitle })
    return 'shared'
  } catch (cause) {
    if (cause instanceof Error && SHARE_CANCELED.test(cause.message)) return 'cancelled'
    throw cause
  } finally {
    await clearExports()
  }
}
