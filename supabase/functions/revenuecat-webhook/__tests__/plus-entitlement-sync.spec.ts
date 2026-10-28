// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlusAccess, RevenuecatSubscriber } from '../../_shared/plus-access'
import { accountIdsOf, syncPlusEntitlements } from '../plus-entitlement-sync'
import type { RevenuecatEvent } from '../webhook-request'

const NOW = Date.parse('2027-03-10T12:00:00Z')
const SOPHIE = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const MARC = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d'
const ANONYMOUS = '$RCAnonymousID:2b4e8f0a1c3d4e5f6a7b8c9d0e1f2a3b'

const ANNUAL: RevenuecatSubscriber = {
  entitlements: {
    plus: {
      expires_date: '2028-03-03T09:00:00Z',
      product_identifier: 'memopatte_plus:annual',
      purchase_date: '2027-03-03T09:00:00Z',
    },
  },
}

function event(fields: Record<string, unknown>): RevenuecatEvent {
  return { id: 'evt-1', type: 'RENEWAL', ...fields }
}

function fakePorts(
  options: { accounts?: string[]; subscribers?: Record<string, RevenuecatSubscriber> } = {},
) {
  const calls: string[] = []
  const saved: Array<{ userId: string; access: PlusAccess }> = []
  const ended: Array<{ userId: string; at: string }> = []
  return {
    calls,
    saved,
    ended,
    ports: {
      now: () => NOW,
      async accountExists(userId: string) {
        calls.push(`exists ${userId}`)
        return (options.accounts ?? [SOPHIE, MARC]).includes(userId)
      },
      async fetchSubscriber(userId: string) {
        calls.push(`fetch ${userId}`)
        return options.subscribers?.[userId] ?? {}
      },
      async savePlusAccess(userId: string, access: PlusAccess) {
        saved.push({ userId, access })
      },
      async endPlusAccess(userId: string, at: string) {
        ended.push({ userId, at })
      },
    },
  }
}

type StoredAccess = { active: boolean; expiresAt: string | null; updatedAt: string }

