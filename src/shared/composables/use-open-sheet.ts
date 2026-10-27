import { computed, reactive, watch, type Ref } from 'vue'

const openSheets = reactive(new Set<symbol>())

/** Vrai tant qu'au moins une feuille du bas est affichée. */
export const isAnySheetOpen = computed(() => openSheets.size > 0)

/** Déclare la feuille ouverte tant que `open` est vrai et que son composant est monté. */
export function useOpenSheet(open: Readonly<Ref<boolean>>): void {
  const key = Symbol('feuille ouverte')

  watch(
    open,
    (isOpen, _previous, onCleanup) => {
      if (!isOpen) return
      openSheets.add(key)
      onCleanup(() => openSheets.delete(key))
    },
    { immediate: true },
  )
}
