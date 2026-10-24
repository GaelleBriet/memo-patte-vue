import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBackupFactsReader,
  currentBackupFacts,
  provideBackupFacts,
  type BackupFactsDependencies,
} from '../service/backup-facts'

const OCTOBER_23 = '2026-10-23T08:00:00.000Z'

function dependencies(overrides: Partial<BackupFactsDependencies> = {}): BackupFactsDependencies {
  return {
    outbox: {
      isEnabled: async () => true,
      getLastSyncedAt: async () => OCTOBER_23,
      countPending: async () => 228,
      countWholeCarnet: async () => 348,
      countRefused: async () => 2,
      countRefusedPhotos: async () => 1,
    },
    isEligible: () => true,
    signInNeeded: () => false,
    isOnline: async () => true,
    ...overrides,
  }
}

afterEach(() => {
  provideBackupFacts(null)
})

describe('createBackupFactsReader', () => {
  it('un compte gratuit ne lance aucune requête', async () => {
    const query = vi.fn<() => Promise<number>>(async () => 0)
    const isOnline = vi.fn<() => Promise<boolean>>(async () => true)
    const read = createBackupFactsReader(
      dependencies({
        isEligible: () => false,
        isOnline,
        outbox: {
          isEnabled: async () => Boolean(await query()),
          getLastSyncedAt: async () => (await query(), null),
          countPending: query,
          countWholeCarnet: query,
          countRefused: query,
          countRefusedPhotos: query,
        },
      }),
    )

    expect((await read()).eligible).toBe(false)
    expect(query).not.toHaveBeenCalled()
    expect(isOnline).not.toHaveBeenCalled()
  })

  it('rassemble le statut Plus, la session, le réseau et la file d’envoi', async () => {
    const read = createBackupFactsReader(dependencies())

    await expect(read()).resolves.toEqual({
      eligible: true,
      signInNeeded: false,
      online: true,
      syncEnabled: true,
      lastSyncedAt: OCTOBER_23,
      remaining: 228,
      carnetSize: 348,
      refused: 2,
      refusedPhotos: 1,
    })
  })

  it('relit chaque fait à chaque lecture', async () => {
    let online = true
    const read = createBackupFactsReader(
      dependencies({ isOnline: async () => online, signInNeeded: () => !online }),
    )
    await read()

    online = false

    await expect(read()).resolves.toMatchObject({ online: false, signInNeeded: true })
  })
})

describe('provideBackupFacts', () => {
  it('rien tant que la synchro n’est pas branchée, puis le lecteur branché', () => {
    expect(currentBackupFacts()).toBeNull()

    const read = vi.fn<ReturnType<typeof createBackupFactsReader>>()
    provideBackupFacts(read)

    expect(currentBackupFacts()).toBe(read)
  })
})
