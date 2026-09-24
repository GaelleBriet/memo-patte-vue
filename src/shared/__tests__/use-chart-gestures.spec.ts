import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { useChartGestures, type SwipeDirection } from '../composables/use-chart-gestures'

let scope: EffectScope
let pages: Record<SwipeDirection, boolean>
const pick = vi.fn<(clientX: number) => void>()
const turn = vi.fn<(direction: SwipeDirection) => void>()
const settle = vi.fn<(fromX: number) => void>()

function gestes() {
  return scope.run(() =>
    useChartGestures({ pick, turn, settle, hasPage: (direction) => pages[direction] }),
  )!
}

type Doigt = { x: number; y?: number; id?: number }

function pointeur({ x, y = 100, id = 1 }: Doigt) {
  return {
    pointerId: id,
    clientX: x,
    clientY: y,
    button: 0,
    currentTarget: { setPointerCapture: vi.fn<(pointerId: number) => void>() },
  } as unknown as PointerEvent
}

function deplacement() {
  return { cancelable: true, preventDefault: vi.fn<() => void>() }
}

beforeEach(() => {
  vi.useFakeTimers()
  scope = effectScope()
  pages = { [-1]: true, 1: true } as Record<SwipeDirection, boolean>
})

afterEach(() => {
  scope.stop()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('useChartGestures — toucher', () => {
  it('lit la pesée sous le doigt qui se lève sans avoir bougé', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    expect(pick).not.toHaveBeenCalled()
    listeners.pointerup(pointeur({ x: 100 }))

    expect(pick).toHaveBeenCalledExactlyOnceWith(100)
  })

  it('tolère un doigt qui tremble de 10 px', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100, y: 100 }))
    listeners.pointermove(pointeur({ x: 106, y: 108 }))
    listeners.pointerup(pointeur({ x: 106, y: 108 }))

    expect(pick).toHaveBeenCalledExactlyOnceWith(106)
    expect(turn).not.toHaveBeenCalled()
  })

  it('capture le doigt, pour qu’il pilote encore la courbe hors de son cadre', () => {
    const { listeners } = gestes()
    const appui = pointeur({ x: 100, id: 7 })

    listeners.pointerdown(appui)

    expect(
      (appui.currentTarget as unknown as { setPointerCapture: () => void }).setPointerCapture,
    ).toHaveBeenCalledWith(7)
  })
})

