import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

/** Exclu de l'Auto Backup Android (`res/xml/backup_rules.xml`) : aucune photo ailleurs. */
const PHOTOS_DIR = 'photos'

const PHOTO_NAME = /^[\w-]+\.jpg$/

/** Un nom de fichier seul, sans chemin : celui que `savePhoto` rend. */
export function isPhotoFileName(name: string): boolean {
  return PHOTO_NAME.test(name)
}

function photoPath(name: string): string {
  if (!isPhotoFileName(name)) throw new Error(`Nom de photo invalide : ${name}`)
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

/** Sans effet quand le dossier n'existe pas : aucune photo n'a encore été enregistrée. */
export async function deleteAllPhotos(): Promise<void> {
  if (!(await photosDirExists())) return
  await Filesystem.rmdir({ path: PHOTOS_DIR, directory: Directory.Data, recursive: true })
}

// Le pont Capacitor journalise tout rejet natif, même rattrapé : ne pas toucher un dossier absent.
async function photosDirExists(): Promise<boolean> {
  const root = await Filesystem.readdir({ path: '', directory: Directory.Data })
  return root.files.some(({ name, type }) => name === PHOTOS_DIR && type === 'directory')
}

/** `modifiedAt` en millisecondes depuis l'époque Unix. */
export interface StoredPhoto {
  name: string
  modifiedAt: number
}

/** Les seules photos de l'app : tout autre fichier du dossier est ignoré. */
export async function listPhotos(): Promise<StoredPhoto[]> {
  if (!(await photosDirExists())) return []

  const { files } = await Filesystem.readdir({ path: PHOTOS_DIR, directory: Directory.Data })
  return files
    .filter(({ name, type }) => type === 'file' && isPhotoFileName(name))
    .map(({ name, mtime }) => ({ name, modifiedAt: mtime }))
}

/** Sonde par `stat` seul : l'import vérifie tout un carnet sans lire une seule image. */
export async function photoExists(name: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path: photoPath(name), directory: Directory.Data })
    return true
  } catch {
    return false
  }
}

/** Rejette si le fichier manque, par exemple après une restauration Auto Backup qui exclut les photos. */
export async function photoDisplayUrl(name: string): Promise<string> {
  const options = { path: photoPath(name), directory: Directory.Data }

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.stat(options)
    return Capacitor.convertFileSrc(uri)
  }

  const { data } = await Filesystem.readFile(options)
  return `data:image/jpeg;base64,${String(data)}`
}

/** Toujours en base64, y compris natif : jsPDF ne sait pas dessiner une URI capacitor://. */
export async function photoBase64DataUrl(name: string): Promise<string> {
  const { data } = await Filesystem.readFile({ path: photoPath(name), directory: Directory.Data })
  return `data:image/jpeg;base64,${String(data)}`
}

export interface PhotoStorage {
  savePhoto: typeof savePhoto
  deletePhoto: typeof deletePhoto
}
