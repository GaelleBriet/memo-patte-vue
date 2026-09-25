import { ref, shallowRef, watch, type Ref } from 'vue'

import { useAppResume } from '@/core/app-lifecycle/app-resume'

export type DetailState = 'loading' | 'ready' | 'not-found' | 'error'

/**
 * Données d'un écran de détail, lues à chaque changement d'identifiant, au retour au premier plan
 * et sur demande. `load` rend `null` pour un élément introuvable ; un échec après un premier
 * chargement réussi laisse les données affichées.
 */
export function useDetailLoad<T>(id: () => string, load: (id: string) => Promise<T | null>) {
  const data = shallowRef<T | null>(null) as Ref<T | null>
  const state = ref<DetailState>('loading')

  async function reload(): Promise<void> {
    const current = id()
    try {
      const found = await load(current)
      if (id() !== current) return
      data.value = found
      state.value = found === null ? 'not-found' : 'ready'
    } catch {
      if (id() === current && state.value !== 'ready') state.value = 'error'
    }
  }

  watch(id, () => void reload(), { immediate: true })
  useAppResume(() => void reload())

  return { data, state, reload }
}
