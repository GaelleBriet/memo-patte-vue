import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AnimalPickerSheet from '../AnimalPickerSheet.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { animalAvatarGradientCss } from '@/shared/animal-avatar-gradient'

const MILO = { id: '11111111-1111-4111-8111-111111111111', name: 'Milo' }
const LUNA = { id: '33333333-3333-4333-8333-333333333333', name: 'Luna' }

let wrapper: VueWrapper | null = null

// jsdom réécrit les couleurs hexadécimales d'un style en `rgb(…)`.
function enRgb(css: string): string {
  return css.replace(/#([0-9a-f]{6})/gi, (_, hex: string) => {
    const canal = (index: number) => Number.parseInt(hex.slice(index, index + 2), 16)
    return `rgb(${canal(0)}, ${canal(2)}, ${canal(4)})`
  })
}

beforeEach(() => {
  // jsdom ne fournit pas `visualViewport`, que VDialog écoute pour suivre le clavier.
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function monter(modelValue = true) {
  wrapper = mount(AnimalPickerSheet, {
    props: { modelValue, animals: [MILO, LUNA] },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// La feuille est téléportée hors du composant : on interroge le document.
function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>(
    '.animal-picker-sheet .bottom-sheet__panel',
  )
  if (!element) throw new Error('Feuille absente du document')
  return element
}

function lignes(): HTMLElement[] {
  return [...feuille().querySelectorAll<HTMLElement>('.animal-picker-sheet__animal')]
}

describe('AnimalPickerSheet', () => {
  it('reste fermée tant qu’on ne l’ouvre pas', async () => {
    await monter(false)

    expect(document.body.querySelector('.animal-picker-sheet .bottom-sheet__panel')).toBeNull()
  })

  it('demande pour quel animal et liste les animaux avec leur avatar', async () => {
    await monter()

    expect(feuille().querySelector('.bottom-sheet__title')?.textContent?.trim()).toBe(
      'Pour quel animal ?',
    )
    expect(lignes().map((ligne) => ligne.textContent?.trim())).toEqual(['Milo', 'Luna'])
    const avatar = lignes()[1]!.querySelector<HTMLElement>('.animal-picker-sheet__avatar')
    expect(avatar?.getAttribute('style')).toContain(enRgb(animalAvatarGradientCss(LUNA.id)))
  })

  it('n’a pas de bouton Annuler : la poignée ferme la feuille', async () => {
    const wrapper = await monter()

    expect(feuille().textContent).not.toContain('Annuler')
    feuille().querySelector<HTMLElement>('.bottom-sheet__handle')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se nomme par son titre pour les lecteurs d’écran', async () => {
    await monter()

    const dialogue = document.body.querySelector('.animal-picker-sheet[role="dialog"]')
    const titre = document.getElementById(dialogue?.getAttribute('aria-labelledby') ?? '')
    expect(titre?.textContent?.trim()).toBe('Pour quel animal ?')
  })

  it('émet l’animal choisi et se ferme au tap sur une ligne', async () => {
    const wrapper = await monter()

    lignes()[1]!.click()
    await flushPromises()

    expect(wrapper.emitted('pick')).toEqual([[LUNA.id]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
