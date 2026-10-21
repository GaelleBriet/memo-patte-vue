import { describe, expect, it, vi } from 'vitest'

import type { BackupSummaryTable } from '@/core/sync/service/backup-summary'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { createAccountBackupService } from '../service/account-backup.service'

const USER_ID = 'utilisateur-1'

function setup({
  enabled = false,
  remoteAnimals = 0,
  localAnimals = 0,
  unreachable = false,
  userId = USER_ID,
}: {
  enabled?: boolean
  remoteAnimals?: number
  localAnimals?: number
  unreachable?: boolean
  userId?: string | null
} = {}) {
  const enableAndQueueWholeCarnet = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const animalTable: BackupSummaryTable = {
    entity: 'animal',
    countRemoteRows: async () => {
      if (unreachable) throw new Error('réseau coupé')
      return remoteAnimals
    },
    latestRemoteStamp: async () => '2026-10-20T19:04:00+00:00',
  }
  const service = createAccountBackupService({
    outbox: () => ({ isEnabled: async () => enabled, enableAndQueueWholeCarnet }),
    tables: () => [animalTable],
    animals: () => ({
      list: async () =>
        Array.from({ length: localAnimals }, (_, index) => ({ id: `a${index}` }) as Animal),
    }),
    userId: () => userId,
  })
  return { service, enableAndQueueWholeCarnet }
}

describe('createAccountBackupService', () => {
  it('sans sauvegarde, amorce l’envoi de tout le carnet du téléphone', async () => {
    const { service, enableAndQueueWholeCarnet } = setup({ remoteAnimals: 0, localAnimals: 2 })

    await expect(service.check()).resolves.toEqual({ kind: 'seeded' })
    expect(enableAndQueueWholeCarnet).toHaveBeenCalledOnce()
  })

  it('avec une sauvegarde et un carnet sur le téléphone, attend le choix sans rien activer', async () => {
    const { service, enableAndQueueWholeCarnet } = setup({ remoteAnimals: 3, localAnimals: 1 })

    await expect(service.check()).resolves.toEqual({
      kind: 'backup-found',
      summary: { animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.000Z' },
      hasLocalCarnet: true,
    })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
  })

  it('avec une sauvegarde et aucun animal sur le téléphone, le dit sans rien activer', async () => {
    const { service, enableAndQueueWholeCarnet } = setup({ remoteAnimals: 1, localAnimals: 0 })

    await expect(service.check()).resolves.toMatchObject({
      kind: 'backup-found',
      hasLocalCarnet: false,
    })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
  })

  it('ne redemande rien au serveur quand la synchro est déjà active sur ce téléphone', async () => {
    const { service, enableAndQueueWholeCarnet } = setup({ enabled: true, unreachable: true })

    await expect(service.check()).resolves.toEqual({ kind: 'active' })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
  })

  it('serveur injoignable : rien n’est activé, la question reviendra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service, enableAndQueueWholeCarnet } = setup({ unreachable: true, localAnimals: 1 })

    await expect(service.check()).resolves.toEqual({ kind: 'unreachable' })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('n’amorce rien pour un compte remplacé pendant la lecture de sa sauvegarde', async () => {
    let account: string | null = USER_ID
    const enableAndQueueWholeCarnet = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const service = createAccountBackupService({
      outbox: () => ({ isEnabled: async () => false, enableAndQueueWholeCarnet }),
      tables: () => [
        {
          entity: 'animal',
          countRemoteRows: async () => {
            account = 'autre-compte'
            return 0
          },
          latestRemoteStamp: async () => null,
        },
      ],
      animals: () => ({ list: async () => [] }),
      userId: () => account,
    })

    await expect(service.check()).resolves.toEqual({ kind: 'signed-out' })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
  })

  it('sans compte sur le téléphone, ne fait rien', async () => {
    const { service, enableAndQueueWholeCarnet } = setup({ userId: null, remoteAnimals: 0 })

    await expect(service.check()).resolves.toEqual({ kind: 'signed-out' })
    expect(enableAndQueueWholeCarnet).not.toHaveBeenCalled()
  })
})