describe('useChartGestures — appui long', () => {
  it('parcourt les pesées au bout de 400 ms, pas avant', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    vi.advanceTimersByTime(399)
    expect(pick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(pick).toHaveBeenCalledExactlyOnceWith(100)
  })

  it('suit le doigt posé, puis s’arrête à son lever sans autre lecture', () => {
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    vi.advanceTimersByTime(400)
    listeners.pointermove(pointeur({ x: 180 }))
    listeners.pointermove(pointeur({ x: 40 }))
    listeners.pointerup(pointeur({ x: 40 }))

    expect(pick.mock.calls).toEqual([[100], [180], [40]])
    expect(dragX.value).toBe(0)
    expect(turn).not.toHaveBeenCalled()
  })

  it('garde l’appui long d’un doigt qui n’a bougé que de 10 px', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 110 }))
    vi.advanceTimersByTime(400)

    expect(pick).toHaveBeenCalledExactlyOnceWith(110)
  })

  it('renonce à l’appui long dès 11 px', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 111 }))
    vi.advanceTimersByTime(400)

    expect(pick).not.toHaveBeenCalled()
  })

  it('bloque le défilement de l’écran pendant qu’il parcourt les pesées', () => {
    const { listeners } = gestes()
    listeners.pointerdown(pointeur({ x: 100 }))
    const avant = deplacement()
    listeners.touchmove(avant as unknown as TouchEvent)

    vi.advanceTimersByTime(400)
    const pendant = deplacement()
    listeners.touchmove(pendant as unknown as TouchEvent)

    expect(avant.preventDefault).not.toHaveBeenCalled()
    expect(pendant.preventDefault).toHaveBeenCalledOnce()
  })

  it('efface son minuteur quand la courbe disparaît', () => {
    const { listeners } = gestes()
    listeners.pointerdown(pointeur({ x: 100 }))

    scope.stop()

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useChartGestures — glisser', () => {
  it('fait suivre la courbe au doigt qui glisse à l’horizontale', () => {
    const { listeners, dragX } = gestes()
    listeners.pointerdown(pointeur({ x: 100 }))

    listeners.pointermove(pointeur({ x: 160 }))
    const deplace = deplacement()
    listeners.touchmove(deplace as unknown as TouchEvent)

    expect(dragX.value).toBe(60)
    expect(deplace.preventDefault).toHaveBeenCalledOnce()
  })

  it('tourne la page à 50 px de glisser, pas à 46', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 146 }))
    listeners.pointerup(pointeur({ x: 146 }))
    expect(turn).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledExactlyOnceWith(46)

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 150 }))
    listeners.pointerup(pointeur({ x: 150 }))
    expect(turn).toHaveBeenCalledExactlyOnceWith(-1)
  })

  it('va à la page suivante quand le doigt glisse vers la gauche', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 200 }))
    listeners.pointermove(pointeur({ x: 120 }))
    listeners.pointerup(pointeur({ x: 120 }))

    expect(turn).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('résiste au bout : la courbe suit le doigt au quart et revient, sans tourner', () => {
    pages[1] = false
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 200 }))
    listeners.pointermove(pointeur({ x: 80 }))
    expect(dragX.value).toBe(-30)

    listeners.pointerup(pointeur({ x: 80 }))
    expect(turn).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledExactlyOnceWith(-30)
    expect(dragX.value).toBe(0)
  })

  it('laisse l’écran défiler sous un doigt parti à la verticale, sans bouger la courbe', () => {
    const { listeners, dragX } = gestes()
    listeners.pointerdown(pointeur({ x: 100, y: 100 }))

    listeners.pointermove(pointeur({ x: 104, y: 160 }))
    const deplace = deplacement()
    listeners.touchmove(deplace as unknown as TouchEvent)
    listeners.pointerup(pointeur({ x: 104, y: 160 }))

    expect(dragX.value).toBe(0)
    expect(deplace.preventDefault).not.toHaveBeenCalled()
    expect(pick).not.toHaveBeenCalled()
    expect(turn).not.toHaveBeenCalled()
  })

  it('ne tourne pas la page quand le navigateur reprend un glisser de plus de 48 px', () => {
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 180 }))
    listeners.pointercancel(pointeur({ x: 180 }))

    expect(turn).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledExactlyOnceWith(80)
    expect(dragX.value).toBe(0)
  })

  it('traite la capture perdue comme un geste repris : l’appui suivant fonctionne', () => {
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 180 }))
    listeners.lostpointercapture(pointeur({ x: 180 }))
    expect(dragX.value).toBe(0)
    expect(turn).not.toHaveBeenCalled()

    listeners.pointerdown(pointeur({ x: 60, id: 2 }))
    listeners.pointerup(pointeur({ x: 60, id: 2 }))
    expect(pick).toHaveBeenCalledExactlyOnceWith(60)
  })

  it('ignore la capture perdue au lever normal du doigt', () => {
    const { listeners } = gestes()

    listeners.pointerdown(pointeur({ x: 100 }))
    listeners.pointermove(pointeur({ x: 180 }))
    listeners.pointerup(pointeur({ x: 180 }))
    listeners.lostpointercapture(pointeur({ x: 180 }))

    expect(turn).toHaveBeenCalledOnce()
    expect(settle).not.toHaveBeenCalled()
  })
})

describe('useChartGestures — plusieurs doigts', () => {
  it('ignore un second doigt posé pendant le geste', () => {
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 100, id: 1 }))
    listeners.pointerdown(pointeur({ x: 250, id: 2 }))
    listeners.pointermove(pointeur({ x: 300, id: 2 }))
    listeners.pointerup(pointeur({ x: 300, id: 2 }))

    expect(dragX.value).toBe(0)
    expect(pick).not.toHaveBeenCalled()
    expect(turn).not.toHaveBeenCalled()

    listeners.pointerup(pointeur({ x: 100, id: 1 }))
    expect(pick).toHaveBeenCalledExactlyOnceWith(100)
  })

  it('ne laisse pas un autre doigt terminer ni annuler le geste', () => {
    const { listeners, dragX } = gestes()

    listeners.pointerdown(pointeur({ x: 100, id: 1 }))
    listeners.pointermove(pointeur({ x: 170, id: 1 }))
    listeners.pointercancel(pointeur({ x: 170, id: 2 }))
    listeners.lostpointercapture(pointeur({ x: 170, id: 2 }))

    expect(dragX.value).toBe(70)
    expect(settle).not.toHaveBeenCalled()
  })

  it('ignore le bouton droit d’une souris', () => {
    const { listeners } = gestes()

    listeners.pointerdown({ ...pointeur({ x: 100 }), button: 2 } as PointerEvent)
    listeners.pointerup(pointeur({ x: 100 }))

    expect(pick).not.toHaveBeenCalled()
  })
})

describe('useChartGestures — menu du navigateur', () => {
  it('n’ouvre pas le menu contextuel d’un appui long', () => {
    const { listeners } = gestes()
    const menu = { preventDefault: vi.fn<() => void>() }

    listeners.contextmenu(menu as unknown as Event)

    expect(menu.preventDefault).toHaveBeenCalledOnce()
  })
})
