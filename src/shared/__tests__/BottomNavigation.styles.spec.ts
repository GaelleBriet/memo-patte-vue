import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` de la barre
// et les tokens SCSS, et vérifie des déclarations, jamais la géométrie.
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDeLaBarre(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/BottomNavigation.vue'), 'utf8')
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

  it("garde l'onglet inactif en gris chaud 500 et l'actif en 700", () => {
    expect(
      declaration(css, '.bottom-navigation :deep(.v-btn:not(.v-btn--selected))', 'font-weight'),
    ).toBe('500')
    expect(declaration(css, '.bottom-navigation :deep(.v-btn--selected)', 'font-weight')).toBe(
      '700',
    )
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
