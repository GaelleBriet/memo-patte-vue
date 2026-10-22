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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary)
}

const PARTIAL_SUFFIX = '.part'

/** Écrit sous un nom provisoire puis renomme : une coupure ne laisse jamais une photo tronquée. */
export async function writeDownloadedPhoto(name: string, jpeg: Uint8Array): Promise<void> {
  const path = photoPath(name)
  const partial = `${path}${PARTIAL_SUFFIX}`
  try {
    await Filesystem.writeFile({
      path: partial,
      data: bytesToBase64(jpeg),
      directory: Directory.Data,
      recursive: true,
    })
    await Filesystem.rename({
      from: partial,
      to: path,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    })
  } catch (cause) {
    await Filesystem.deleteFile({ path: partial, directory: Directory.Data }).catch(() => {})
    throw cause
  }
}

/** Les téléchargements interrompus, sous le nom de leur photo. */
export async function listPartialPhotos(): Promise<StoredPhoto[]> {
  if (!(await photosDirExists())) return []

  const { files } = await Filesystem.readdir({ path: PHOTOS_DIR, directory: Directory.Data })
  return files
    .filter(({ name, type }) => type === 'file' && name.endsWith(PARTIAL_SUFFIX))
    .map(({ name, mtime }) => ({ name: name.slice(0, -PARTIAL_SUFFIX.length), modifiedAt: mtime }))
    .filter(({ name }) => isPhotoFileName(name))
}

export async function deletePartialPhoto(name: string): Promise<void> {
  await Filesystem.deleteFile({
    path: `${photoPath(name)}${PARTIAL_SUFFIX}`,
    directory: Directory.Data,
  })
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

export type LocalPhoto =
  { kind: 'absent' } | { kind: 'too-large' } | { kind: 'found'; bytes: Uint8Array }

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Taille prise par `stat` : un fichier trop lourd n'est jamais lu. Rejette si un fichier présent ne se lit pas. */
export async function readPhoto(name: string, maxBytes: number): Promise<LocalPhoto> {
  if (!isPhotoFileName(name)) return { kind: 'absent' }
  const options = { path: photoPath(name), directory: Directory.Data }

  let size: number
  try {
    ;({ size } = await Filesystem.stat(options))
  } catch {
    return { kind: 'absent' }
  }
  if (size > maxBytes) return { kind: 'too-large' }

  const { data } = await Filesystem.readFile(options)
  const bytes =
    typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer())
  return { kind: 'found', bytes }
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
