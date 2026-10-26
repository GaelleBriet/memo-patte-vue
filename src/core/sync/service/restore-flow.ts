import { readonly, shallowRef, watch, type Ref } from 'vue'

import { errorSummary, localErrorMessage } from '@/shared/utils/error-summary'
import type { RestoreMode } from '../repository/sync-state.repository'
import type { AccountRestore, RestoreProgress, RestoreRunResult } from './account-restore'
import type { BackupSummary } from './backup-summary'

export type RestoreFlowState =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'no-answer' }
  | { step: 'choice'; summary: BackupSummary }
  | { step: 'restoring'; progress: RestoreProgress }
  | { step: 'waiting-network' }
  | { step: 'done' }

export type RestoreRunner = Pick<
  AccountRestore,
  'pendingMode' | 'start' | 'run' | 'progress' | 'onProgress'
>

/**
 * Ce que l'écran « Restaurer mon carnet » montre : le choix, la progression, l'attente du réseau
 * ou le carnet prêt. Aucune méthode ne lève.
 */
export function createRestoreFlow(runner: RestoreRunner) {
  const state = shallowRef<RestoreFlowState>({ step: 'idle' })
  const restoredListeners = new Set<() => void>()
  const retryListeners = new Set<() => void>()

  function retryCheck(): void {
    state.value = { step: 'checking' }
    for (const listener of retryListeners) listener()
  }

  async function runPending(): Promise<boolean> {
    let shown: RestoreFlowState = { step: 'restoring', progress: runner.progress }
    state.value = shown
    const stop = runner.onProgress((progress) => {
      if (state.value !== shown) return
      shown = { step: 'restoring', progress }
      state.value = shown
    })
    let result: RestoreRunResult
    try {
      result = await runner.run()
    } catch (cause) {
      console.warn('Restauration interrompue, elle reprendra :', errorSummary(cause))
      state.value = { step: 'waiting-network' }
      return false
    } finally {
      stop()
    }
    if (result === 'carnet-changed') {
      retryCheck()
      return false
    }
    if (result === 'nothing-to-restore') {
      if (state.value === shown) state.value = { step: 'idle' }
      return false
    }
    state.value = { step: 'done' }
    for (const listener of restoredListeners) listener()
    return true
  }

  return {
    state: readonly(state) as Readonly<Ref<RestoreFlowState>>,

    /** Sans effet sur un écran déjà affiché : il garde son message jusqu'à la réponse. */
    checking(): void {
      if (state.value.step === 'idle') state.value = { step: 'checking' }
    },

    /** Ce que le contrôle de la sauvegarde a trouvé, dès qu'il a répondu. */
    whenChecked(): Promise<RestoreFlowState> {
      if (state.value.step !== 'checking') return Promise.resolve(state.value)
      return new Promise((resolve) => {
        const stop = watch(
          state,
          (current) => {
            if (current.step === 'checking') return
            stop()
            resolve(current)
          },
          { flush: 'sync' },
        )
      })
    },

    /** Le serveur n'a pas répondu à temps au contrôle de la sauvegarde. */
    noAnswer(): void {
      state.value = { step: 'no-answer' }
    },

    /** « Réessayer » : le contrôle de la sauvegarde est redemandé tout de suite. */
    retryCheck,

    onRetryCheck(listener: () => void): () => void {
      retryListeners.add(listener)
      return () => retryListeners.delete(listener)
    },

    offer(summary: BackupSummary): void {
      state.value = { step: 'choice', summary }
    },

    unreachable(): void {
      state.value = { step: 'waiting-network' }
    },

    reset(): void {
      state.value = { step: 'idle' }
    },

    /** Garde le choix (il survit à un redémarrage), puis restaure ; `false` si le réseau a coupé, si le choix est à refaire ou s'il n'y avait rien à restaurer. */
    async choose(mode: RestoreMode): Promise<boolean> {
      try {
        await runner.start(mode)
      } catch (cause) {
        console.warn('Choix de restauration non gardé :', errorSummary(cause))
        state.value = { step: 'waiting-network' }
        return false
      }
      return runPending()
    },

    /** Reprend une restauration déjà choisie ; `false` s'il n'y en a pas, si le réseau a coupé, si le choix est à refaire ou s'il n'y avait rien à restaurer. */
    async resume(): Promise<boolean> {
      let pending: RestoreMode | null
      try {
        pending = await runner.pendingMode()
      } catch (cause) {
        console.warn(
          'Restauration en attente non lue :',
          errorSummary(cause),
          localErrorMessage(cause),
        )
        return false
      }
      return pending === null ? false : runPending()
    },

    onRestored(listener: () => void): () => void {
      restoredListeners.add(listener)
      return () => restoredListeners.delete(listener)
    },
  }
}

export type RestoreFlow = ReturnType<typeof createRestoreFlow>

const provided = shallowRef<RestoreFlow | null>(null)

/** Branché au démarrage avec la synchro (`app/sync.ts`). */
export function provideRestoreFlow(flow: RestoreFlow | null): void {
  provided.value = flow
}

/** `null` tant que la synchro n'est pas branchée. */
export function currentRestoreFlow(): RestoreFlow | null {
  return provided.value
}
