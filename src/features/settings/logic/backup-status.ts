import type { BackupFacts } from '@/core/sync/service/backup-facts'

export type BackupStatus =
  | { kind: 'local' }
  | { kind: 'unread' }
  | { kind: 'interrupted'; since: string | null }
  | { kind: 'waiting-network'; firstBackup: boolean }
  | { kind: 'first-backup'; done: number; total: number }
  | { kind: 'saved'; at: string }

export type CloudBackupStatus = Exclude<BackupStatus, { kind: 'local' | 'unread' }>

/** L'état de la sauvegarde cloud que Paramètres › Sauvegarde affiche (PL-17). */
export function backupStatusOf(facts: BackupFacts | null): BackupStatus {
  if (facts === null || !facts.eligible || !facts.syncEnabled) return { kind: 'local' }
  if (facts.signInNeeded) return { kind: 'interrupted', since: facts.lastSyncedAt }
  if (!facts.online) return { kind: 'waiting-network', firstBackup: facts.lastSyncedAt === null }
  if (facts.lastSyncedAt === null) {
    const total = facts.carnetSize - facts.refused
    return { kind: 'first-backup', done: Math.max(0, total - facts.remaining), total }
  }
  return { kind: 'saved', at: facts.lastSyncedAt }
}

/** Ajouté sous « Dernière sauvegarde » ou « Première sauvegarde », jamais sous un autre état. */
export function refusedItemsOf(facts: BackupFacts | null): number {
  const { kind } = backupStatusOf(facts)
  return facts !== null && (kind === 'saved' || kind === 'first-backup') ? facts.refused : 0
}

export function showsPhotosBackedUp(status: CloudBackupStatus): boolean {
  return status.kind === 'saved' || (status.kind === 'waiting-network' && !status.firstBackup)
}