/** La table et sa garde : une écriture lue avant la dernière écriture de la ligne est refusée. */
function guardedTable() {
  const rows = new Map<string, StoredAccess>()
  return {
    rows,
    async savePlusAccess(userId: string, access: PlusAccess, readAt: string) {
      const row = rows.get(userId)
      if (row && row.updatedAt >= readAt) return
      rows.set(userId, { active: access.active, expiresAt: access.expiresAt, updatedAt: readAt })
    },
    async endPlusAccess(userId: string, readAt: string) {
      const row = rows.get(userId)
      if (!row || row.updatedAt >= readAt) return
      if (row.expiresAt !== null && row.expiresAt <= readAt) return
      rows.set(userId, { active: false, expiresAt: readAt, updatedAt: readAt })
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deux événements du même compte traités en même temps', () => {
  it('la lecture la plus récente gagne, même écrite en premier', async () => {
    const purchaseRead = deferred<RevenuecatSubscriber>()
    const refunded: RevenuecatSubscriber = {
      entitlements: {
        plus: {
          expires_date: '2027-11-01T09:00:00Z',
          product_identifier: 'memopatte_plus:annual',
          purchase_date: '2026-11-01T09:00:00Z',
        },
      },
      subscriptions: {
        'memopatte_plus:annual': { refunded_at: '2026-11-01T10:00:00Z' },
      },
    }
    const purchaseState: RevenuecatSubscriber = {
      entitlements: { plus: { ...refunded.entitlements!.plus! } },
    }
    const table = guardedTable()
    const ports = (now: number, read: () => Promise<RevenuecatSubscriber>) => ({
      now: () => now,
      accountExists: async () => true,
      fetchSubscriber: read,
      savePlusAccess: table.savePlusAccess,
      endPlusAccess: table.endPlusAccess,
    })

    const purchase = syncPlusEntitlements(
      event({ id: 'achat', type: 'INITIAL_PURCHASE', app_user_id: SOPHIE }),
      ports(Date.parse('2026-11-01T10:00:01Z'), () => purchaseRead.promise),
    )
    await syncPlusEntitlements(
      event({ id: 'remboursement', type: 'CANCELLATION', app_user_id: SOPHIE }),
      ports(Date.parse('2026-11-01T10:00:02Z'), async () => refunded),
    )
    purchaseRead.resolve(purchaseState)
    await purchase

    expect(table.rows.get(SOPHIE)).toEqual({
      active: false,
      expiresAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:02.000Z',
    })
  })
})

describe('accountIdsOf', () => {
  it('trouve le compte dans app_user_id', () => {
    expect(accountIdsOf(event({ app_user_id: SOPHIE }))).toEqual([SOPHIE])
  })

  it('trouve le compte dans les alias quand le dernier identifiant vu est anonyme', () => {
    expect(accountIdsOf(event({ app_user_id: ANONYMOUS, aliases: [ANONYMOUS, SOPHIE] }))).toEqual([
      SOPHIE,
    ])
  })

  it('trouve les deux comptes d’un transfert', () => {
    expect(
      accountIdsOf(
        event({ type: 'TRANSFER', transferred_from: [SOPHIE], transferred_to: [ANONYMOUS, MARC] }),
      ),
    ).toEqual([SOPHIE, MARC])
  })

  it('ne garde chaque compte qu’une fois, en minuscules', () => {
    expect(
      accountIdsOf(event({ app_user_id: SOPHIE.toUpperCase(), aliases: [SOPHIE, 42, null] })),
    ).toEqual([SOPHIE])
  })

  it('ne retient ni identifiant anonyme ni identifiant étranger', () => {
    expect(accountIdsOf(event({ app_user_id: ANONYMOUS, aliases: ['user_1234'] }))).toEqual([])
    expect(accountIdsOf(event({}))).toEqual([])
  })
})

describe('syncPlusEntitlements', () => {
  it('recopie le droit Plus relu chez RevenueCat', async () => {
    const fake = fakePorts({ subscribers: { [SOPHIE]: ANNUAL } })

    await syncPlusEntitlements(event({ app_user_id: SOPHIE }), fake.ports)

    expect(fake.saved).toEqual([
      {
        userId: SOPHIE,
        access: { active: true, productType: 'annual', expiresAt: '2028-03-03T09:00:00.000Z' },
      },
    ])
    expect(fake.ended).toEqual([])
  })

  it('traiter deux fois le même événement donne le même droit', async () => {
    const fake = fakePorts({ subscribers: { [SOPHIE]: ANNUAL } })
    const renewal = event({ app_user_id: SOPHIE })

    await syncPlusEntitlements(renewal, fake.ports)
    await syncPlusEntitlements(renewal, fake.ports)

    expect(fake.saved[0]).toEqual(fake.saved[1])
  })

  it('termine l’accès maintenant quand RevenueCat ne connaît plus de droit Plus', async () => {
    const fake = fakePorts({ subscribers: { [SOPHIE]: { entitlements: {} } } })

    await syncPlusEntitlements(event({ app_user_id: SOPHIE }), fake.ports)

    expect(fake.saved).toEqual([])
    expect(fake.ended).toEqual([{ userId: SOPHIE, at: '2027-03-10T12:00:00.000Z' }])
  })

  it('relit les deux comptes d’un transfert', async () => {
    const fake = fakePorts({ subscribers: { [MARC]: ANNUAL } })

    await syncPlusEntitlements(
      event({ type: 'TRANSFER', transferred_from: [SOPHIE], transferred_to: [MARC] }),
      fake.ports,
    )

    expect(fake.ended).toEqual([{ userId: SOPHIE, at: '2027-03-10T12:00:00.000Z' }])
    expect(fake.saved.map(({ userId }) => userId)).toEqual([MARC])
  })

  it('ne demande rien à RevenueCat pour un compte supprimé, et le note sans identifiant', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakePorts({ accounts: [] })

    await syncPlusEntitlements(event({ app_user_id: SOPHIE }), fake.ports)

    expect(fake.calls).toEqual([`exists ${SOPHIE}`])
    expect(fake.saved).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'Événement RevenueCat ignoré : compte absent',
      'evt-1',
      'RENEWAL',
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SOPHIE)
  })

  it('ignore et note un événement sans compte MémoPatte, sans appeler RevenueCat', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = fakePorts()

    await syncPlusEntitlements(event({ app_user_id: ANONYMOUS }), fake.ports)

    expect(fake.calls).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'Événement RevenueCat ignoré : aucun compte MémoPatte',
      'evt-1',
      'RENEWAL',
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('RCAnonymousID')
  })

  it('laisse remonter une erreur de RevenueCat, pour que l’événement soit renvoyé', async () => {
    const fake = fakePorts()
    fake.ports.fetchSubscriber = async () => {
      throw new Error('RevenueCat a répondu 503')
    }

    await expect(syncPlusEntitlements(event({ app_user_id: SOPHIE }), fake.ports)).rejects.toThrow(
      'RevenueCat a répondu 503',
    )
    expect(fake.saved).toEqual([])
  })
})

describe('syncPlusEntitlements, droit promotionnel accordé dans RevenueCat', () => {
  const PROMOTIONAL: RevenuecatSubscriber = {
    entitlements: {
      plus: {
        expires_date: '2027-04-10T12:00:00Z',
        product_identifier: 'rc_promo_plus_monthly',
        purchase_date: '2027-03-10T12:00:00Z',
      },
    },
    subscriptions: {
      rc_promo_plus_monthly: {
        expires_date: '2027-04-10T12:00:00Z',
        purchase_date: '2027-03-10T12:00:00Z',
        store: 'promotional',
        is_sandbox: false,
      },
    },
  }

  it('un événement NON_RENEWING_PURCHASE du store PROMOTIONAL ouvre Plus jusqu’à la fin du droit', async () => {
    const fake = fakePorts({ subscribers: { [SOPHIE]: PROMOTIONAL } })

    await syncPlusEntitlements(
      event({ type: 'NON_RENEWING_PURCHASE', store: 'PROMOTIONAL', app_user_id: SOPHIE }),
      fake.ports,
    )

    expect(fake.saved).toEqual([
      {
        userId: SOPHIE,
        access: { active: true, productType: 'monthly', expiresAt: '2027-04-10T12:00:00.000Z' },
      },
    ])
  })
})
