import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { compileString } from 'sass'

import AnimalChipSelector from '../AnimalChipSelector.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

/**
 * Vitest tourne avec `css: false` : rien n'applique jamais les styles du
 * composant. On compile donc son bloc `<style>`, et on le vérifie de deux
 * façons, qui ne couvrent pas la même chose :
 *
 * - `getComputedStyle` sur le composant monté, feuille injectée : ne prouve
 *   quelque chose que pour une propriété dont la valeur diffère de celle par
 *   défaut. La feuille Vuetify n'étant pas chargée ici, `margin: 0` ou
 *   `padding-block: 0` y seraient vrais même sans nos déclarations ;
 * - lecture du CSS compilé : c'est là qu'on vérifie ce qui neutralise une
 *   déclaration de Vuetify, ainsi que la règle `:deep(…)`, que sass laisse
 *   littérale et que jsdom écarte donc comme sélecteur invalide.
 *
 * Aucune des deux ne mesure la géométrie : jsdom ne fait pas de mise en page.
 */
const COMPOSANT = resolve(process.cwd(), 'src/shared/AnimalChipSelector.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style scoped lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style scoped lang="scss"> introuvable')

  // L'alias `@/` est résolu par Vite, pas par sass.
  const scss = bloc.replace("@use '@/styles/tokens' as tokens;", "@use 'tokens' as tokens;")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

let css: string
let feuille: HTMLStyleElement

beforeAll(() => {
  css = cssDuComposant()
  feuille = document.createElement('style')
  feuille.textContent = css
  document.head.append(feuille)
})

afterAll(() => {
  feuille.remove()
})

/** Valeur déclarée pour une propriété dans le CSS compilé, `undefined` sinon. */
function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

/** jsdom sérialise le zéro tantôt `0`, tantôt `0px` : on compare des nombres. */
function px(valeur: string): number {
  return Number.parseFloat(valeur)
}

function monter() {
  return mount(AnimalChipSelector, {
    props: {
      animals: [
        { id: 'milo', name: 'Milo' },
        { id: 'luna', name: 'Luna' },
      ],
    },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  })
}

describe('AnimalChipSelector — contrat de style', () => {
  it('garde le décalage négatif hors de la racine, pour qu’il ne fusionne pas avec le conteneur', () => {
    const wrapper = monter()
    const racine = window.getComputedStyle(wrapper.get('.animal-chip-selector').element)
    const rangee = window.getComputedStyle(wrapper.get('.animal-chip-selector__row').element)

    expect(px(racine.marginTop)).toBe(0)
    expect(rangee.marginTop).toBe('-21px')
    expect(racine.display).toBe('flow-root')

    wrapper.unmount()
  })

  it('rend son empilement explicite', () => {
    const wrapper = monter()
    const racine = window.getComputedStyle(wrapper.get('.animal-chip-selector').element)

    expect(racine.position).toBe('relative')
    expect(racine.zIndex).toBe('1')
    expect(racine.isolation).toBe('isolate')

    wrapper.unmount()
  })

  it('neutralise les marges que VChipGroup pose sur la rangée et sur les chips', () => {
    // Sans ces deux déclarations, la rangée mesure 58 px au lieu de 42 et
    // déborde de 37 px sous le header au lieu de 21.
    expect(declaration('.animal-chip-selector__group', 'padding-block')).toBe('0')
    expect(declaration('.animal-chip', 'margin')).toBe('0')
  })

  it('espace les chips de 10 px, et non des 8 px de VChipGroup', () => {
    expect(declaration('.animal-chip-selector__row', 'gap')).toBe('10px')
    expect(declaration('.animal-chip-selector__group :deep(.v-slide-group__content)', 'gap')).toBe(
      '10px',
    )
  })

  it('garde la hauteur de chip de la maquette', () => {
    const wrapper = monter()

    expect(window.getComputedStyle(wrapper.get('.animal-chip').element).height).toBe('42px')

    wrapper.unmount()
  })
})
