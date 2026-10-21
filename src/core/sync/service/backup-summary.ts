import type { RemoteBackupReads, SyncableTable } from './syncable-table'

export type BackupSummaryTable = Pick<SyncableTable, 'entity'> & RemoteBackupReads

export interface BackupSummary {
  /** Animaux non supprimés, suivis ou non : ceux que la restauration ramène. */
  animalCount: number
  /** Réception par le serveur de la modification la plus récente du compte. */
  lastBackupAt: string
}

/** `null` quand le compte n'a aucun animal non supprimé : il n'y a rien à restaurer. Lève hors réseau. */
export async function readBackupSummary(
  tables: readonly BackupSummaryTable[],
  userId: string,
): Promise<BackupSummary | null> {
  const animals = tables.find(({ entity }) => entity === 'animal')
  const animalCount = animals ? await animals.countRemoteRows(userId, { aliveOnly: true }) : 0
  if (animalCount === 0) return null

  const stamps = await Promise.all(tables.map((table) => table.latestRemoteStamp(userId)))
  const latest = Math.max(...stamps.flatMap((stamp) => (stamp === null ? [] : [Date.parse(stamp)])))
  return { animalCount, lastBackupAt: new Date(latest).toISOString() }
}
