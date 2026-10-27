import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { RestoreMode } from '../repository/sync-state.repository'
import type { RestoreProgress } from '../service/account-restore'
import { createRestoreFlow, type RestoreRunner } from '../service/restore-flow'

const SUMMARY = { animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.000Z' }

function fakeRunner(overrides: Partial<RestoreRunner> = {}) {
  let pending: RestoreMode | null = null
  const listeners = new Set<(progress: RestoreProgress) => void>()
  const runner: RestoreRunner & { emit(progress: RestoreProgress): void } = {
    pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => pending),
    start: vi.fn<RestoreRunner['start']>(async (mode: RestoreMode) => {
      pending = mode
    }),
    run: vi.fn<RestoreRunner['run']>(async () => {
      pending = null
      return 'restored'
    }),
    progress: { done: 0, total: 0 },
    onProgress(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(progress) {
      for (const listener of listeners) listener(progress)
    },
    ...overrides,
  }
  return runner
}

describe('parcours de restauration', () => {
  it('ne propose rien tant que le contrôle n’a pas trouvé de sauvegarde', () => {
    const flow = createRestoreFlow(fakeRunner())

    expect(flow.state.value).toEqual({ step: 'idle' })
  })

  it('propose le choix avec le résumé de la sauvegarde trouvée', () => {
    const flow = createRestoreFlow(fakeRunner())

    flow.offer(SUMMARY)

    expect(flow.state.value).toEqual({ step: 'choice', summary: SUMMARY })
  })

  it('garde le choix puis restaure, en suivant la progression, jusqu’au carnet prêt', async () => {
    let finish: () => void = () => {}
    const runner = fakeRunner()
    runner.run = vi.fn<RestoreRunner['run']>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('restored')
        }),
    )
    const flow = createRestoreFlow(runner)
    flow.offer(SUMMARY)

    const choosing = flow.choose('replace')
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledOnce())
    expect(runner.start).toHaveBeenCalledWith('replace')
    expect(flow.state.value).toEqual({ step: 'restoring', progress: { done: 0, total: 0 } })

    runner.emit({ done: 120, total: 348 })
    expect(flow.state.value).toEqual({ step: 'restoring', progress: { done: 120, total: 348 } })

    finish()
    await choosing
    expect(flow.state.value).toEqual({ step: 'done' })
  })

  it('attend le réseau quand la restauration coupe, sans lever', async () => {
    const runner = fakeRunner({
      run: vi.fn<RestoreRunner['run']>(async () => {
        throw new Error('réseau coupé')
      }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)

    await expect(flow.choose('merge')).resolves.toBe(false)

    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
  })

  it('carnet du téléphone changé depuis « Remplacer » : redemande le contrôle pour reproposer le choix', async () => {
    const runner = fakeRunner({
      run: vi.fn<RestoreRunner['run']>(async () => 'carnet-changed'),
    })
    const flow = createRestoreFlow(runner)
    const restored = vi.fn<() => void>()
    const retried = vi.fn<() => void>()
    flow.onRestored(restored)
    flow.onRetryCheck(retried)
    await runner.start('replace')

    await expect(flow.resume()).resolves.toBe(false)

    expect(flow.state.value).toEqual({ step: 'checking', chosen: true })
    expect(retried).toHaveBeenCalledOnce()
    expect(restored).not.toHaveBeenCalled()
  })

  it('rien à restaurer : le carnet n’est pas annoncé prêt, le parcours repart de rien', async () => {
    const runner = fakeRunner({
      run: vi.fn<RestoreRunner['run']>(async () => 'nothing-to-restore'),
    })
    const flow = createRestoreFlow(runner)
    const restored = vi.fn<() => void>()
    flow.onRestored(restored)
    await runner.start('merge')

    await expect(flow.resume()).resolves.toBe(false)

    expect(flow.state.value).toEqual({ step: 'idle' })
    expect(restored).not.toHaveBeenCalled()
  })

  it('rien à restaurer après plusieurs paliers de progression : le parcours repart de rien', async () => {
    let finish: () => void = () => {}
    const runner = fakeRunner()
    runner.run = vi.fn<RestoreRunner['run']>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('nothing-to-restore')
        }),
    )
    const flow = createRestoreFlow(runner)
    const choosing = flow.choose('merge')
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledOnce())

    runner.emit({ done: 0, total: 10 })
    runner.emit({ done: 5, total: 10 })
    expect(flow.state.value).toEqual({ step: 'restoring', progress: { done: 5, total: 10 } })

    finish()
    await expect(choosing).resolves.toBe(false)
    expect(flow.state.value).toEqual({ step: 'idle' })
  })

  it('« Fusionner » d’un compte qui finit après l’arrivée d’un autre : le choix du nouveau compte reste affiché', async () => {
    let finish: () => void = () => {}
    const runner = fakeRunner()
    runner.run = vi.fn<RestoreRunner['run']>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('nothing-to-restore')
        }),
    )
    const flow = createRestoreFlow(runner)
    const restored = vi.fn<() => void>()
    flow.onRestored(restored)
    flow.offer(SUMMARY)
    const choosing = flow.choose('merge')
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledOnce())

    const otherSummary = { animalCount: 1, lastBackupAt: '2026-10-25T08:30:00.000Z' }
    flow.reset()
    flow.checking()
    flow.offer(otherSummary)
    runner.emit({ done: 120, total: 348 })
    expect(flow.state.value).toEqual({ step: 'choice', summary: otherSummary })

    finish()
    await expect(choosing).resolves.toBe(false)
    expect(flow.state.value).toEqual({ step: 'choice', summary: otherSummary })
    expect(restored).not.toHaveBeenCalled()
  })

  it('réseau coupé pendant la restauration d’un compte après l’arrivée d’un autre : le choix du nouveau compte reste affiché', async () => {
    let cut: () => void = () => {}
    let pending: RestoreMode | null = null
    const runner = fakeRunner({
      pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => pending),
      start: vi.fn<RestoreRunner['start']>(async (mode: RestoreMode) => {
        pending = mode
      }),
    })
    runner.run = vi.fn<RestoreRunner['run']>(
      () =>
        new Promise((_resolve, reject) => {
          cut = () => reject(new Error('réseau coupé'))
        }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)
    flow.offer(SUMMARY)
    const choosing = flow.choose('merge')
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledOnce())

    const otherSummary = { animalCount: 1, lastBackupAt: '2026-10-25T08:30:00.000Z' }
    pending = null
    flow.reset()
    flow.checking()
    flow.offer(otherSummary)

    cut()
    await expect(choosing).resolves.toBe(false)
    expect(flow.state.value).toEqual({ step: 'choice', summary: otherSummary })

    await expect(flow.resume()).resolves.toBe(false)
    expect(runner.run).toHaveBeenCalledOnce()
    expect(flow.state.value).toEqual({ step: 'choice', summary: otherSummary })
  })

  it('réseau coupé pendant une restauration suivie par deux appels : l’écran attend le réseau, restauration choisie', async () => {
    let cut: () => void = () => {}
    const shared = new Promise<never>((_resolve, reject) => {
      cut = () => reject(new Error('réseau coupé'))
    })
    const runner = fakeRunner({
      pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => 'merge'),
      run: vi.fn<RestoreRunner['run']>(() => shared),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)

    const first = flow.resume()
    const second = flow.resume()
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2))

    cut()
    await expect(Promise.all([first, second])).resolves.toEqual([false, false])
    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
  })

  it('réseau coupé pendant deux appels d’un compte après l’arrivée d’un autre : le choix du nouveau compte reste affiché', async () => {
    let cut: () => void = () => {}
    const shared = new Promise<never>((_resolve, reject) => {
      cut = () => reject(new Error('réseau coupé'))
    })
    const runner = fakeRunner({
      pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => 'merge'),
      run: vi.fn<RestoreRunner['run']>(() => shared),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)
    const first = flow.resume()
    const second = flow.resume()
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2))

    const otherSummary = { animalCount: 1, lastBackupAt: '2026-10-25T08:30:00.000Z' }
    flow.reset()
    flow.checking()
    flow.offer(otherSummary)

    cut()
    await expect(Promise.all([first, second])).resolves.toEqual([false, false])
    expect(flow.state.value).toEqual({ step: 'choice', summary: otherSummary })
  })

  it('journalise le message d’une lecture ratée de la restauration en attente, en développement', async () => {
    vi.stubEnv('DEV', true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(
      fakeRunner({
        pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => {
          throw new Error('sync_state introuvable')
        }),
      }),
    )

    await expect(flow.resume()).resolves.toBe(false)

    expect(warn).toHaveBeenCalledWith(
      'Restauration en attente non lue :',
      'Error',
      'sync_state introuvable',
    )
    vi.unstubAllEnvs()
  })

  it('reprend une restauration choisie et prévient de chaque restauration réussie', async () => {
    const runner = fakeRunner()
    const flow = createRestoreFlow(runner)
    const restored = vi.fn<() => void>()
    flow.onRestored(restored)
    await runner.start('merge')

    await expect(flow.resume()).resolves.toBe(true)

    expect(runner.run).toHaveBeenCalledOnce()
    expect(restored).toHaveBeenCalledOnce()
    expect(flow.state.value).toEqual({ step: 'done' })
  })

  it('ne touche à rien quand aucune restauration n’a été choisie', async () => {
    const runner = fakeRunner()
    const flow = createRestoreFlow(runner)
    flow.offer(SUMMARY)

    await expect(flow.resume()).resolves.toBe(false)

    expect(runner.run).not.toHaveBeenCalled()
    expect(flow.state.value).toEqual({ step: 'choice', summary: SUMMARY })
  })

  it('attend le réseau quand le choix n’a pas pu être gardé : la restauration reste choisie', async () => {
    const runner = fakeRunner({
      start: vi.fn<RestoreRunner['start']>(async () => {
        throw new Error('base fermée')
      }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)

    await expect(flow.choose('replace')).resolves.toBe(false)

    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
  })

  it('attend le réseau quand une restauration reprise coupe', async () => {
    const runner = fakeRunner({
      pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => 'merge'),
      run: vi.fn<RestoreRunner['run']>(async () => {
        throw new Error('réseau coupé')
      }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = createRestoreFlow(runner)

    await expect(flow.resume()).resolves.toBe(false)

    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
  })

  it('attend le réseau quand le serveur ne répond pas avant le choix', () => {
    const flow = createRestoreFlow(fakeRunner())

    flow.unreachable()

    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: false })
  })

  it('repart de rien quand le compte change ou n’a rien à restaurer', () => {
    const flow = createRestoreFlow(fakeRunner())
    flow.offer(SUMMARY)

    flow.reset()

    expect(flow.state.value).toEqual({ step: 'idle' })
  })

  it('pendant le contrôle de la sauvegarde, fait attendre la connexion jusqu’à sa réponse', async () => {
    const flow = createRestoreFlow(fakeRunner())
    flow.checking()

    const checked = flow.whenChecked()
    flow.offer(SUMMARY)

    await expect(checked).resolves.toEqual({ step: 'choice', summary: SUMMARY })
  })

  it('le premier contrôle de la sauvegarde ne suit aucun choix', () => {
    const flow = createRestoreFlow(fakeRunner())

    flow.checking()

    expect(flow.state.value).toEqual({ step: 'checking', chosen: false })
  })

  it('répond tout de suite quand aucun contrôle n’est en cours', async () => {
    const flow = createRestoreFlow(fakeRunner())

    await expect(flow.whenChecked()).resolves.toEqual({ step: 'idle' })
  })

  it('garde le message de l’attente du réseau pendant un nouveau contrôle', () => {
    const flow = createRestoreFlow(fakeRunner())
    flow.unreachable()

    flow.checking()

    expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: false })
  })

  it('sans réponse du serveur à temps : la connexion l’apprend, puis peut redemander le contrôle', async () => {
    const flow = createRestoreFlow(fakeRunner())
    const retried = vi.fn<() => void>()
    flow.onRetryCheck(retried)
    flow.checking()
    const checked = flow.whenChecked()

    flow.noAnswer()
    await expect(checked).resolves.toEqual({ step: 'no-answer' })

    flow.retryCheck()
    expect(flow.state.value).toEqual({ step: 'checking', chosen: false })
    expect(retried).toHaveBeenCalledOnce()
  })

  describe('session expirée pendant l’attente du réseau', () => {
    it('attend la reconnexion, restauration choisie, puis de nouveau le réseau une fois reconnecté', async () => {
      const runner = fakeRunner({
        run: vi.fn<RestoreRunner['run']>(async () => {
          throw new Error('réseau coupé')
        }),
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const expired = ref(false)
      const flow = createRestoreFlow(runner, () => expired.value)
      await flow.choose('merge')

      expired.value = true
      expect(flow.state.value).toEqual({ step: 'waiting-sign-in', chosen: true })

      expired.value = false
      expect(flow.state.value).toEqual({ step: 'waiting-network', chosen: true })
    })

    it('attend aussi la reconnexion quand le contrôle de la sauvegarde n’a pas abouti', () => {
      const flow = createRestoreFlow(fakeRunner(), () => true)

      flow.unreachable()

      expect(flow.state.value).toEqual({ step: 'waiting-sign-in', chosen: false })
    })

    it('ne change rien aux autres étapes', () => {
      const flow = createRestoreFlow(fakeRunner(), () => true)

      flow.offer(SUMMARY)

      expect(flow.state.value).toEqual({ step: 'choice', summary: SUMMARY })
    })
  })
})
