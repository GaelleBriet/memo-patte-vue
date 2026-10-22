// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { revenuecatCustomerErasure } from '../revenuecat-erasure'
import { fakeFetch, jsonResponse } from './fake-fetch'
import { USER } from './fake-deletion-ports'

const SECRET_KEY = 'sk_cle-secrete-de-test'

describe('revenuecatCustomerErasure', () => {
  it('supprime le client RevenueCat du compte', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { app_user_id: USER, deleted: true }))

    await revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)

    expect(fake.requests).toHaveLength(1)
    const [sent] = fake.requests
    expect(sent?.url).toBe(`https://api.revenuecat.com/v1/subscribers/${USER}`)
    expect(sent?.method).toBe('DELETE')
    expect(sent?.headers.get('Authorization')).toBe(`Bearer ${SECRET_KEY}`)
    expect(sent?.signal).toBeInstanceOf(AbortSignal)
  })

  it('encode l’identifiant dans l’adresse', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { app_user_id: 'a/b c', deleted: true }))

    await revenuecatCustomerErasure(SECRET_KEY, fake.fetch)('a/b c')

    expect(fake.requests[0]?.url).toBe('https://api.revenuecat.com/v1/subscribers/a%2Fb%20c')
  })

  it('réussit quand le client n’existe pas chez RevenueCat', async () => {
    const fake = fakeFetch(() => jsonResponse(404, { code: 7259, message: 'not found' }))

    await expect(revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)).resolves.toBeUndefined()
  })

  it('échoue quand RevenueCat n’accepte pas la suppression', async () => {
    const fake = fakeFetch(() => jsonResponse(200, { app_user_id: USER, deleted: false }))

    await expect(revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)).rejects.toThrow(
      'pas accepté',
    )
  })

  it('échoue sur une réponse qui n’est pas du JSON', async () => {
    const fake = fakeFetch(() => new Response('pas du json', { status: 200 }))

    await expect(revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)).rejects.toThrow(
      'pas accepté',
    )
  })

  it.each([400, 401, 403, 429, 500])('échoue quand RevenueCat répond %i', async (status) => {
    const fake = fakeFetch(() => jsonResponse(status, { message: 'refusé' }))

    const erasure = revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)

    await expect(erasure).rejects.toThrow(String(status))
    await expect(erasure).rejects.not.toThrow(SECRET_KEY)
  })

  it('échoue quand RevenueCat est injoignable', async () => {
    const fake = fakeFetch(() => {
      throw new TypeError('réseau coupé')
    })

    await expect(revenuecatCustomerErasure(SECRET_KEY, fake.fetch)(USER)).rejects.toThrow(
      'réseau coupé',
    )
  })
})
