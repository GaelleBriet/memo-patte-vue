import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDeviceEraseService } from '../service/device-erase.service'

const CHILD = { sql: 'DELETE FROM weight_entry' }
const SYNC = [{ sql: 'DELETE FROM sync_outbox' }]

function setup({
  signedIn = false,
  pending = 0,
  failing,
}: {
  signedIn?: boolean
  pending?: number
  failing?: 'notifications' | 'database' | 'photos' | 'analytics' | 'outbox'
} = {}) {
  const steps: string[] = []
  const step =
    (name: string, fails = false) =>
    async () => {
      steps.push(name)
      if (fails) throw new Error(`${name} en échec`)
    }
  const eraseAll = vi.fn<(statements: { sql: string }[]) => Promise<void>>(async (statements) => {
    steps.push(`database:${statements.length}`)
    if (failing === 'database') throw new Error('base en échec')
  })
  const restart = vi.fn<() => void>(() => {
    steps.push('restart')
  })
  const service = createDeviceEraseService({
    animals: () => ({ eraseAll }),
    tables: [() => ({ eraseAllStatement: () => CHILD })],
    syncOutbox: () => ({
      listPending: async () => {
        if (failing === 'outbox') throw new Error('file illisible')
        return Array.from({ length: pending }, (_, index) => ({
          entity: 'animal',
          entityId: `a${index}`,
          queuedAt: '2026-10-01T10:00:00.000Z',
          attempts: 0,
        }))
      },
      eraseAllStatements: () => SYNC,
    }),
    account: { isSignedIn: () => signedIn, signOut: step('signOut') },
    notifications: {
      cancelAll: step('cancelNotifications', failing === 'notifications'),
      rebuild: step('rebuildReminders'),
    },
    photos: { deleteAll: step('photos', failing === 'photos') },
    analytics: { optOut: step('analytics', failing === 'analytics') },
    preferences: {
      clearAll: () => {
        steps.push('preferences')
      },
    },
    restart,
  })
  return { service, steps, eraseAll, restart }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('situation avant d’effacer', () => {
  it('ne parle ni de compte ni de sauvegarde cloud sans compte sur l’appareil', async () => {
    const { service } = setup({ pending: 3 })

    expect(await service.situation()).toEqual({ signedIn: false, hasUnsyncedChanges: false })
  })

  it('signale à un abonné les changements encore dans la file de synchro', async () => {
    expect(await setup({ signedIn: true, pending: 2 }).service.situation()).toEqual({
      signedIn: true,
      hasUnsyncedChanges: true,
    })
    expect(await setup({ signedIn: true }).service.situation()).toEqual({
      signedIn: true,
      hasUnsyncedChanges: false,
    })
  })

  it('prévient un abonné quand la file de synchro ne se lit pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await setup({ signedIn: true, failing: 'outbox' }).service.situation()).toEqual({
      signedIn: true,
      hasUnsyncedChanges: true,
    })
  })
})

describe('effacement', () => {
  it('efface tout dans l’ordre, puis redémarre l’app', async () => {
    const { service, steps, eraseAll } = setup()

    await service.erase()

    expect(steps).toEqual([
      'cancelNotifications',
      'database:2',
      'photos',
      'analytics',
      'preferences',
      'restart',
    ])
    expect(eraseAll).toHaveBeenCalledWith([...SYNC, CHILD])
  })

  it('déconnecte d’abord un abonné, pour que rien ne parte ni ne revienne par la synchro', async () => {
    const { service, steps } = setup({ signedIn: true })

    await service.erase()

    expect(steps[0]).toBe('signOut')
    expect(steps).toContain('database:2')
  })

  it('ne touche à rien d’autre quand les notifications ne s’annulent pas', async () => {
    const { service, steps, restart } = setup({ failing: 'notifications' })

    await expect(service.erase()).rejects.toThrow('cancelNotifications en échec')

    expect(steps).toEqual(['cancelNotifications'])
    expect(restart).not.toHaveBeenCalled()
  })

  it('reprogramme les rappels et garde photos et réglages quand la base ne s’efface pas', async () => {
    const { service, steps, restart } = setup({ failing: 'database' })

    await expect(service.erase()).rejects.toThrow('base en échec')

    expect(steps).toEqual(['cancelNotifications', 'database:2', 'rebuildReminders'])
    expect(restart).not.toHaveBeenCalled()
  })

  it('va jusqu’au bout une fois la base effacée, même si une étape suivante échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { service, steps } = setup({ failing: 'photos' })

    await service.erase()

    expect(steps).toEqual([
      'cancelNotifications',
      'database:2',
      'photos',
      'analytics',
      'preferences',
      'restart',
    ])
  })

  it('efface les réglages même quand le retrait des statistiques échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { service, steps } = setup({ failing: 'analytics' })

    await service.erase()

    expect(steps.slice(-2)).toEqual(['preferences', 'restart'])
  })
})
