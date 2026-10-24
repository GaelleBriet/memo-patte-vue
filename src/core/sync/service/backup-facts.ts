import type { SyncOutboxRepository } from '../repository/sync-outbox.repository'

export interface BackupFacts {
  /** Compte Plus et abonnement en cours : la synchro peut tourner. */
  eligible: boolean
  signInNeeded: boolean
  online: boolean
  syncEnabled: boolean
  /** Fin du dernier cycle réussi, `null` avant la première sauvegarde du compte. */
  lastSyncedAt: string | null
  remaining: number
  /** Lignes et photos du carnet : ce que la première sauvegarde envoie. */
  carnetSize: number
  /** Éléments du carnet que le serveur refuse pour toujours, hors de `remaining`. */
  refused: number
}

export type BackupFactsReader = () => Promise<BackupFacts>

export interface BackupFactsDependencies {
  outbox: Pick<
    SyncOutboxRepository,
    'isEnabled' | 'getLastSyncedAt' | 'countPending' | 'countWholeCarnet' | 'countRefused'
  >
  isEligible: () => boolean
  signInNeeded: () => boolean
  isOnline: () => Promise<boolean>
}

export function createBackupFactsReader({
  outbox,
  isEligible,
  signInNeeded,
  isOnline,
}: BackupFactsDependencies): BackupFactsReader {
  return async () => {
    const [online, syncEnabled, lastSyncedAt, remaining, carnetSize, refused] = await Promise.all([
      isOnline(),
      outbox.isEnabled(),
      outbox.getLastSyncedAt(),
      outbox.countPending(),
      outbox.countWholeCarnet(),
      outbox.countRefused(),
    ])
    return {
      eligible: isEligible(),
      signInNeeded: signInNeeded(),
      online,
      syncEnabled,
      lastSyncedAt,
      remaining,
      carnetSize,
      refused,
    }
  }
}

let provided: BackupFactsReader | null = null

/** Branché au démarrage avec la synchro (`app/sync.ts`). */
export function provideBackupFacts(reader: BackupFactsReader | null): void {
  provided = reader
}

/** `null` tant que la synchro n'est pas branchée. */
export function currentBackupFacts(): BackupFactsReader | null {
  return provided
}
