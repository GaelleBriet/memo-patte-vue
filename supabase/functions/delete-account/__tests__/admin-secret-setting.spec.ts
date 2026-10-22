// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_SECRET_HEADER } from '../admin-deletion'
import { adminSecretFrom, MIN_ADMIN_SECRET_LENGTH } from '../admin-secret-setting'
import { handleDeleteAccount } from '../delete-account'
import { fakeDeletionPorts, USER } from './fake-deletion-ports'

const SECRET_32 = 'a'.repeat(MIN_ADMIN_SECRET_LENGTH)
const SECRET_31 = 'b'.repeat(MIN_ADMIN_SECRET_LENGTH - 1)

function adminRequest(secret: string): Request {
  return new Request('http://localhost/functions/v1/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [ADMIN_SECRET_HEADER]: secret },
    body: JSON.stringify({ email: 'sophie@exemple.test', scope: 'account' }),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('adminSecretFrom', () => {
  it('exige au moins 32 caractères', () => {
    expect(MIN_ADMIN_SECRET_LENGTH).toBe(32)
  })

  it('garde un secret de 32 caractères tel quel, sans rien journaliser', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(adminSecretFrom(SECRET_32)).toBe(SECRET_32)
    expect(error).not.toHaveBeenCalled()
  })

  it('désactive le mode admin avec un secret trop court, et le dit sans le recopier', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(adminSecretFrom(SECRET_31)).toBeUndefined()

    const written = JSON.stringify(error.mock.calls)
    expect(error).toHaveBeenCalledTimes(1)
    expect(written).toContain('ADMIN_DELETE_SECRET')
    expect(written).toContain('32')
    expect(written).not.toContain(SECRET_31)
  })

  it.each([undefined, ''])(
    'laisse le mode admin désactivé sans secret (%j), en silence',
    (value) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(adminSecretFrom(value)).toBeUndefined()
      expect(error).not.toHaveBeenCalled()
    },
  )
})

describe('handleDeleteAccount avec le secret lu au démarrage', () => {
  it('accepte le mode admin avec un secret de 32 caractères', async () => {
    const fake = fakeDeletionPorts({ adminSecret: adminSecretFrom(SECRET_32) })

    const response = await handleDeleteAccount(adminRequest(SECRET_32), fake.ports)

    expect(response.status).toBe(200)
    expect(fake.deletedUser()).toBe(USER)
  })

  it('refuse le mode admin quand le secret configuré est trop court, même présenté tel quel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakeDeletionPorts({ adminSecret: adminSecretFrom(SECRET_31) })

    const response = await handleDeleteAccount(adminRequest(SECRET_31), fake.ports)

    expect(response.status).toBe(401)
    expect(fake.calls).toEqual([])
  })
})
