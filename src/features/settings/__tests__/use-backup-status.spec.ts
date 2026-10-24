import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BACKUP_STATUS_REFRESH_MS, useBackupStatus } from '../composables/use-backup-status'
import { provideBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'

const listeners = vi.hoisted(() => ({
  resume: new Set<() => void>(),
  pause: new Set<() => void>(),
  online: new Set<() => void>(),
}))

vi.mock('@/core/app-lifecycle/app-resume', () => ({
  onAppResume: (listener: () => void) => {
    listeners.resume.add(listener)
    return () => listeners.resume.delete(listener)
  },
}))
vi.mock('@/core/app-lifecycle/app-pause', () => ({
  onAppPause: (listener: () => void) => {
    listeners.pause.add(listener)
    return () => listeners.pause.delete(listener)
  },
}))
vi.mock('@/core/sync/service/network-status', () => ({
  onNetworkOnline: (listener: () => void) => {
    listeners.online.add(listener)
    return () => listeners.online.delete(listener)
  },
}))

const FIRST_BACKUP: BackupFacts = {
  eligible: true,
  signInNeeded: false,
  online: true,
  syncEnabled: true,
  lastSyncedAt: null,
  remaining: 348,
  carnetSize: 348,
  refused: 0,
}

const SAVED: BackupFacts = {
  ...FIRST_BACKUP,
  lastSyncedAt: '2026-10-23T08:00:00.000Z',
  remaining: 0,
}

let scope: EffectScope | null = null

function start() {
  scope = effectScope()
  return scope.run(() => useBackupStatus())!
}

function emit(kind: 'resume' | 'pause' | 'online') {
  for (const listener of listeners[kind]) listener()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope?.stop()
  scope = null
  provideBackupFacts(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useBackupStatus', () => {
  it('sur ce téléphone, tout de suite, quand la synchro n’est pas branchée', () => {
    const { status } = start()

    expect(status.value).toEqual({ kind: 'local' })
  })

  it('prend la synchro branchée après l’ouverture de l’écran', async () => {
    const { status } = start()

    provideBackupFacts(async () => SAVED)
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)

    expect(status.value).toEqual({ kind: 'saved', at: SAVED.lastSyncedAt })
  })

  it('donne le nombre d’éléments refusés sous la dernière sauvegarde, zéro avant la première lecture', async () => {
    provideBackupFacts(async () => ({ ...SAVED, refused: 2 }))
    const { refused } = start()

    expect(refused.value).toBe(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(refused.value).toBe(2)
  })

  it('rien tant que la première lecture n’a pas répondu, puis l’état lu', async () => {
    provideBackupFacts(async () => FIRST_BACKUP)
    const { status } = start()

    expect(status.value).toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value).toEqual({ kind: 'first-backup', done: 0, total: 348 })
  })

  it('suit la première sauvegarde toutes les deux secondes, puis s’arrête une fois sauvegardé', async () => {
    let facts = FIRST_BACKUP
    const read = vi.fn<() => Promise<BackupFacts>>(async () => facts)
    provideBackupFacts(read)
    const { status } = start()
    await vi.advanceTimersByTimeAsync(0)

    facts = { ...FIRST_BACKUP, remaining: 228 }
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)
    expect(status.value).toEqual({ kind: 'first-backup', done: 120, total: 348 })

    facts = SAVED
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)
    expect(status.value).toEqual({ kind: 'saved', at: SAVED.lastSyncedAt })
    const reads = read.mock.calls.length
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 5)
    expect(read).toHaveBeenCalledTimes(reads)
  })

  it('hors première sauvegarde, une seule lecture, relue au retour au premier plan et du réseau', async () => {
    let facts: BackupFacts = { ...SAVED, online: false }
    const read = vi.fn<() => Promise<BackupFacts>>(async () => facts)
    provideBackupFacts(read)
    const { status } = start()
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 5)
    expect(read).toHaveBeenCalledOnce()

    facts = SAVED
    emit('online')
    await vi.advanceTimersByTimeAsync(0)
    expect(status.value).toEqual({ kind: 'saved', at: SAVED.lastSyncedAt })

    emit('resume')
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('ouvert en arrière-plan, ne relit pas ; reprend au retour même si la page se dit encore cachée', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const read = vi.fn<() => Promise<BackupFacts>>(async () => FIRST_BACKUP)
    provideBackupFacts(read)
    start()
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 5)
    expect(read).toHaveBeenCalledOnce()

    emit('resume')
    await vi.advanceTimersByTimeAsync(0)
    visibility.mockReturnValue('visible')
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 2)

    expect(read).toHaveBeenCalledTimes(4)
  })

  it('arrête la relecture à la mise en arrière-plan, même relue au retour du réseau, et la reprend au retour', async () => {
    const read = vi.fn<() => Promise<BackupFacts>>(async () => FIRST_BACKUP)
    provideBackupFacts(read)
    start()
    await vi.advanceTimersByTimeAsync(0)

    emit('pause')
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 5)
    expect(read).toHaveBeenCalledOnce()

    emit('online')
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 5)
    expect(read).toHaveBeenCalledTimes(2)

    emit('resume')
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('arrête de relire quand l’écran se ferme', async () => {
    const read = vi.fn<() => Promise<BackupFacts>>(async () => FIRST_BACKUP)
    provideBackupFacts(read)
    start()
    await vi.advanceTimersByTimeAsync(0)

    scope!.stop()
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 3)
    emit('resume')

    expect(read).toHaveBeenCalledOnce()
  })

  it('illisible quand la première lecture échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    provideBackupFacts(async () => Promise.reject(new Error('base fermée')))
    const { status } = start()
    await vi.advanceTimersByTimeAsync(0)

    expect(status.value).toEqual({ kind: 'unread' })
  })

  it('garde le dernier état connu quand une lecture suivante échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const read = vi.fn<() => Promise<BackupFacts>>(async () => FIRST_BACKUP)
    provideBackupFacts(read)
    const { status } = start()
    await vi.advanceTimersByTimeAsync(0)

    read.mockRejectedValueOnce(new Error('base fermée'))
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)

    expect(status.value).toEqual({ kind: 'first-backup', done: 0, total: 348 })
  })

  it('l’heure de référence avance avec chaque lecture', async () => {
    vi.setSystemTime(new Date(2026, 9, 23, 8, 0))
    provideBackupFacts(async () => FIRST_BACKUP)
    const { now } = start()
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)

    expect(now.value.getTime()).toBe(
      new Date(2026, 9, 23, 8, 0).getTime() + BACKUP_STATUS_REFRESH_MS,
    )
  })
})
