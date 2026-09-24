import { onScopeDispose, readonly, ref, type Ref } from 'vue'

/** `-1` : pesées précédentes, le doigt glisse vers la droite ; `1` : pesées suivantes. */
export type SwipeDirection = -1 | 1

export type ChartGestureCallbacks = {
  /** Toucher, ou chaque déplacement du doigt après un appui long. */
  pick: (clientX: number) => void
  hasPage: (direction: SwipeDirection) => boolean
  turn: (direction: SwipeDirection) => void
  /** Glisser relâché sans changer de page : la courbe revient depuis `fromX`. */
  settle: (fromX: number) => void
}

const LONG_PRESS_MS = 400
const TOUCH_SLOP_PX = 10
const SWIPE_PX = 48
const EDGE_RESISTANCE = 0.25

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  mode: 'pending' | 'swipe' | 'scrub' | 'ignored'
  timer: ReturnType<typeof setTimeout>
}

/** Toucher lit une pesée, appui long puis glisser les parcourt, glisser change de page. */
export function useChartGestures({ pick, hasPage, turn, settle }: ChartGestureCallbacks): {
  dragX: Readonly<Ref<number>>
  listeners: {
    pointerdown: (event: PointerEvent) => void
    pointermove: (event: PointerEvent) => void
    pointerup: (event: PointerEvent) => void
    pointercancel: (event: PointerEvent) => void
    lostpointercapture: (event: PointerEvent) => void
    touchmove: (event: TouchEvent) => void
    contextmenu: (event: Event) => void
  }
} {
  const dragX = ref(0)
  let gesture: Gesture | null = null

  const directionOf = (dx: number): SwipeDirection => (dx > 0 ? -1 : 1)

  function startScrub(): void {
    if (gesture?.mode !== 'pending') return
    gesture.mode = 'scrub'
    pick(gesture.lastX)
  }

  function end(event: PointerEvent): Gesture | null {
    if (!gesture || event.pointerId !== gesture.pointerId) return null
    const ended = gesture
    clearTimeout(ended.timer)
    gesture = null
    return ended
  }

  function release(dx: number): void {
    const from = dragX.value
    dragX.value = 0
    const direction = directionOf(dx)
    if (Math.abs(dx) >= SWIPE_PX && hasPage(direction)) turn(direction)
    else settle(from)
  }

  // Le navigateur reprend le geste pour faire défiler l'écran, ou le doigt perd la capture.
  function abandon(event: PointerEvent): void {
    if (end(event)?.mode === 'swipe') release(0)
  }

  onScopeDispose(() => {
    if (gesture) clearTimeout(gesture.timer)
  })

  return {
    dragX: readonly(dragX),
    listeners: {
      pointerdown(event) {
        if (gesture || event.button > 0) return
        ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
        gesture = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          mode: 'pending',
          timer: setTimeout(startScrub, LONG_PRESS_MS),
        }
      },
      pointermove(event) {
        if (!gesture || event.pointerId !== gesture.pointerId) return
        gesture.lastX = event.clientX
        const dx = event.clientX - gesture.startX
        const dy = event.clientY - gesture.startY
        if (gesture.mode === 'pending' && Math.hypot(dx, dy) > TOUCH_SLOP_PX) {
          clearTimeout(gesture.timer)
          gesture.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'ignored'
        }
        if (gesture.mode === 'swipe') {
          dragX.value = hasPage(directionOf(dx)) ? dx : dx * EDGE_RESISTANCE
        } else if (gesture.mode === 'scrub') pick(event.clientX)
      },
      pointerup(event) {
        const ended = end(event)
        if (ended?.mode === 'pending') pick(event.clientX)
        else if (ended?.mode === 'swipe') release(event.clientX - ended.startX)
      },
      pointercancel: abandon,
      lostpointercapture: abandon,
      touchmove(event) {
        if (event.cancelable && (gesture?.mode === 'scrub' || gesture?.mode === 'swipe')) {
          event.preventDefault()
        }
      },
      contextmenu(event) {
        event.preventDefault()
      },
    },
  }
}
