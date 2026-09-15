import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

/** Exclu de l'Auto Backup Android (`res/xml/backup_rules.xml`) : aucune photo ailleurs. */
const PHOTOS_DIR = 'photos'

const PHOTO_NAME = /^[\w-]+\.jpg$/

function photoPath(name: string): string {
  if (!PHOTO_NAME.test(name)) throw new Error(`Nom de photo invalide : ${name}`)
  return `${PHOTOS_DIR}/${name}`
}

/** Écrit un JPEG encodé en base64 et renvoie son nom de fichier, à persister tel quel. */
export async function savePhoto(base64Jpeg: string): Promise<string> {
  const name = `${crypto.randomUUID()}.jpg`
  await Filesystem.writeFile({
    path: photoPath(name),
    data: base64Jpeg,
    directory: Directory.Data,
    recursive: true,
  })
  return name
}

export async function deletePhoto(name: string): Promise<void> {
  await Filesystem.deleteFile({ path: photoPath(name), directory: Directory.Data })
}

// Le Filesystem web vit dans IndexedDB : aucune URL ne le sert, il faut relire l'octet.
export async function photoDisplayUrl(name: string): Promise<string> {
  const options = { path: photoPath(name), directory: Directory.Data }

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.getUri(options)
    return Capacitor.convertFileSrc(uri)
  }

  const { data } = await Filesystem.readFile(options)
  return `data:image/jpeg;base64,${String(data)}`
}

export interface PhotoStorage {
  savePhoto: typeof savePhoto
  deletePhoto: typeof deletePhoto
}
