export const MIN_ADMIN_SECRET_LENGTH = 32

/** Un secret trop court désactive le mode admin ; la suppression depuis l'app n'en dépend pas. */
export function adminSecretFrom(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.length >= MIN_ADMIN_SECRET_LENGTH) return value
  console.error(
    `Mode admin désactivé : ADMIN_DELETE_SECRET doit faire au moins ${MIN_ADMIN_SECRET_LENGTH} caractères`,
  )
  return undefined
}
