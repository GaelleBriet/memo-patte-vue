export type IdTokenNonce = {
  /** Envoyé en clair à Supabase. */
  raw: string
  /** Envoyé à Google, qui l'inscrit dans le jeton. */
  hashed: string
}

const NONCE_BYTES = 32

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createIdTokenNonce(): Promise<IdTokenNonce> {
  const raw = hex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return { raw, hashed: hex(new Uint8Array(digest)) }
}
