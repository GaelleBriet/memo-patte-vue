import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { compileString } from 'sass'

import AnimalChipSelector from '../AnimalChipSelector.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

/**
 * Vitest tourne avec `css: false` : les styles d'un composant ne sont jamais
 * appliqués, et `vite build` ne compile pas non plus ceux d'un composant que
 * personne n'importe encore. Ces tests compilent donc le bloc `<style>` du SFC
 * et l'injectent dans le document, pour vérifier ce que jsdom sait résoudre :
 * les déclarations qui portent le positionnement du composant.
 *
 * jsdom ne fait pas de mise en page — la géométrie réelle (rangée de 42 px,
 * chevauchement et débord de 21 px) se vérifie dans un navigateur.
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

let feuille: HTMLStyleElement

beforeAll(() => {
  feuille = document.createElement('style')
  feuille.textContent = cssDuComposant()
  document.head.append(feuille)
})

afterAll(() => {
  feuille.remove()
})

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

    // Une marge haute sur la racine fusionnerait avec celle du conteneur quand
    // le composant en est le premier enfant : le parent remonterait au lieu que
    // la rangée chevauche le header.
    expect(px(racine.marginTop)).toBe(0)
    expect(rangee.marginTop).toBe('-21px')

    // Le contexte de formatage de la racine retient ce décalage à l'intérieur.
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
    const wrapper = monter()
    const groupe = window.getComputedStyle(wrapper.get('.animal-chip-selector__group').element)
    const chip = window.getComputedStyle(wrapper.get('.animal-chip').element)

    // Sans ça, la rangée mesure 58 px au lieu de 42 et le débord est faux.
    expect(px(groupe.paddingTop)).toBe(0)
    expect(px(groupe.paddingBottom)).toBe(0)
    expect(px(chip.marginTop)).toBe(0)
    expect(px(chip.marginBottom)).toBe(0)
    expect(px(chip.marginRight)).toBe(0)
    expect(chip.height).toBe('42px')

    wrapper.unmount()
  })
})
