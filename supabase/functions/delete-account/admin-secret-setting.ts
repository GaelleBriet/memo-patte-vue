import { longEnoughSecret, MIN_SHARED_SECRET_LENGTH } from '../_shared/shared-secret.ts'

export const MIN_ADMIN_SECRET_LENGTH = MIN_SHARED_SECRET_LENGTH

/** Un secret trop court désactive le mode admin ; la suppression depuis l'app n'en dépend pas. */
export function adminSecretFrom(value: string | undefined): string | undefined {
  return longEnoughSecret(value, 'ADMIN_DELETE_SECRET', 'Mode admin désactivé')
}
