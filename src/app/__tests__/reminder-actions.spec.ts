import { describe, expect, it, vi } from 'vitest'

import type { ReminderAction } from '@/core/notifications'
import { installReminderActions } from '../reminder-actions'

const TODAY = '2026-10-07'
const METACAM = 'metacam'
const CARRE = { id: '33333333-3333-4333-8333-333333333333' }

function done(key: string): ReminderAction {
  return { key, action: 'done' }
}

describe('installReminderActions', () => {
  function listenerOf(action?: ReminderAction) {
    let deliver: (action: ReminderAction) => void = () => {}
    const stop = vi.fn<() => void>()
    const listen = vi.fn<(listener: (action: ReminderAction) => void) => () => void>((listener) => {
      deliver = listener
      if (action) listener(action)
      return stop
    })
    return { listen, stop, deliver: (next: ReminderAction) => deliver(next) }
  }

  it('traite après le démarrage l’action retenue par le plugin pendant que l’app était fermée', async () => {
    let ready: () => void = () => {}
    const isReady = () => new Promise<void>((resolve) => (ready = resolve))
    const handle = vi.fn<(action: ReminderAction) => Promise<void>>().mockResolvedValue()
    const action = done(`treatment:${METACAM}:${TODAY}:2000:due`)
    const { listen } = listenerOf(action)

    installReminderActions({ isReady }, handle, listen)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle).not.toHaveBeenCalled()

    ready()

    await vi.waitFor(() => expect(handle).toHaveBeenCalledExactlyOnceWith(action))
  })

  it('traite aussitôt une action reçue app ouverte', async () => {
    const handle = vi.fn<(action: ReminderAction) => Promise<void>>().mockResolvedValue()
    const { listen, deliver } = listenerOf()
    installReminderActions({ isReady: async () => {} }, handle, listen)

    deliver({ key: `vaccination:${CARRE.id}:${TODAY}:due`, action: 'open' })

    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce())
  })

  it('traite les actions l’une après l’autre, même après un échec', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let finishFirst: () => void = () => {}
    const handle = vi
      .fn<(action: ReminderAction) => Promise<void>>()
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => (finishFirst = () => reject(new Error('base')))),
      )
      .mockResolvedValue()
    const { listen, deliver } = listenerOf()
    installReminderActions({ isReady: async () => {} }, handle, listen)

    deliver(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    deliver(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle).toHaveBeenCalledOnce()

    finishFirst()

    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2))
  })

  it('se désinscrit du plugin', () => {
    const { listen, stop } = listenerOf()

    installReminderActions({ isReady: async () => {} }, vi.fn(), listen)()

    expect(stop).toHaveBeenCalledOnce()
  })
})
