import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'
import vuetify from '@/core/theme/vuetify'
import { contrastRatio, scssColorTokens } from '@/core/theme/__tests__/contrast'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` de la barre
// et les tokens SCSS, et vérifie des déclarations, jamais la géométrie.
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDeLaBarre(): string {
  const sfc = readFileSync(
    resolve(process.cwd(), 'src/shared/components/BottomNavigation.vue'),
    'utf8',
  )
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans BottomNavigation.vue')

  const scss = bloc.replaceAll("@use '@/styles/", "@use '")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

function tokenScss(nom: string): string {
  const css = compileString(`@use 'tokens'; .token { valeur: tokens.$${nom}; }`, {
    loadPaths: [DOSSIER_STYLES],
  }).css

  const valeur = declaration(css, '.token', 'valeur')
  if (!valeur) throw new Error(`token $${nom} introuvable`)

  return valeur
}

describe('BottomNavigation — contrat de style', () => {
  const css = cssDeLaBarre()

  it('ne pose aucun voile Vuetify sur un onglet, actif ou non (le ripple reste)', () => {
    expect(declaration(css, '.bottom-navigation :deep(.v-btn__overlay)', 'display')).toBe('none')
    expect(css).not.toContain('v-ripple')
  })

  it('partage toute la largeur entre les deux onglets, sans bord mort', () => {
    expect(declaration(css, '.bottom-navigation :deep(.v-btn)', 'max-width')).toBe('none')
    expect(declaration(css, '.bottom-navigation :deep(.v-btn)', 'flex')).toBe('1 1 0')
  })

  it("garde l'onglet inactif en gris chaud 500 et l'actif en 700", () => {
    expect(
      declaration(css, '.bottom-navigation :deep(.v-btn:not(.v-btn--selected))', 'font-weight'),
    ).toBe('500')
    expect(declaration(css, '.bottom-navigation :deep(.v-btn--selected)', 'font-weight')).toBe(
      '700',
    )
  })

  it("flotte au-dessus du bas de l'écran, avec une marge visible sur les trois côtés", () => {
    expect(declaration(css, '.bottom-navigation', 'background-color')).toBe('transparent')
    expect(declaration(css, '.bottom-navigation', 'padding-inline')).toBe(
      tokenScss('padding-section-inline'),
    )
    expect(declaration(css, '.bottom-navigation', 'padding-block')).toBe(
      `0 ${tokenScss('padding-bottom-nav')}`,
    )
  })

  it('donne à la capsule un fond clair et des coins en pilule', () => {
    expect(
      declaration(css, '.bottom-navigation :deep(.v-bottom-navigation__content)', 'border-radius'),
    ).toBe(tokenScss('radius-pill'))
    expect(
      declaration(
        css,
        '.bottom-navigation :deep(.v-bottom-navigation__content)',
        'background-color',
      ),
    ).toBe('rgb(var(--v-theme-surface))')
  })

  it("remplit l'onglet actif d'un fond plein primary, texte et icône en on-primary : pas qu'une couleur de texte", () => {
    expect(declaration(css, '.bottom-navigation :deep(.v-btn--selected)', 'background-color')).toBe(
      'rgb(var(--v-theme-primary))',
    )
    expect(declaration(css, '.bottom-navigation :deep(.v-btn--selected)', 'border-radius')).toBe(
      tokenScss('radius-pill'),
    )
    expect(declaration(css, '.bottom-navigation :deep(.v-btn--selected)', 'color')).toBe(
      tokenScss('color-on-primary'),
    )
  })

  it("laisse l'onglet inactif sans remplissage, posé sur le fond de la capsule", () => {
    expect(
      declaration(
        css,
        '.bottom-navigation :deep(.v-btn:not(.v-btn--selected))',
        'background-color',
      ),
    ).toBeUndefined()
    expect(
      declaration(css, '.bottom-navigation :deep(.v-btn:not(.v-btn--selected))', 'color'),
    ).toBe(tokenScss('color-text-secondary'))
  })
})

describe('BottomNavigation — contraste des deux états (WCAG AA)', () => {
  const theme = vuetify.theme.themes.value.light!.colors
  const tokensColor = scssColorTokens()

  it('onglet actif : $color-on-primary sur primary', () => {
    expect(
      contrastRatio(tokensColor['color-on-primary']!, String(theme.primary)),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('onglet inactif : $color-text-secondary sur surface', () => {
    expect(
      contrastRatio(tokensColor['color-text-secondary']!, String(theme.surface)),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

// Vuetify veut la hauteur de la barre en nombre, côté TS ; les styles la lisent en SCSS.
// Ces tests gardent les deux égales : changer l'une sans l'autre les casse.
describe('BottomNavigation — tokens de hauteur', () => {
  it('reprend la hauteur des onglets de `$height-bottom-nav`', () => {
    expect(`${heightBottomNav}px`).toBe(tokenScss('height-bottom-nav'))
  })

  it('reprend la zone de gestes de `$padding-bottom-nav`', () => {
    expect(`${paddingBottomNav}px`).toBe(tokenScss('padding-bottom-nav'))
  })
})
