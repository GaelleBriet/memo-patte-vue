import { CORS_HEADERS, json } from './http-response.ts'
import { handleUserDeletion, type UserDeletionPorts } from './user-deletion.ts'

export type AccountDeletionPorts = UserDeletionPorts

export async function handleDeleteAccount(
  request: Request,
  ports: AccountDeletionPorts,
): Promise<Response> {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
  return handleUserDeletion(request, ports)
}
