import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile les blocs `<style>` des
// composants du patron et vérifie des déclarations, jamais la géométrie.
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDe(composant: string): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/form', composant), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error(`bloc <style lang="scss"> introuvable dans ${composant}`)

  const scss = bloc.replace("@use '@/styles/tokens' as tokens;", "@use 'tokens' as tokens;")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('FormScreen — contrat de style', () => {
  const css = cssDe('FormScreen.vue')

  it('empile une zone défilante et une barre d’actions fixe', () => {
    expect(declaration(css, '.form-screen', 'flex-direction')).toBe('column')
    expect(declaration(css, '.form-screen', 'height')).toBe('100%')
    expect(declaration(css, '.form-screen__scroll', 'overflow-y')).toBe('auto')
    expect(declaration(css, '.form-screen__actions', 'flex')).toBe('0 0 auto')
  })

  it('colle la top bar en haut du contenu défilant, sans bandeau pétrole', () => {
    expect(declaration(css, '.form-screen__topbar', 'position')).toBe('sticky')
    expect(declaration(css, '.form-screen__topbar', 'top')).toBe('0')
    expect(declaration(css, '.form-screen__topbar', 'background')).toBe(
      'rgb(var(--v-theme-background))',
    )
  })

  it('ne pose bordure et ombre qu’une fois le contenu défilé', () => {
    expect(declaration(css, '.form-screen__topbar', 'border-bottom')).toBe('1px solid transparent')
    expect(declaration(css, '.form-screen__topbar--scrolled', 'border-bottom-color')).toBe(
      '#ece9e5',
    )
    expect(declaration(css, '.form-screen__topbar--scrolled', 'box-shadow')).toBe(
      '0 1px 3px rgba(30, 25, 20, 0.06)',
    )
  })

  it('garde la hauteur de ligne par défaut du titre seul, 1.2 avec un sous-titre', () => {
    expect(declaration(css, '.form-screen__title', 'line-height')).toBeUndefined()
    expect(
      declaration(css, '.form-screen__heading--with-subtitle .form-screen__title', 'line-height'),
    ).toBe('1.2')
  })

  it('garde la zone de tap de 48 px sur la flèche de retour', () => {
    expect(declaration(css, '.form-screen__back', 'width')).toBe('48px')
    expect(declaration(css, '.form-screen__back', 'height')).toBe('48px')
  })

  it('garde la barre d’actions et sa zone de gestes', () => {
    expect(declaration(css, '.form-screen__actions', 'background')).toBe('#fcfaf7')
    expect(declaration(css, '.form-screen__actions', 'border-top')).toBe('1px solid #ece9e5')
    expect(declaration(css, '.form-screen__actions', 'padding')).toBe('12px 20px 30px')
  })

  it('donne au bouton principal la largeur restante et au bouton désactivé sa teinte grise', () => {
    expect(declaration(css, '.form-screen__submit', 'flex')).toBe('1 1 auto')
    expect(declaration(css, '.form-screen__cancel', 'flex')).toBe('0 0 auto')
    expect(
      declaration(
        css,
        '.form-screen__submit:disabled, .form-screen__submit.v-btn--disabled',
        'background',
      ),
    ).toBe('#e1ddd8')
  })

  it('affiche l’erreur globale dans le rôle système error', () => {
    expect(declaration(css, '.form-screen__save-error', 'color')).toBe('rgb(var(--v-theme-error))')
  })
})

describe('FormField — contrat de style', () => {
  const css = cssDe('FormField.vue')

  it('donne aux champs la surface, le rayon et la hauteur de la maquette', () => {
    expect(
      declaration(css, '.form-field :deep(.form-field__input .v-field)', 'border-radius'),
    ).toBe('14px')
    expect(declaration(css, '.form-field :deep(.form-field__input .v-field)', 'background')).toBe(
      '#fefcf9',
    )
    expect(
      declaration(css, '.form-field :deep(.form-field__input .v-field__outline)', 'color'),
    ).toBe('#dbd7d1')
    expect(
      declaration(css, '.form-field :deep(.form-field__input .v-field__input)', 'min-height'),
    ).toBe('52px')
  })

  it('affiche l’erreur dans le rôle système error, jamais dans une couleur d’urgence', () => {
    expect(declaration(css, '.form-field__error', 'color')).toBe('rgb(var(--v-theme-error))')
  })

  it('étire l’indicateur natif du champ date sous l’icône calendrier', () => {
    expect(
      declaration(
        css,
        '.form-field :deep(.form-field__input--date input::-webkit-calendar-picker-indicator)',
        'width',
      ),
    ).toBe('48px')
  })

  it('retire les flèches de spin du champ nombre et garde son suffixe lisible', () => {
    expect(
      declaration(
        css,
        ".form-field :deep(.form-field__input--number input[type='number'])",
        'appearance',
      ),
    ).toBe('textfield')
    expect(
      declaration(
        css,
        '.form-field :deep(.form-field__input--number .v-text-field__suffix)',
        'color',
      ),
    ).toBe('#413933')
  })
})

describe('FormSegmented — contrat de style', () => {
  const css = cssDe('FormSegmented.vue')

  it('fait du sélecteur une pilule bordée de 48 px', () => {
    expect(declaration(css, '.form-segmented', 'height')).toBe('48px')
    expect(declaration(css, '.form-segmented', 'border')).toBe('1px solid #cecac3')
    expect(declaration(css, '.form-segmented', 'border-radius')).toBe('999px')
  })

  it('écrit l’option cochée en blanc cassé et les autres dans la teinte inactive', () => {
    expect(declaration(css, '.form-segmented__option', 'color')).toBe('#3e3630')
    expect(declaration(css, '.form-segmented__option--selected', 'color')).toBe('#f9f4ee')
  })

  it('ne pose la couleur du texte sur aucun sélecteur qui surclasserait l’option cochée', () => {
    const reglesColorees = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((regle) => /(?:^|;)\s*color:/.test(regle[2]!))
      .map((regle) => regle[1]!.trim())

    expect(reglesColorees).toEqual(['.form-segmented__option', '.form-segmented__option--selected'])
  })
})
