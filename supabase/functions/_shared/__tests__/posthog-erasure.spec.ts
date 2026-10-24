// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { posthogPersonErasure } from '../posthog-erasure'
import { fakeFetch, jsonResponse } from './fake-fetch'
import { USER } from './test-account'

const SETTINGS = {
  host: 'https://eu.posthog.com',
  projectId: '12345',
  personalApiKey: 'phx_cle-personnelle-de-test',
}

const QUEUED = {
  persons_found: 1,
  persons_deleted: 0,
  persons_queued_for_deletion: 1,
  events_queued_for_deletion: true,
  recordings_queued_for_deletion: false,
  deletion_errors: [],
}

describe('posthogPersonErasure', () => {
  it('efface la personne du compte et ses événements', async () => {
    const fake = fakeFetch(() => jsonResponse(202, QUEUED))

    await posthogPersonErasure(SETTINGS, fake.fetch)(USER)

    expect(fake.requests).toHaveLength(1)
    const [sent] = fake.requests
    expect(sent?.url).toBe('https://eu.posthog.com/api/projects/12345/persons/bulk_delete/')
    expect(sent?.method).toBe('POST')
    expect(sent?.headers.get('Authorization')).toBe(`Bearer ${SETTINGS.personalApiKey}`)
    expect(sent?.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(sent?.body ?? '')).toEqual({ distinct_ids: [USER], delete_events: true })
    expect(sent?.signal).toBeInstanceOf(AbortSignal)
  })

  it('accepte un hôte écrit avec une barre finale', async () => {
    const fake = fakeFetch(() => jsonResponse(202, QUEUED))

    await posthogPersonErasure({ ...SETTINGS, host: 'https://eu.posthog.com/' }, fake.fetch)(USER)

    expect(fake.requests[0]?.url).toBe(
      'https://eu.posthog.com/api/projects/12345/persons/bulk_delete/',
    )
  })

  it('réussit quand la personne n’existe pas chez PostHog', async () => {
    const fake = fakeFetch(() =>
      jsonResponse(202, { ...QUEUED, persons_found: 0, persons_queued_for_deletion: 0 }),
    )

    await expect(posthogPersonErasure(SETTINGS, fake.fetch)(USER)).resolves.toBeUndefined()
  })

  it.each([400, 401, 403, 429, 500])('échoue quand PostHog répond %i', async (status) => {
    const fake = fakeFetch(() => jsonResponse(status, { detail: 'refusé' }))

    const erasure = posthogPersonErasure(SETTINGS, fake.fetch)(USER)

    await expect(erasure).rejects.toThrow(String(status))
    await expect(erasure).rejects.not.toThrow(SETTINGS.personalApiKey)
  })

  it('échoue quand PostHog signale une personne non effacée', async () => {
    const fake = fakeFetch(() =>
      jsonResponse(202, {
        ...QUEUED,
        deletion_errors: [{ person_uuid: 'uuid-de-test', step: 'profile' }],
      }),
    )

    await expect(posthogPersonErasure(SETTINGS, fake.fetch)(USER)).rejects.toThrow('non effacée')
  })

  it.each([
    ['qui n’est pas du JSON', () => new Response('pas du json', { status: 202 })],
    ['sans liste d’erreurs', () => jsonResponse(202, { persons_found: 1 })],
  ])('échoue sur une réponse %s', async (_, respond) => {
    const fake = fakeFetch(respond)

    await expect(posthogPersonErasure(SETTINGS, fake.fetch)(USER)).rejects.toThrow('illisible')
  })

  it('échoue sans répéter la clé ni l’identifiant quand PostHog est injoignable', async () => {
    const fake = fakeFetch((request) => {
      throw new TypeError(
        `Invalid header value: "Bearer ${SETTINGS.personalApiKey}" ${request.url}`,
      )
    })

    const erasure = posthogPersonErasure(SETTINGS, fake.fetch)(USER)

    await expect(erasure).rejects.toThrow('PostHog injoignable')
    await expect(erasure).rejects.not.toThrow(SETTINGS.personalApiKey)
    await expect(erasure).rejects.not.toThrow(USER)
  })
})
