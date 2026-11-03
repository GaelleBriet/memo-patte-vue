const USER_DATA_PATHS = ['/rest/v1/', '/storage/v1/']

/** À réessayer comme une coupure du réseau, jamais à prendre pour un compte sans données. */
export class NoUserSessionError extends Error {
  /** Code d'annulation : postgrest-js ne retente pas la requête elle-même. */
  readonly code = 'ABORT_ERR'

  constructor() {
    super('Requête Supabase sans session d’utilisateur.')
    this.name = 'NoUserSessionError'
  }
}

/** Sans session, supabase-js envoie la clé publique comme jeton et la RLS ne montre aucune ligne. */
export function requireUserSession(baseFetch: typeof fetch): typeof fetch {
  return (input, init) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input)
    if (!USER_DATA_PATHS.some((path) => pathname.startsWith(path))) return baseFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
    const authorization = headers.get('Authorization')
    if (authorization === null || authorization === `Bearer ${headers.get('apikey')}`) {
      return Promise.reject(new NoUserSessionError())
    }
    return baseFetch(input, init)
  }
}
