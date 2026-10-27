import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { installRestoreRetry } from '../service/restore-retry'
import type { RestoreFlowState } from '../service/restore-flow'
import { SYNC_BACKOFF_STEPS_MS } from '../service/sync-scheduler'

const WAITING: RestoreFlowState = { step: 'waiting-network', chosen: true }
const WAITING_SIGN_IN: RestoreFlowState = { step: 'waiting-sign-in', chosen: true }
const RESTORING: RestoreFlowState = { step: 'restoring', progress: { done: 0, total: 0 } }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  const state = shallowRef<RestoreFlowState>({ step: 'idle' })
  const retry = vi.fn<() => void>()
  const stop = installRestoreRetry({ state, retry })
  return { state, retry, stop }
}

describe('installRestoreRetry', () => {
  it('réessaie tant que l’écran attend le réseau, avec un recul croissant', async () => {
    const { state, retry } = setup()
    state.value = WAITING
    await nextTick()

    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[0]! - 1)
    expect(retry).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(retry).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[1]!)
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('garde son recul quand un essai repart en restauration puis échoue encore', async () => {
    const { state, retry } = setup()
    retry.mockImplementation(() => {
      state.value = RESTORING
    })
    state.value = WAITING
    await nextTick()
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[0]!)
    expect(retry).toHaveBeenCalledTimes(1)

    state.value = WAITING
    await nextTick()
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[1]! - 1)
    expect(retry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('s’arrête dès que le flux quitte l’attente, et repart du premier palier ensuite', async () => {
    const { state, retry } = setup()
    state.value = WAITING
    await nextTick()
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[0]!)
    state.value = { step: 'idle' }
    await nextTick()
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS.at(-1)!)
    expect(retry).toHaveBeenCalledTimes(1)

    state.value = WAITING
    await nextTick()
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[0]!)
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('ne garde qu’une minuterie, et aucune après l’arrêt', async () => {
    const { state, retry, stop } = setup()
    state.value = WAITING
    await nextTick()
    state.value = RESTORING
    await nextTick()
    state.value = WAITING
    await nextTick()
    expect(vi.getTimerCount()).toBe(1)

    stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS.at(-1)!)
    expect(retry).not.toHaveBeenCalled()
  })

  it('ne réessaie pas tant que la session a expiré, et réessaie dès la reconnexion', async () => {
    const { state, retry } = setup()
    state.value = WAITING
    await nextTick()
    state.value = WAITING_SIGN_IN
    await nextTick()

    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS.at(-1)! * 2)
    expect(retry).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    state.value = WAITING
    await nextTick()
    expect(retry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SYNC_BACKOFF_STEPS_MS[0]!)
    expect(retry).toHaveBeenCalledTimes(2)
  })
})
