import { eraseAccount, removeAllPhotos, type AccountErasurePorts } from './account-erasure.ts'
import { isSharedSecret } from '../_shared/shared-secret.ts'
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

const IP_ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/
const MAX_LOGGED_ADDRESSES = 5

// L'en-tête vient du client et pourrait porter une adresse e-mail : seule une adresse IP est recopiée.
function addressOrUnknown(value: string): string {
  const trimmed = value.trim()
  return IP_ADDRESS.test(trimmed) ? trimmed : 'unknown'
}

// Un proxy ajoute en fin de chaîne : on garde les dernières valeurs.
function forwardedAddressesOf(request: Request): string {
  const values = (request.headers.get('x-forwarded-for') ?? '').split(',')
  const kept = values.slice(-MAX_LOGGED_ADDRESSES).map(addressOrUnknown).join(', ')
  const dropped = values.length - MAX_LOGGED_ADDRESSES
  return dropped > 0 ? `(+${dropped} plus anciennes) ${kept}` : kept
}

function refused(request: Request): Response {
  console.warn(
    `Mode admin : secret refusé, ip ${forwardedAddressesOf(request)}, à ${new Date().toISOString()}`,
  )
  return json(401, { error: 'unauthorized' })
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
  if (!(await isSharedSecret(secret, ports.adminSecret))) return refused(request)
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
