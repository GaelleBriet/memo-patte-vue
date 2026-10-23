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
    return {
      kind: 'first-backup',
      done: Math.max(0, facts.carnetSize - facts.remaining),
      total: facts.carnetSize,
    }
  }
  return { kind: 'saved', at: facts.lastSyncedAt }
}

export function showsPhotosBackedUp(status: CloudBackupStatus): boolean {
  return status.kind === 'saved' || (status.kind === 'waiting-network' && !status.firstBackup)
}
