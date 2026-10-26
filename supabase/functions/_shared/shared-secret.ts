export const MIN_SHARED_SECRET_LENGTH = 32

/** Un secret trop court compte comme absent ; le message nomme la variable, jamais sa valeur. */
export function longEnoughSecret(
  value: string | undefined,
  name: string,
  refusal: string,
): string | undefined {
  if (!value) return undefined
  if (value.length >= MIN_SHARED_SECRET_LENGTH) return value
  console.error(`${refusal} : ${name} doit faire au moins ${MIN_SHARED_SECRET_LENGTH} caractères`)
  return undefined
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

/** Deux empreintes de même taille, comparées octet par octet sans s'arrêter au premier écart. */
export async function isSharedSecret(
  given: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false
  const [actual, wanted] = await Promise.all([digest(given), digest(expected)])
  let difference = 0
  for (let index = 0; index < wanted.length; index++) {
    difference |= (actual[index] ?? 0) ^ (wanted[index] ?? 0)
  }
  return difference === 0
}
