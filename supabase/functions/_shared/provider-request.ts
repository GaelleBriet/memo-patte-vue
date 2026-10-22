const PROVIDER_TIMEOUT_MS = 15_000

/** Le message d'origine d'un échec réseau peut contenir la clé ou l'identifiant : il n'est pas repris. */
export async function sendTo(
  provider: string,
  send: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await send(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
  } catch {
    throw new Error(`${provider} injoignable`)
  }
}
