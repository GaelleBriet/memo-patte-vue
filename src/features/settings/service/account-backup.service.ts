import type { AccountRestore, RestoreMode } from '@/core/sync/service/account-restore'
import type { LocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import {
  readBackupSummary,
  type BackupSummary,
  type BackupSummaryTable,
} from '@/core/sync/service/backup-summary'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { errorSummary } from '@/shared/utils/error-summary'

type Provider<T> = () => T | Promise<T>

export type { BackupSummary }

export type AccountBackupCheck =
  | { kind: 'signed-out' }
  | { kind: 'active' }
  | { kind: 'seeded' }
  | { kind: 'unreachable' }
  | { kind: 'restore-pending'; mode: RestoreMode }
  | { kind: 'backup-found'; summary: BackupSummary }

export type AccountBackupDependencies = {
  outbox: Provider<Pick<LocalSyncOutbox, 'isEnabled' | 'enableAndQueueWholeCarnet'>>
  tables: Provider<BackupSummaryTable[]>
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  restore: Pick<AccountRestore, 'pendingMode' | 'start'>
  userId: () => string | null
}

export function createAccountBackupService({
  outbox,
  tables,
  animals,
  restore,
  userId,
}: AccountBackupDependencies) {
  return {
    /**
     * Le compte a-t-il une sauvegarde ? Sans sauvegarde, le carnet du téléphone part vers le cloud
     * et ce que le serveur avait se fusionne par « la plus récente gagne ». Avec une sauvegarde, un
     * téléphone sans animal la reçoit sans question ; sinon rien n'est activé, la restauration
     * attend « Fusionner » ou « Remplacer ». Ne lève pas.
     */
    async check(): Promise<AccountBackupCheck> {
      const account = userId()
      if (account === null) return { kind: 'signed-out' }
      const queue = await outbox()
      if (await queue.isEnabled()) return { kind: 'active' }
      const pending = await restore.pendingMode()
      if (pending !== null) return { kind: 'restore-pending', mode: pending }

      let summary: BackupSummary | null
      try {
        summary = await readBackupSummary(await tables(), account)
      } catch (cause) {
        console.warn('Sauvegarde du compte non lue :', errorSummary(cause))
        return { kind: 'unreachable' }
      }

      if (userId() !== account) return { kind: 'signed-out' }
      if (summary === null) {
        await queue.enableAndQueueWholeCarnet()
        return { kind: 'seeded' }
      }
      if ((await (await animals()).list()).length > 0) return { kind: 'backup-found', summary }
      await restore.start('merge')
      return { kind: 'restore-pending', mode: 'merge' }
    },
  }
}

export type AccountBackupService = ReturnType<typeof createAccountBackupService>

export type { RestoreMode }
