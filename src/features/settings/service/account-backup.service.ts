import type { AccountRestore, RestoreMode } from '@/core/sync/service/account-restore'
import type { AccountBackupCheck } from '@/core/sync/service/account-sync'
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

export type AccountBackupDependencies = {
  outbox: Provider<Pick<LocalSyncOutbox, 'isEnabled' | 'enableAndQueueLiveCarnet'>>
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
  async function run(confirmed: boolean): Promise<AccountBackupCheck> {
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
    const local = await (await animals()).list()
    if (summary === null) {
      if (local.length > 0 && !confirmed) {
        return { kind: 'confirm-send', animalCount: local.length, firstName: local[0]!.name }
      }
      await queue.enableAndQueueLiveCarnet()
      return { kind: 'seeded' }
    }
    if (local.length > 0) return { kind: 'backup-found', summary }
    await restore.start('merge')
    return { kind: 'restore-pending', mode: 'merge' }
  }

  return {
    /**
     * Le compte a-t-il une sauvegarde ? Sans sauvegarde et avec un carnet sur le téléphone, rien
     * n'est mis en file avant `confirmSend()`. Avec une sauvegarde, un téléphone sans animal la
     * reçoit sans question ; sinon rien n'est activé, la restauration attend « Fusionner » ou
     * « Remplacer ». Ne lève pas.
     */
    check: () => run(false),

    /** Relit la sauvegarde puis envoie le carnet : un compte qui en a une entre-temps repasse par le choix. */
    confirmSend: () => run(true),
  }
}

export type AccountBackupService = ReturnType<typeof createAccountBackupService>

export type { RestoreMode }
