import { computed, reactive, watch, type Ref } from 'vue'

const heights = reactive(new Map<symbol, number>())

/** Hauteur de la plus haute barre fixe du bas affichée (px), 0 sans barre : le toast se pose au-dessus. */
export const fixedBottomBarHeight = computed(() => Math.max(0, ...heights.values()))

/** Déclare `bar` comme barre fixe du bas tant qu'elle est rendue, à sa hauteur mesurée. */
export function useFixedBottomBar(bar: Readonly<Ref<HTMLElement | null>>): void {
  const key = Symbol('barre fixe du bas')

  watch(
    bar,
    (element, _previous, onCleanup) => {
      if (!element) return
      const observer = new ResizeObserver(() => {
        heights.set(key, Math.ceil(element.getBoundingClientRect().height))
      })
      observer.observe(element)
      onCleanup(() => {
        observer.disconnect()
        heights.delete(key)
      })
    },
    { immediate: true, flush: 'post' },
  )
}
