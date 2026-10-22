/** Effacement d'une photo du dossier cloud du compte, sous le nom qu'elle avait dans le carnet. */
export interface PhotoDeletePort {
  /** Résout aussi pour une photo déjà absente du dossier ; rejette pour tout échec, à réessayer. */
  delete(userId: string, fileName: string): Promise<void>
}
