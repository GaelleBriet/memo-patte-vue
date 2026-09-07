import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import MsIcon from '../MsIcon.vue'
import { getMsIconPath, msAliases, msIcons } from '../icons'

// Liste initiale des icônes reprise des maquettes v2 (ticket #70).
const iconesDesMaquettes = [
  'vaccines',
  'medication',
  'pest_control',
  'error',
  'schedule',
  'today',
  'check',
  'settings',
  'edit',
  'arrow_back',
  'home',
  'pets',
  'add',
  'monitor_weight',
] as const

describe('registre d’icônes Material Symbols', () => {
  it.each(iconesDesMaquettes)('expose un SVG non vide pour « %s »', (nom) => {
    const svg: string = msIcons[nom]

    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')

    const glyphe = getMsIconPath(nom)

    expect(glyphe?.viewBox).toBe('0 -960 960 960')
    expect(glyphe?.path.length).toBeGreaterThan(0)
  })

  it('renvoie undefined pour une icône inconnue', () => {
    expect(getMsIconPath('icone-inexistante')).toBeUndefined()
  })

  it('fournit un alias Vuetify pointant vers une icône enregistrée', () => {
    const alias = Object.values(msAliases)

    expect(alias.length).toBeGreaterThan(0)

    for (const valeur of alias) {
      expect(valeur).toSatisfy(
        (v: unknown) => typeof v === 'string' && v.startsWith('ms:'),
        `alias non préfixé par « ms: » : ${String(valeur)}`,
      )
      const nom = String(valeur).slice('ms:'.length)
      expect(msIcons, `alias « ${String(valeur)} » absent du registre`).toHaveProperty(nom)
    }
  })
})

describe('MsIcon', () => {
  it('rend le SVG de l’icône demandée', () => {
    const wrapper = mount(MsIcon, { props: { tag: 'i', icon: 'pets' } })

    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.element.tagName).toBe('I')
  })

  it('ne rend aucun SVG pour une icône inconnue', () => {
    const wrapper = mount(MsIcon, { props: { tag: 'i', icon: 'icone-inexistante' } })

    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
