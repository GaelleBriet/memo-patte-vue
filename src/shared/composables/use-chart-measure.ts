import { readonly, ref, watch, type Ref, type ShallowRef } from 'vue'

import { CHART_FONT_PX } from '../domain/weight-chart'

/**
 * Largeur rendue d'une courbe, arrondie au pixel (`initialWidth` tant qu'elle n'est pas mesurée), et
 * agrandissement de son texte : la taille de police rendue d'un de ses textes sur `CHART_FONT_PX`.
 */
export function useChartMeasure(
  target: Readonly<ShallowRef<Element | null>>,
  initialWidth: number,
): { width: Readonly<Ref<number>>; textScale: Readonly<Ref<number>> } {
  const width = ref(initialWidth)
  const textScale = ref(1)

  watch(
    target,
    (element, _previous, onCleanup) => {
      if (!element) return
      const observer = new ResizeObserver(() => {
        const measured = element.getBoundingClientRect().width
        if (measured > 0) width.value = Math.round(measured)
        const text = element.querySelector('text')
        const fontSize = text ? parseFloat(getComputedStyle(text).fontSize) : NaN
        if (fontSize > 0) textScale.value = Math.round((fontSize / CHART_FONT_PX) * 100) / 100
      })
      observer.observe(element)
      onCleanup(() => observer.disconnect())
    },
    { immediate: true, flush: 'post' },
  )

  return { width: readonly(width), textScale: readonly(textScale) }
}
