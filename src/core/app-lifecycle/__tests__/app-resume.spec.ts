import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, h } from 'vue'

import { onAppResume, useAppResume } from '../app-resume'
import { useForegroundRefresh } from '../use-foreground-refresh'
import { useToday } from '../use-today'
import { simulateWebResume } from './simulate-resume'

type AddResumeListener = (event: string, callback: () => void) => Promise<PluginListenerHandle>

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn<AddResumeListener>() },
}))

const addListener = App.addListener as unknown as Mock<AddResumeListener>

function withSetup(setup: () => void) {
  return mount(
    defineComponent({
      setup() {
        setup()
        return () => h('p')
      },
    }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('onAppResume — navigateur', () => {
  it('prévient chaque abonné quand la page redevient visible', () => {
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const stopFirst = onAppResume(first)
    const stopSecond = onAppResume(second)

    simulateWebResume()

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    stopFirst()
    stopSecond()
  })

  it('ignore le passage en arrière-plan', () => {
    const listener = vi.fn<() => void>()
    const stop = onAppResume(listener)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    document.dispatchEvent(new Event('visibilitychange'))

    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('ne prévient plus un abonné désinscrit', () => {
    const listener = vi.fn<() => void>()
    onAppResume(listener)()

    simulateWebResume()

    expect(listener).not.toHaveBeenCalled()
  })

  it('n’écoute pas le plugin natif', () => {
    const stop = onAppResume(vi.fn<() => void>())

    expect(addListener).not.toHaveBeenCalled()
    stop()
  })
})

describe('onAppResume — natif', () => {
  const remove = vi.fn<() => Promise<void>>(async () => {})
  let emitResume: () => void

  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    addListener.mockReset()
    remove.mockClear()
    addListener.mockImplementation(async (_event, callback) => {
      emitResume = callback
      return { remove }
    })
  })

  it('écoute une seule fois l’événement resume du plugin App, quel que soit le nombre d’abonnés', () => {
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const stopFirst = onAppResume(first)
    const stopSecond = onAppResume(second)

    emitResume()

    expect(addListener).toHaveBeenCalledExactlyOnceWith('resume', expect.any(Function))
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    stopFirst()
    stopSecond()
  })

  it('ignore visibilitychange, pour ne pas prévenir deux fois', () => {
    const listener = vi.fn<() => void>()
    const stop = onAppResume(listener)

    simulateWebResume()

    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('ne laisse pas de rejet non géré si le plugin refuse l’écoute', async () => {
    addListener.mockRejectedValueOnce(new Error('plugin absent'))
    const unhandled = vi.fn<(reason: unknown) => void>()
    process.on('unhandledRejection', unhandled)

    const stop = onAppResume(vi.fn<() => void>())
    stop()
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('retire l’écoute du plugin quand le dernier abonné part', async () => {
    const stopFirst = onAppResume(vi.fn<() => void>())
    const stopSecond = onAppResume(vi.fn<() => void>())

    stopFirst()
    await Promise.resolve()
    expect(remove).not.toHaveBeenCalled()

    stopSecond()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })
})

describe('useAppResume', () => {
  it('appelle le rappel au retour et se désabonne au démontage', () => {
    const callback = vi.fn<() => void>()
    const wrapper = withSetup(() => useAppResume(callback))

    simulateWebResume()
    expect(callback).toHaveBeenCalledOnce()

    wrapper.unmount()
    simulateWebResume()
    expect(callback).toHaveBeenCalledOnce()
  })
})

describe('useForegroundRefresh', () => {
  function mountWith(reload: () => void) {
    let today!: ReturnType<typeof useForegroundRefresh>['today']
    const wrapper = withSetup(() => {
      today = useForegroundRefresh(reload).today
    })
    return { wrapper, today: () => today.value }
  }

  it('recalcule la date du jour et relit les données au retour au premier plan', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    const reload = vi.fn<() => void>()
    const { wrapper, today } = mountWith(reload)
    expect(today()).toBe('2026-09-09')

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()

    expect(today()).toBe('2026-09-10')
    expect(reload).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('se désabonne au démontage de l’écran', () => {
    const reload = vi.fn<() => void>()
    const { wrapper } = mountWith(reload)

    wrapper.unmount()
    simulateWebResume()

    expect(reload).not.toHaveBeenCalled()
  })
})

describe('useToday', () => {
  it('suit la date du jour après un changement de jour et un retour au premier plan', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    let today!: ReturnType<typeof useToday>['today']
    const wrapper = withSetup(() => {
      ;({ today } = useToday())
    })
    expect(today.value).toBe('2026-09-09')

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()

    expect(today.value).toBe('2026-09-10')
    wrapper.unmount()
  })

  it('se recale sur la date du jour à la demande, sans retour au premier plan', () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    let result!: ReturnType<typeof useToday>
    const wrapper = withSetup(() => {
      result = useToday()
    })

    vi.setSystemTime(new Date('2026-09-10T00:01:00'))
    result.refresh()

    expect(result.today.value).toBe('2026-09-10')
    wrapper.unmount()
  })
})
