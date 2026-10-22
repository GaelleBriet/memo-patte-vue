/** Une entrée de `storage.list()` : un sous-dossier n'a pas d'`id`. */
export type StorageEntry = { name: string; id: string | null }

export type DeletionOrigin = 'app' | 'email'

/** Efface chez un prestataire ce qui y désigne le compte ; réussit si rien n'y est. */
export type ProviderErasure = (userId: string) => Promise<void>

export const PROVIDER_TIMEOUT_MS = 15_000

export class ErasureNotConfiguredError extends Error {
  constructor(readonly settings: string[]) {
    super(`Réglages absents ou invalides : ${settings.join(', ')}`)
  }
}

export type AccountErasurePorts = {
  /** Entrées directes du dossier, noms sans le dossier. */
  listPhotos(folder: string, limit: number): Promise<StorageEntry[]>
  removePhotos(paths: string[]): Promise<void>
  /** PostHog puis RevenueCat ; un prestataire désactivé n'y figure pas. */
  providerErasures: ProviderErasure[]
  /** Non vide : la suppression du compte est refusée avant tout effacement. */
  invalidProviderSettings: string[]
  /** Suppression dure : les lignes du compte partent par `on delete cascade`. */
  deleteUser(userId: string): Promise<void>
  /** Date et origine seulement : rien qui désigne le compte. */
  recordDeletion(origin: DeletionOrigin): Promise<void>
}

export const PHOTO_PAGE_SIZE = 100
export const MAX_FOLDER_DEPTH = 5

export function errorMessage(cause: unknown): unknown {
  return cause instanceof Error ? cause.message : cause
}

async function removeFolder(
  folder: string,
  depth: number,
  ports: AccountErasurePorts,
): Promise<void> {
  if (depth > MAX_FOLDER_DEPTH) throw new Error('Dossiers de photos trop profonds')
  let previous: string | null = null
  for (;;) {
    const entries = await ports.listPhotos(folder, PHOTO_PAGE_SIZE)
    if (entries.length === 0) return
    const page = entries.map((entry) => entry.name).join('/')
    if (page === previous) throw new Error('Photos toujours présentes après leur effacement')
    previous = page
    for (const entry of entries.filter((entry) => entry.id === null)) {
      await removeFolder(`${folder}/${entry.name}`, depth + 1, ports)
    }
    const files = entries.filter((entry) => entry.id !== null)
    if (files.length > 0) await ports.removePhotos(files.map((file) => `${folder}/${file.name}`))
  }
}

/** Supprimer le compte laisse ses photos dans le stockage : elles partent d'abord. */
export function removeAllPhotos(userId: string, ports: AccountErasurePorts): Promise<void> {
  return removeFolder(userId, 0, ports)
}

/** Le compte est déjà supprimé : un journal en panne ne doit pas faire croire à un échec. */
async function recordDeletion(origin: DeletionOrigin, ports: AccountErasurePorts): Promise<void> {
  try {
    await ports.recordDeletion(origin)
  } catch (cause) {
    console.error('Suppression de compte non journalisée :', errorMessage(cause))
  }
}

/** Le compte part en dernier : tant qu'il existe, un nouvel essai reprend. */
export async function eraseAccount(
  userId: string,
  origin: DeletionOrigin,
  ports: AccountErasurePorts,
): Promise<void> {
  if (ports.invalidProviderSettings.length > 0) {
    throw new ErasureNotConfiguredError(ports.invalidProviderSettings)
  }
  await removeAllPhotos(userId, ports)
  for (const erase of ports.providerErasures) await erase(userId)
  await ports.deleteUser(userId)
  await recordDeletion(origin, ports)
}
