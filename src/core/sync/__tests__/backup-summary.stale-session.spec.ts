// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { accountServer, clientOver, NOW, USER_ID } from '@/core/supabase/__tests__/account-server'
import { isTransportFailure } from '@/core/supabase/transport-failure'
import { createRemoteSyncTable } from '../repository/remote-sync-table.repository'
import { readBackupSummary, type BackupSummaryTable } from '../service/backup-summary'

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

function backupOf(token: 'valide' | 'périmé') {
  const { serverFetch, dataRequests } = accountServer('muet')
  const supabase = clientOver(serverFetch, token)
  const animals: BackupSummaryTable = {
    entity: 'animal',
    ...createRemoteSyncTable({ table: 'animals', columns: 'id', loadClient: async () => supabase }),
  }
  const read = readBackupSummary([animals], USER_ID).catch((cause: unknown) => ({ failed: cause }))
  return { read, dataRequests }
}

describe('readBackupSummary, Auth muet au rafraîchissement', () => {
  it('jeton périmé : la lecture échoue comme une coupure, jamais « pas de sauvegarde »', async () => {
    const { read, dataRequests } = backupOf('périmé')
    await vi.advanceTimersByTimeAsync(60_000)

    const outcome = await read
    expect(outcome).not.toBeNull()
    expect(isTransportFailure((outcome as { failed: unknown }).failed)).toBe(true)
    expect(dataRequests).toEqual([])
  })

  it('jeton valide : la même sauvegarde est lue', async () => {
    const { read } = backupOf('valide')
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(read).resolves.toEqual({
      animalCount: 2,
      lastBackupAt: '2026-10-20T19:04:00.000Z',
    })
  })
})
