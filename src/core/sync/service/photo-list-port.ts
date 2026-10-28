/** Un fichier du dossier cloud du compte, avec ses dates d'écriture données par le serveur. */
export interface CloudPhotoObject {
  name: string
  createdAt: string | null
  updatedAt: string | null
}

/** Liste du dossier cloud du compte, et de lui seul. */
export interface PhotoListPort {
  /** Rend tout le dossier, ou rejette : jamais une liste partielle. */
  list(userId: string): Promise<CloudPhotoObject[]>
}
