import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OverflowMenu from '../components/OverflowMenu.vue'
import vuetify from '@/core/theme/vuetify'

const ITEMS = [
  { id: 'changeDate', label: 'Changer la date', icon: 'ms:edit_calendar' },
  { id: 'remove', label: 'Supprimer cette injection', icon: 'ms:delete', danger: true },
]

beforeEach(() => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function ouvrir() {
  const wrapper = mount(OverflowMenu, {
    props: { label: 'Options pour l’injection du 27 juillet 2026', items: ITEMS },
    global: { plugins: [vuetify], stubs: { transition: false } },
    attachTo: document.body,
  })
  await wrapper.get('.overflow-menu__button').trigger('click')
  await flushPromises()
  return wrapper
}

function items(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.overflow-menu__item')]
}

describe('OverflowMenu', () => {
  it('nomme le bouton ⋮ et liste ses actions, la destructive en couleur d’erreur', async () => {
    const wrapper = await ouvrir()

    expect(wrapper.get('.overflow-menu__button').attributes('aria-label')).toBe(
      'Options pour l’injection du 27 juillet 2026',
    )
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      'Changer la date',
      'Supprimer cette injection',
    ])
    expect(items()[1]?.classList).toContain('overflow-menu__item--danger')
    expect(items()[0]?.classList).not.toContain('overflow-menu__item--danger')
    wrapper.unmount()
  })

  it('émet l’action choisie', async () => {
    const wrapper = await ouvrir()

    items()[1]?.click()

    expect(wrapper.emitted('select')).toEqual([['remove']])
    wrapper.unmount()
  })
})
