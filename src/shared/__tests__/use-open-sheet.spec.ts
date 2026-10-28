import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'

import {
  isAnySheetOpen,
  SHEET_REQUEST_TIMEOUT_MS,
  useOpenSheet,
  useSheetRequest,
} from '../composables/use-open-sheet'

function feuille(open: Ref<boolean>) {
  return mount(
    defineComponent(() => {
      useOpenSheet(open)
      return () => h('div')
    }),
  )
}

describe('useOpenSheet', () => {
  it('ne compte aucune feuille ouverte par défaut', () => {
    expect(isAnySheetOpen.value).toBe(false)
  })

  it('compte la feuille tant qu’elle est ouverte', async () => {
    const open = ref(true)
    const wrapper = feuille(open)
    expect(isAnySheetOpen.value).toBe(true)

    open.value = false
    await nextTick()
    expect(isAnySheetOpen.value).toBe(false)

    open.value = true
    await nextTick()
    expect(isAnySheetOpen.value).toBe(true)
    wrapper.unmount()
  })

  it('reste ouverte tant qu’une des feuilles l’est encore', async () => {
    const rappel = ref(true)
    const pesee = ref(true)
    const premiere = feuille(rappel)
    const seconde = feuille(pesee)

    rappel.value = false
    await nextTick()
    expect(isAnySheetOpen.value).toBe(true)

    pesee.value = false
    await nextTick()
    expect(isAnySheetOpen.value).toBe(false)
    premiere.unmount()
    seconde.unmount()
  })

  it('libère la feuille détruite pendant qu’elle est ouverte', () => {
    const wrapper = feuille(ref(true))

    wrapper.unmount()

    expect(isAnySheetOpen.value).toBe(false)
  })
})

describe('useSheetRequest', () => {
  let demande: ReturnType<typeof useSheetRequest>
  const montes: ReturnType<typeof mount>[] = []

  function accueil() {
    const wrapper = mount(
      defineComponent(() => {
        demande = useSheetRequest()
        return () => h('div')
      }),
    )
    montes.push(wrapper)
    return wrapper
  }

  afterEach(() => {
    montes.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.useRealTimers()
  })

  it('compte une feuille demandée comme ouverte jusqu’à son abandon', () => {
    accueil()

    demande.hold()
    expect(isAnySheetOpen.value).toBe(true)

    demande.release()
    expect(isAnySheetOpen.value).toBe(false)
  })

  it('passe la main à la feuille dès qu’elle s’affiche', async () => {
    accueil()
    demande.hold()
    const open = ref(false)
    montes.push(feuille(open))

    open.value = true
    await nextTick()
    await nextTick()
    open.value = false
    await nextTick()

    expect(isAnySheetOpen.value).toBe(false)
  })

  it('retombe après le délai si la feuille ne s’affiche jamais', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    accueil()

    demande.hold()
    vi.advanceTimersByTime(SHEET_REQUEST_TIMEOUT_MS - 1)
    expect(isAnySheetOpen.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(isAnySheetOpen.value).toBe(false)
  })

  it('une nouvelle demande repart pour un délai entier', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const wrapper = accueil()

    demande.hold()
    vi.advanceTimersByTime(3000)
    demande.hold()
    vi.advanceTimersByTime(SHEET_REQUEST_TIMEOUT_MS - 3000 + 1)
    expect(isAnySheetOpen.value).toBe(true)

    vi.advanceTimersByTime(3000 - 1)
    expect(isAnySheetOpen.value).toBe(false)

    demande.hold()
    wrapper.unmount()
    montes.splice(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retombe quand l’écran qui l’a demandée est démonté', () => {
    const wrapper = accueil()
    demande.hold()

    wrapper.unmount()
    montes.splice(0)

    expect(isAnySheetOpen.value).toBe(false)
  })
})
