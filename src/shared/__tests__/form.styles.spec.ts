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

  it('laisse la hauteur et la top bar à PushedScreen', () => {
    expect(declaration(css, '.form-screen', 'height')).toBeUndefined()
    expect(declaration(css, '.form-screen__topbar', 'position')).toBeUndefined()
  })

  it('garde la marge des champs et la zone de gestes sous les boutons', () => {
    expect(declaration(css, '.form-screen__fields', 'padding')).toBe('12px 20px 24px')
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

  it('déclare l’option cochée après l’option de base, à spécificité égale', () => {
    const selecteurs = [...css.matchAll(/([^{}]+)\{/g)].map((regle) => regle[1]!.trim())

    expect(selecteurs.indexOf('.form-segmented__option')).toBeGreaterThanOrEqual(0)
    expect(selecteurs.indexOf('.form-segmented__option--selected')).toBeGreaterThan(
      selecteurs.indexOf('.form-segmented__option'),
    )
  })

  it('ne pose la couleur du texte sur aucun sélecteur qui surclasserait l’option cochée', () => {
    const reglesColorees = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter((regle) => /(?:^|;)\s*color:/.test(regle[2]!))
      .map((regle) => regle[1]!.trim())

    expect(reglesColorees).toEqual(['.form-segmented__option', '.form-segmented__option--selected'])
  })
})
