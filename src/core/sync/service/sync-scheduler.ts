import { errorSummary } from '@/shared/utils/error-summary'

export const SYNC_DEBOUNCE_MS = 2_000
export const SYNC_MAX_WAIT_MS = 30_000
export const SYNC_BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 300_000, 900_000]
export const SYNC_PLUS_ACTIVATION_STEPS_MS = [2_000, 5_000, 10_000, 20_000]
/** Le webhook RevenueCat prévient le serveur quelques secondes après l'appareil. */
export const SYNC_PLUS_ACTIVATION_WINDOW_MS = 60_000
const BACKOFF_JITTER_MS = 1_000

export interface SyncScheduler {
  /** À appeler après chaque écriture locale synchronisable : débounce puis programme un cycle. */
  notifyChange(): void
  /** Retour au premier plan ou du réseau : l'attente accumulée par les refus d'avant ne compte plus. */
  notifyComeback(): void
  /** Plus vient de s'activer : réessais rapprochés pendant la première minute. */
  notifyPlusActivated(): void
}

export interface SyncSchedulerOptions {
  runCycle: () => Promise<void>
  random?: () => number
}

export function createSyncScheduler({
  runCycle,
  random = Math.random,
}: SyncSchedulerOptions): SyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSince: number | null = null
  let backoffAttempts = 0
  let plusActivatedAt: number | null = null
  let activationRetries = 0
  let queue: Promise<unknown> = Promise.resolve()

  function scheduleAt(delayMs: number): void {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      runQueuedCycle()
    }, delayMs)
  }

  function runQueuedCycle(): void {
    const run = queue.then(async () => {
      pendingSince = null
      try {
        await runCycle()
        backoffAttempts = 0
      } catch (cause) {
        console.warn('Cycle de synchro en échec :', errorSummary(cause))
        scheduleBackoff()
      }
    })
    queue = run.catch(() => undefined)
  }

  function scheduleBackoff(): void {
    let step: number
    if (plusActivatedAt !== null && Date.now() - plusActivatedAt < SYNC_PLUS_ACTIVATION_WINDOW_MS) {
      step = stepAt(SYNC_PLUS_ACTIVATION_STEPS_MS, activationRetries)
      activationRetries += 1
    } else {
      step = stepAt(SYNC_BACKOFF_STEPS_MS, backoffAttempts)
      backoffAttempts += 1
    }
    scheduleAt(step + random() * BACKOFF_JITTER_MS)
  }

  function notifyChange(): void {
    const now = Date.now()
    pendingSince ??= now
    const elapsed = now - pendingSince
    const remainingBeforeMaxWait = SYNC_MAX_WAIT_MS - elapsed
    scheduleAt(Math.max(0, Math.min(SYNC_DEBOUNCE_MS, remainingBeforeMaxWait)))
  }

  return {
    notifyChange,
    notifyComeback(): void {
      backoffAttempts = 0
      notifyChange()
    },
    notifyPlusActivated(): void {
      backoffAttempts = 0
      activationRetries = 0
      plusActivatedAt = Date.now()
      notifyChange()
    },
  }
}

function stepAt(steps: number[], attempts: number): number {
  return steps[Math.min(attempts, steps.length - 1)]!
}

interface PendingSyncPort {
  listPending(): Promise<unknown[]>
}

/** Redémarrage : rien à sérialiser en JS, la file vit en base — on relance juste le débounce. */
export async function resumePendingSync(
  outbox: PendingSyncPort,
  scheduler: SyncScheduler,
): Promise<void> {
  const pending = await outbox.listPending()
  if (pending.length > 0) scheduler.notifyChange()
}
