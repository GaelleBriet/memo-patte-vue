// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readBackupSummary, type BackupSummaryTable } from '../service/backup-summary'

const USER_ID = 'utilisateur-1'

function table(
  entity: string,
  { alive = 0, latest = null }: { alive?: number; latest?: string | null } = {},
): BackupSummaryTable {
  return {
    entity,
    countRemoteRows: async (_userId, options) => (options?.aliveOnly ? alive : alive + 1),
    latestRemoteStamp: async () => latest,
  }
}

describe('readBackupSummary', () => {
  it('rend null quand le compte n’a aucun animal non supprimé, même avec d’autres lignes', async () => {
    const summary = await readBackupSummary(
      [
        table('device', { latest: '2026-10-01T08:00:00+00:00' }),
        table('animal', { alive: 0, latest: '2026-10-02T08:00:00+00:00' }),
        table('carnet_settings', { latest: '2026-10-03T08:00:00+00:00' }),
      ],
      USER_ID,
    )

    expect(summary).toBeNull()
  })

  it('compte les animaux non supprimés et date la sauvegarde par la réception la plus récente', async () => {
    const summary = await readBackupSummary(
      [
        table('device', { latest: '2026-10-20T19:04:00.123456+00:00' }),
        table('animal', { alive: 3, latest: '2026-10-19T08:00:00+00:00' }),
        table('weight_entry', { latest: null }),
      ],
      USER_ID,
    )

    expect(summary).toEqual({ animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.123Z' })
  })

  it('lève quand le serveur ne répond pas', async () => {
    const failure = new Error('réseau')
    const unreachable: BackupSummaryTable = {
      ...table('animal'),
      countRemoteRows: () => Promise.reject(failure),
    }

    await expect(readBackupSummary([unreachable], USER_ID)).rejects.toBe(failure)
  })
})
