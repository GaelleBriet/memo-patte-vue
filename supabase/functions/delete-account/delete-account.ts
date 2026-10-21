export type AccountDeletionPorts = {
  /** `null` quand le jeton ne désigne aucun compte. */
  userIdFromToken(token: string): Promise<string | null>
  /** Noms des objets du dossier, sans le dossier. */
  listPhotos(folder: string, limit: number): Promise<string[]>
  removePhotos(paths: string[]): Promise<void>
  /** Suppression dure : les lignes du compte partent par `on delete cascade`. */
  deleteUser(userId: string): Promise<void>
}

export const PHOTO_PAGE_SIZE = 100

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

/** Supprimer le compte laisse ses photos dans le stockage : elles partent d'abord. */
async function removeAllPhotos(userId: string, ports: AccountDeletionPorts): Promise<void> {
  let previous: string | null = null
  for (;;) {
    const names = await ports.listPhotos(userId, PHOTO_PAGE_SIZE)
    if (names.length === 0) return
    const page = names.join('/')
    if (page === previous) throw new Error('Photos toujours présentes après leur effacement')
    previous = page
    await ports.removePhotos(names.map((name) => `${userId}/${name}`))
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
    await removeAllPhotos(userId, ports)
    await ports.deleteUser(userId)
  } catch (cause) {
    console.error(
      'Suppression de compte en échec :',
      cause instanceof Error ? cause.message : cause,
    )
    return json(500, { error: 'deletion-failed' })
  }
  return json(200, { status: 'deleted' })
}
