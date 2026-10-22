/** Téléchargement d'une photo du dossier cloud du compte, sous le nom qu'elle a dans le carnet. */
export interface PhotoDownloadPort {
  /** `null` si le dossier du compte n'a pas cette photo ; rejette pour tout autre échec, à réessayer. */
  download(userId: string, fileName: string): Promise<Uint8Array | null>
}

export interface DownloadedPhotoFiles {
  /** Sonde sans lire le fichier. */
  exists(fileName: string): Promise<boolean>
  /** N'est visible sous son nom qu'une fois écrite en entier. */
  write(fileName: string, jpeg: Uint8Array): Promise<void>
}
