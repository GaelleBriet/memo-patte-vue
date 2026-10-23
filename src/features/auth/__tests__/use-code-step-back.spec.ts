import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'

import { installBackButton } from '@/core/app-lifecycle/back-button'

import { useCodeStepBack } from '../composables/use-code-step-back'

const listeners: Array<(event: { canGoBack: boolean }) => void> = []

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_name: string, listener: (event: { canGoBack: boolean }) => void) => {
      listeners.push(listener)
      return Promise.resolve({ remove: () => {} })
    },
    minimizeApp: vi.fn<() => Promise<void>>(),
  },
}))

const scopes: EffectScope[] = []
let uninstall: (() => void) | null = null

function setup(onCodeStep: boolean) {
  const isCodeStep = ref(onCodeStep)
  const backToAddress = vi.fn<() => void>()
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useCodeStepBack(isCodeStep, backToAddress))
  uninstall ??= installBackButton()
  return { isCodeStep, backToAddress, scope }
}

function pressBack(canGoBack = true): void {
  listeners.at(-1)?.({ canGoBack })
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  uninstall?.()
  uninstall = null
  listeners.length = 0
  vi.restoreAllMocks()
})

describe('useCodeStepBack', () => {
  it("à l'étape du code, le retour revient à la saisie de l'adresse", () => {
    const { backToAddress } = setup(true)
    const history = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    pressBack()

    expect(backToAddress).toHaveBeenCalledOnce()
    expect(history).not.toHaveBeenCalled()
  })

  it("à l'étape de saisie, le retour quitte l'écran", () => {
    const { backToAddress } = setup(false)
    const history = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    pressBack()

    expect(backToAddress).not.toHaveBeenCalled()
    expect(history).toHaveBeenCalledOnce()
  })

  it("suit l'étape : intercepté quand le code s'ouvre, rendu quand on revient à la saisie", () => {
    const { isCodeStep, backToAddress } = setup(false)
    const history = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    isCodeStep.value = true
    pressBack()
    isCodeStep.value = false
    pressBack()

    expect(backToAddress).toHaveBeenCalledOnce()
    expect(history).toHaveBeenCalledOnce()
  })

  it("n'intercepte plus rien quand l'écran est quitté", () => {
    const { backToAddress, scope } = setup(true)
    const history = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    scope.stop()
    pressBack()

    expect(backToAddress).not.toHaveBeenCalled()
    expect(history).toHaveBeenCalledOnce()
  })
})
