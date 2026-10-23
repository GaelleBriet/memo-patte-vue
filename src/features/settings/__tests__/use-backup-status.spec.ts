import { effectScope, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BACKUP_STATUS_REFRESH_MS, useBackupStatus } from '../composables/use-backup-status'
import { provideBackupFacts, type BackupFacts } from '@/core/sync/service/backup-facts'

const FIRST_BACKUP: BackupFacts = {
  eligible: true,
  signInNeeded: false,
  online: true,
  syncEnabled: true,
  lastSyncedAt: null,
  remaining: 348,
  carnetSize: 348,
}

let scope: EffectScope | null = null

function start() {
  scope = effectScope()
  return scope.run(() => useBackupStatus())!
}

afterEach(() => {
  scope?.stop()
  scope = null
  provideBackupFacts(null)
  vi.useRealTimers()
})

describe('useBackupStatus', () => {
  it('sur ce téléphone, tout de suite, quand la synchro n’est pas branchée', () => {
    const { status } = start()

    expect(status.value).toEqual({ kind: 'local' })
  })

  it('rien tant que la première lecture n’a pas répondu, puis l’état lu', async () => {
    provideBackupFacts(async () => FIRST_BACKUP)
    const { status } = start()

    expect(status.value).toBeNull()
    await vi.waitFor(() =>
      expect(status.value).toEqual({ kind: 'first-backup', done: 0, total: 348 }),
    )
  })

  it('suit l’envoi : relu à intervalle régulier tant que l’écran est ouvert', async () => {
    vi.useFakeTimers()
    let facts = FIRST_BACKUP
    const read = vi.fn<() => Promise<BackupFacts>>(async () => facts)
    provideBackupFacts(read)
    const { status } = start()
    await vi.advanceTimersByTimeAsync(0)

    facts = { ...FIRST_BACKUP, remaining: 228 }
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)

    expect(status.value).toEqual({ kind: 'first-backup', done: 120, total: 348 })

    scope!.stop()
    const reads = read.mock.calls.length
    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS * 3)
    expect(read).toHaveBeenCalledTimes(reads)
  })

  it('garde le dernier état connu quand une lecture échoue', async () => {
    vi.useFakeTimers()
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
    vi.useFakeTimers({ now: new Date(2026, 9, 23, 8, 0) })
    provideBackupFacts(async () => FIRST_BACKUP)
    const { now } = start()
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(BACKUP_STATUS_REFRESH_MS)

    expect(now.value.getTime()).toBe(
      new Date(2026, 9, 23, 8, 0).getTime() + BACKUP_STATUS_REFRESH_MS,
    )
  })
})
