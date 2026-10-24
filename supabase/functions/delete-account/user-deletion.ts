import { eraseAccount, type AccountErasurePorts } from '../_shared/account-erasure.ts'
import { deletionFailed, json } from './http-response.ts'
import { isIdentityFresh } from './identity-freshness.ts'

export type UserDeletionPorts = AccountErasurePorts & {
  /** `null` quand le jeton ne désigne aucun compte. */
  userIdFromToken(token: string): Promise<string | null>
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')
  return match?.[1] ?? null
}

export async function handleUserDeletion(
  request: Request,
  ports: UserDeletionPorts,
): Promise<Response> {
  const token = bearerToken(request)
  if (!token) return json(401, { error: 'unauthorized' })

  try {
    const userId = await ports.userIdFromToken(token)
    if (!userId) return json(401, { error: 'unauthorized' })
    if (!isIdentityFresh(token, Date.now())) return json(401, { error: 'identity-expired' })
    await eraseAccount(userId, 'app', ports)
  } catch (cause) {
    return deletionFailed(cause)
  }
  return json(200, { status: 'deleted' })
}
