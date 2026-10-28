/** Une photo pèse au plus 2 Mio : environ 40 s sur une connexion lente de 50 Ko/s. */
export const PHOTO_TRANSFER_TIMEOUT_MS = 60_000
export const PHOTO_DELETE_TIMEOUT_MS = 30_000
export const PHOTO_LIST_TIMEOUT_MS = 30_000

/** Requête Storage restée sans réponse : à réessayer au cycle suivant, jamais un refus. */
export class StorageTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Requête Storage sans réponse après ${timeoutMs / 1000} s.`)
    this.name = 'StorageTimeoutError'
  }
}

export async function withStorageTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new StorageTimeoutError(timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([request, timeout])
  } finally {
    clearTimeout(timer)
  }
}
