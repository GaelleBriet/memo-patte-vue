import { describe, expect, it, vi } from 'vitest'

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

    expect(flow.state.value).toEqual({ step: 'waiting-network' })
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

    expect(flow.state.value).toEqual({ step: 'checking' })
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

  it('attend le réseau quand le serveur ne répond pas avant le choix', () => {
    const flow = createRestoreFlow(fakeRunner())

    flow.unreachable()

    expect(flow.state.value).toEqual({ step: 'waiting-network' })
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

  it('répond tout de suite quand aucun contrôle n’est en cours', async () => {
    const flow = createRestoreFlow(fakeRunner())

    await expect(flow.whenChecked()).resolves.toEqual({ step: 'idle' })
  })

  it('garde le message de l’attente du réseau pendant un nouveau contrôle', () => {
    const flow = createRestoreFlow(fakeRunner())
    flow.unreachable()

    flow.checking()

    expect(flow.state.value).toEqual({ step: 'waiting-network' })
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
    expect(flow.state.value).toEqual({ step: 'checking' })
    expect(retried).toHaveBeenCalledOnce()
  })
})
