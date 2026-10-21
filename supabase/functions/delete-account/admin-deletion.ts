import { eraseAccount, removeAllPhotos, type AccountErasurePorts } from './account-erasure.ts'
import { isAdminSecret } from './admin-secret.ts'
import { deletionFailed, json } from './http-response.ts'

export const ADMIN_SECRET_HEADER = 'x-memopatte-admin-secret'

export type AdminDeletionPorts = AccountErasurePorts & {
  /** `ADMIN_DELETE_SECRET` de la fonction ; sans lui, le mode admin refuse tout. */
  adminSecret: string | undefined
  /** `null` quand aucun compte n'a cette adresse. */
  userIdByEmail(email: string): Promise<string | null>
  /** Le carnet sauvegardé ; le compte et son droit Plus restent. */
  deleteCloudBackup(userId: string): Promise<void>
}

type AdminOrder = { email: string; scope: 'account' | 'cloud-backup' }

async function orderOf(request: Request): Promise<AdminOrder | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const { email, scope } = body as { email?: unknown; scope?: unknown }
  if (typeof email !== 'string' || email.trim() === '') return null
  if (scope !== 'account' && scope !== 'cloud-backup') return null
  return { email, scope }
}

async function eraseCloudBackup(userId: string, ports: AdminDeletionPorts): Promise<void> {
  await removeAllPhotos(userId, ports)
  await ports.deleteCloudBackup(userId)
}

export async function handleAdminDeletion(
  request: Request,
  ports: AdminDeletionPorts,
): Promise<Response> {
  const secret = request.headers.get(ADMIN_SECRET_HEADER) ?? ''
  if (!(await isAdminSecret(secret, ports.adminSecret))) {
    return json(401, { error: 'unauthorized' })
  }
  const order = await orderOf(request)
  if (!order) return json(400, { error: 'invalid-request' })

  try {
    const userId = await ports.userIdByEmail(order.email)
    if (!userId) return json(404, { error: 'account-not-found' })
    if (order.scope === 'account') await eraseAccount(userId, 'email', ports)
    else await eraseCloudBackup(userId, ports)
  } catch (cause) {
    return deletionFailed(cause)
  }
  return json(200, { status: order.scope === 'account' ? 'deleted' : 'backup-deleted' })
}
