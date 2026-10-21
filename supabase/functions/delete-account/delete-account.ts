import { isIdentityFresh } from './identity-freshness.ts'

/** Une entrée de `storage.list()` : un sous-dossier n'a pas d'`id`. */
export type StorageEntry = { name: string; id: string | null }

export type DeletionOrigin = 'app' | 'email'

export type AccountDeletionPorts = {
  /** `null` quand le jeton ne désigne aucun compte. */
  userIdFromToken(token: string): Promise<string | null>
  /** Entrées directes du dossier, noms sans le dossier. */
  listPhotos(folder: string, limit: number): Promise<StorageEntry[]>
  removePhotos(paths: string[]): Promise<void>
  /** Suppression dure : les lignes du compte partent par `on delete cascade`. */
  deleteUser(userId: string): Promise<void>
  /** Date et origine seulement : rien qui désigne le compte. */
  recordDeletion(origin: DeletionOrigin): Promise<void>
}

export const PHOTO_PAGE_SIZE = 100
export const MAX_FOLDER_DEPTH = 5

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')
  return match?.[1] ?? null
}

async function removeFolder(
  folder: string,
  depth: number,
  ports: AccountDeletionPorts,
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
function removeAllPhotos(userId: string, ports: AccountDeletionPorts): Promise<void> {
  return removeFolder(userId, 0, ports)
}

function errorMessage(cause: unknown): unknown {
  return cause instanceof Error ? cause.message : cause
}

/** Le compte est déjà supprimé : un journal en panne ne doit pas faire croire à un échec. */
async function recordDeletion(origin: DeletionOrigin, ports: AccountDeletionPorts): Promise<void> {
  try {
    await ports.recordDeletion(origin)
  } catch (cause) {
    console.error('Suppression de compte non journalisée :', errorMessage(cause))
  }
}

export async function handleDeleteAccount(
  request: Request,
  ports: AccountDeletionPorts,
): Promise<Response> {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })

  const token = bearerToken(request)
  if (!token) return json(401, { error: 'unauthorized' })

  try {
    const userId = await ports.userIdFromToken(token)
    if (!userId) return json(401, { error: 'unauthorized' })
    if (!isIdentityFresh(token, Date.now())) return json(401, { error: 'identity-expired' })
    await removeAllPhotos(userId, ports)
    await ports.deleteUser(userId)
  } catch (cause) {
    console.error('Suppression de compte en échec :', errorMessage(cause))
    return json(500, { error: 'deletion-failed' })
  }
  await recordDeletion('app', ports)
  return json(200, { status: 'deleted' })
}
