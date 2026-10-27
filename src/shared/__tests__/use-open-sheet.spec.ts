import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'

import { isAnySheetOpen, useOpenSheet } from '../composables/use-open-sheet'

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
