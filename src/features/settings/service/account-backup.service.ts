import type { SyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
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
  | { kind: 'backup-found'; summary: BackupSummary; hasLocalCarnet: boolean }

export type AccountBackupDependencies = {
  outbox: Provider<Pick<SyncOutboxRepository, 'isEnabled' | 'enableAndQueueWholeCarnet'>>
  tables: Provider<BackupSummaryTable[]>
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  userId: () => string | null
}

export function createAccountBackupService({
  outbox,
  tables,
  animals,
  userId,
}: AccountBackupDependencies) {
  return {
    /**
     * Le compte a-t-il une sauvegarde ? Sans sauvegarde, le carnet du téléphone part vers le cloud
     * et ce que le serveur avait se fusionne par « la plus récente gagne ». Avec une sauvegarde, rien
     * n'est activé : la restauration attend un geste. Ne lève pas.
     */
    async check(): Promise<AccountBackupCheck> {
      const account = userId()
      if (account === null) return { kind: 'signed-out' }
      const queue = await outbox()
      if (await queue.isEnabled()) return { kind: 'active' }

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
      const hasLocalCarnet = (await (await animals()).list()).length > 0
      return { kind: 'backup-found', summary, hasLocalCarnet }
    },
  }
}

export type AccountBackupService = ReturnType<typeof createAccountBackupService>
