import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/animals/AnimalFormView.vue')
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

beforeAll(() => {
  css = cssDuComposant()
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('AnimalFormView — contrat de style', () => {
  it('empile une zone défilante et une barre d’actions fixe', () => {
    expect(declaration('.animal-form', 'flex-direction')).toBe('column')
    expect(declaration('.animal-form', 'height')).toBe('100%')
    expect(declaration('.animal-form__scroll', 'overflow-y')).toBe('auto')
    expect(declaration('.animal-form__actions', 'flex')).toBe('0 0 auto')
  })

  it('colle la top bar en haut du contenu défilant, sans bandeau pétrole', () => {
    expect(declaration('.animal-form__topbar', 'position')).toBe('sticky')
    expect(declaration('.animal-form__topbar', 'top')).toBe('0')
    expect(declaration('.animal-form__topbar', 'background')).toBe('rgb(var(--v-theme-background))')
  })

  it('ne pose bordure et ombre qu’une fois le contenu défilé (état F5)', () => {
    expect(declaration('.animal-form__topbar', 'border-bottom')).toBe('1px solid transparent')
    expect(declaration('.animal-form__topbar--scrolled', 'border-bottom-color')).toBe('#ece9e5')
    expect(declaration('.animal-form__topbar--scrolled', 'box-shadow')).toBe(
      '0 1px 3px rgba(30, 25, 20, 0.06)',
    )
  })

  it('garde la zone de tap de 48 px sur la flèche de retour', () => {
    expect(declaration('.animal-form__back', 'width')).toBe('48px')
    expect(declaration('.animal-form__back', 'height')).toBe('48px')
  })

  it('donne aux champs la surface, le rayon et la hauteur de la maquette', () => {
    expect(declaration('.animal-form__input :deep(.v-field)', 'border-radius')).toBe('14px')
    expect(declaration('.animal-form__input :deep(.v-field)', 'background')).toBe('#fefcf9')
    expect(declaration('.animal-form__input :deep(.v-field__outline)', 'color')).toBe('#dbd7d1')
    expect(declaration('.animal-form__input :deep(.v-field__input)', 'min-height')).toBe('52px')
  })

  it('fait du sélecteur d’espèce une pilule bordée de 48 px', () => {
    expect(declaration('.animal-form__species', 'height')).toBe('48px')
    expect(declaration('.animal-form__species', 'border')).toBe('1px solid #cecac3')
    expect(declaration('.animal-form__species', 'border-radius')).toBe('999px')
  })

  it('affiche l’erreur dans le rôle système error, jamais dans une couleur d’urgence', () => {
    expect(declaration('.animal-form__error', 'color')).toBe('rgb(var(--v-theme-error))')
    expect(declaration('.animal-form__save-error', 'color')).toBe('rgb(var(--v-theme-error))')
  })

  it('garde la barre d’actions et sa zone de gestes', () => {
    expect(declaration('.animal-form__actions', 'background')).toBe('#fcfaf7')
    expect(declaration('.animal-form__actions', 'border-top')).toBe('1px solid #ece9e5')
    expect(declaration('.animal-form__actions', 'padding')).toBe('12px 20px 30px')
  })

  it('donne au bouton principal la largeur restante et au bouton désactivé sa teinte grise', () => {
    expect(declaration('.animal-form__submit', 'flex')).toBe('1 1 auto')
    expect(declaration('.animal-form__cancel', 'flex')).toBe('0 0 auto')
    expect(
      declaration(
        '.animal-form__submit:disabled, .animal-form__submit.v-btn--disabled',
        'background',
      ),
    ).toBe('#e1ddd8')
  })

  it('retire les flèches de spin du champ poids et garde son suffixe lisible', () => {
    expect(
      declaration(".animal-form__input--number :deep(input[type='number'])", 'appearance'),
    ).toBe('textfield')
    expect(declaration('.animal-form__input--number :deep(.v-text-field__suffix)', 'color')).toBe(
      '#413933',
    )
  })
})
