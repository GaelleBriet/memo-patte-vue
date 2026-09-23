import { readonly, ref, watch, type Ref, type ShallowRef } from 'vue'

/** Largeur rendue de l'élément, arrondie au pixel ; `initialWidth` tant qu'il n'est pas mesuré. */
export function useElementWidth(
  target: Readonly<ShallowRef<Element | null>>,
  initialWidth: number,
): Readonly<Ref<number>> {
  const width = ref(initialWidth)

  watch(
    target,
    (element, _previous, onCleanup) => {
      if (!element) return
      const observer = new ResizeObserver(() => {
        const measured = element.getBoundingClientRect().width
        if (measured > 0) width.value = Math.round(measured)
      })
      observer.observe(element)
      onCleanup(() => observer.disconnect())
    },
    { immediate: true, flush: 'post' },
  )

  return readonly(width)
}
