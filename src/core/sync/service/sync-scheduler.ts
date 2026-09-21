export const SYNC_DEBOUNCE_MS = 2_000
export const SYNC_MAX_WAIT_MS = 30_000
export const SYNC_BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 300_000, 900_000]
const BACKOFF_JITTER_MS = 1_000

export interface SyncScheduler {
  /** À appeler après chaque écriture locale synchronisable : débounce puis programme un cycle. */
  notifyChange(): void
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
      } catch {
        scheduleBackoff()
      }
    })
    queue = run.catch(() => undefined)
  }

  function scheduleBackoff(): void {
    const stepIndex = Math.min(backoffAttempts, SYNC_BACKOFF_STEPS_MS.length - 1)
    const step = SYNC_BACKOFF_STEPS_MS[stepIndex]!
    backoffAttempts += 1
    scheduleAt(step + random() * BACKOFF_JITTER_MS)
  }

  return {
    notifyChange(): void {
      const now = Date.now()
      pendingSince ??= now
      const elapsed = now - pendingSince
      const remainingBeforeMaxWait = SYNC_MAX_WAIT_MS - elapsed
      scheduleAt(Math.max(0, Math.min(SYNC_DEBOUNCE_MS, remainingBeforeMaxWait)))
    },
  }
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
