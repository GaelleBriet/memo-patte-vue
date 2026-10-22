import type { LocalPhoto } from '@/core/photos/photo-storage'

/** Un refus que le serveur rendra à l'identique tant que le fichier ne change pas. */
export class PhotoUploadRefusal extends Error {
  constructor(readonly reason: string) {
    super(`Photo refusée par le serveur : ${reason}`)
    this.name = 'PhotoUploadRefusal'
  }
}

/** Envoi d'une photo dans le dossier cloud du compte, sous le nom qu'elle a sur le téléphone. */
export interface PhotoUploadPort {
  /**
   * Remplace l'objet s'il existe déjà : un renvoi après une coupure ne casse rien. Rejette par un
   * `PhotoUploadRefusal` pour un refus définitif ; toute autre erreur se réessaie au cycle suivant.
   */
  upload(userId: string, fileName: string, jpeg: Uint8Array): Promise<void>
}

export interface LocalPhotoFiles {
  /** Un fichier plus lourd que `maxBytes` n'est pas lu. */
  read(fileName: string, maxBytes: number): Promise<LocalPhoto>
  /** Sonde sans lire le fichier. */
  exists(fileName: string): Promise<boolean>
}
