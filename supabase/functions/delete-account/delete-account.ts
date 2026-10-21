import {
  ADMIN_SECRET_HEADER,
  handleAdminDeletion,
  type AdminDeletionPorts,
} from './admin-deletion.ts'
import { CORS_HEADERS, json } from './http-response.ts'
import { handleUserDeletion, type UserDeletionPorts } from './user-deletion.ts'

export type AccountDeletionPorts = UserDeletionPorts & AdminDeletionPorts

export async function handleDeleteAccount(
  request: Request,
  ports: AccountDeletionPorts,
): Promise<Response> {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
  if (request.headers.has(ADMIN_SECRET_HEADER)) return handleAdminDeletion(request, ports)
  return handleUserDeletion(request, ports)
}
