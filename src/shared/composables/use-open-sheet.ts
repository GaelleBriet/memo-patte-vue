import { computed, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'

export const SHEET_REQUEST_TIMEOUT_MS = 5000

const openSheets = reactive(new Set<symbol>())
const openings = ref(0)

/** Vrai tant qu'au moins une feuille du bas est affichée ou demandée. */
export const isAnySheetOpen = computed(() => openSheets.size > 0)

/** Déclare la feuille ouverte tant que `open` est vrai et que son composant est monté. */
export function useOpenSheet(open: Readonly<Ref<boolean>>): void {
  const key = Symbol('feuille ouverte')

  watch(
    open,
    (isOpen, _previous, onCleanup) => {
      if (!isOpen) return
      openSheets.add(key)
      openings.value++
      onCleanup(() => openSheets.delete(key))
    },
    { immediate: true },
  )
}

/**
 * Compte une feuille demandée comme ouverte, de `hold()` jusqu'à l'affichage d'une feuille,
 * `release()`, `SHEET_REQUEST_TIMEOUT_MS` ou le démontage.
 */
export function useSheetRequest(): { hold: () => void; release: () => void } {
  const key = Symbol('feuille demandée')
  let timer: ReturnType<typeof setTimeout> | undefined

  function release(): void {
    clearTimeout(timer)
    timer = undefined
    openSheets.delete(key)
  }

  function hold(): void {
    release()
    openSheets.add(key)
    timer = setTimeout(release, SHEET_REQUEST_TIMEOUT_MS)
  }

  watch(openings, release)
  onScopeDispose(release)

  return { hold, release }
}
