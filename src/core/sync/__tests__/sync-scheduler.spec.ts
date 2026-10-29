// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import {
  createSyncScheduler,
  resumePendingSync,
  SYNC_BACKOFF_STEPS_MS,
  SYNC_DEBOUNCE_MS,
  SYNC_MAX_WAIT_MS,
} from '../service/sync-scheduler'
import { ANIMAL_ID, createSyncTestDb, enableSync, insertAnimal } from './sync-test-db'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const NO_JITTER = () => 0
const FIRST_BACKOFF_STEP_MS = SYNC_BACKOFF_STEPS_MS[0]!

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSyncScheduler — debounce', () => {
  it('ne déclenche qu’un seul cycle pour plusieurs écritures rapprochées', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(500)
    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(500)
    scheduler.notifyChange()

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 1)
    expect(runCycle).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(runCycle).toHaveBeenCalledTimes(1)
  })

  it('repousse le cycle tant que des écritures arrivent, dans la limite de 30 s', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    for (let i = 0; i < 29; i += 1) {
      scheduler.notifyChange()
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(runCycle).not.toHaveBeenCalled()

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_MAX_WAIT_MS)

    expect(runCycle).toHaveBeenCalledTimes(1)
  })

  it('programme un nouveau cycle pour une écriture arrivant après la fin du précédent', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(2)
  })
})

describe('createSyncScheduler — backoff', () => {
  it('suit la séquence 5 s, 15 s, 1 min, 5 min, 15 min puis reste au plafond', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('échec réseau'))
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    const plateauMs = SYNC_BACKOFF_STEPS_MS.at(-1)!
    const steps = [...SYNC_BACKOFF_STEPS_MS, plateauMs, plateauMs]

    for (const [index, step] of steps.entries()) {
      await vi.advanceTimersByTimeAsync(step)
      expect(runCycle).toHaveBeenCalledTimes(index + 2)
    }
  })

  it('réinitialise le backoff après un cycle réussi', async () => {
    const runCycle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('échec'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('échec'))
      .mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_STEP_MS)
    expect(runCycle).toHaveBeenCalledTimes(2)

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_STEP_MS - 1)
    expect(runCycle).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(runCycle).toHaveBeenCalledTimes(4)
  })

  it('ajoute une gigue au délai de réessai', async () => {
    const runCycle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('échec'))
      .mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: () => 0.5 })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_STEP_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(runCycle).toHaveBeenCalledTimes(2)
  })
})

async function failCycles(count: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
  for (const step of SYNC_BACKOFF_STEPS_MS.slice(0, count - 1)) {
    await vi.advanceTimersByTimeAsync(step)
  }
}

describe('createSyncScheduler — Plus qui vient de s’activer', () => {
  it('rachat après quatre refus, serveur prévenu 10 s après l’appareil : un cycle passe dans la minute', async () => {
    let serverHasPlus = false
    let acceptedAt: number | null = null
    const runCycle = vi.fn<() => Promise<void>>(async () => {
      if (!serverHasPlus) throw new Error('refus 42501')
      acceptedAt ??= Date.now()
    })
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })
    scheduler.notifyChange()
    await failCycles(4)
    expect(runCycle).toHaveBeenCalledTimes(4)

    scheduler.notifyPlusActivated()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(10_000 - SYNC_DEBOUNCE_MS)
    serverHasPlus = true
    const webhookAt = Date.now()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(acceptedAt).not.toBeNull()
    expect(acceptedAt! - webhookAt).toBeLessThan(60_000)
  })

  it('réessaie à 2, 5, 10 puis 20 s pendant la première minute, puis reprend les paliers normaux', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('refus'))
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })
    scheduler.notifyChange()
    await failCycles(5)
    runCycle.mockClear()

    scheduler.notifyPlusActivated()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    const sinceActivation = [4_000, 9_000, 19_000, 39_000, 59_000, 79_000, 84_000, 99_000]
    let elapsed = SYNC_DEBOUNCE_MS
    for (const [index, at] of sinceActivation.entries()) {
      await vi.advanceTimersByTimeAsync(at - elapsed - 1)
      expect(runCycle).toHaveBeenCalledTimes(index + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(runCycle).toHaveBeenCalledTimes(index + 2)
      elapsed = at
    }
  })
})

describe('createSyncScheduler — retour au premier plan', () => {
  it('après une série de refus, un refus au retour se retente au premier palier', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('refus'))
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })
    scheduler.notifyChange()
    await failCycles(5)
    runCycle.mockClear()

    scheduler.notifyComeback()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_STEP_MS)
    expect(runCycle).toHaveBeenCalledTimes(2)
  })
})

describe('createSyncScheduler — sérialisation', () => {
  it('attend la fin du premier cycle avant de lancer le suivant', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const runCycle = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    scheduler.notifyChange()
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
    expect(runCycle).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(runCycle).toHaveBeenCalledTimes(2)

    second.resolve()
  })
})

describe('resumePendingSync', () => {
  it('programme un cycle si la base contient déjà des entrées en attente au redémarrage', async () => {
    const db = await createSyncTestDb()
    await enableSync(db)
    await insertAnimal(db, ANIMAL_ID, '2026-01-01T00:00:00.000Z')
    const repository = createSyncOutboxRepository(db)
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    await resumePendingSync(repository, scheduler)
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(runCycle).toHaveBeenCalledTimes(1)
    db.close()
  })

  it('ne programme rien si la file est vide', async () => {
    const db = await createSyncTestDb()
    const repository = createSyncOutboxRepository(db)
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const scheduler = createSyncScheduler({ runCycle, random: NO_JITTER })

    await resumePendingSync(repository, scheduler)
    await vi.advanceTimersByTimeAsync(SYNC_MAX_WAIT_MS)

    expect(runCycle).not.toHaveBeenCalled()
    db.close()
  })
})
