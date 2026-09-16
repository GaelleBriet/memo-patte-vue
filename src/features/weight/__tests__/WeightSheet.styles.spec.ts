// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

import { aliasSrc } from '@/shared/__tests__/sass-alias'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/weight/WeightSheet.vue')
const CHAMP_PARTAGE = resolve(process.cwd(), 'src/shared/form/FormField.vue')

function blocStyle(fichier: string): string {
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(readFileSync(fichier, 'utf8'))?.[1]

  if (!bloc) throw new Error(`bloc <style lang="scss"> introuvable dans ${fichier}`)

  return bloc
}

function compiler(fichier: string): string {
  return compileString(blocStyle(fichier), { importers: [aliasSrc] }).css
}

let css: string

beforeAll(() => {
  css = compiler(COMPOSANT)
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('WeightSheet — sélecteur d’animal', () => {
  it('ne surcharge pas le CSS du sélecteur partagé : ses props suffisent', () => {
    expect(css).not.toContain('animal-chip-selector')
  })
})

describe('WeightSheet — bordure des champs', () => {
  function reglesDeBordure(cssCompile: string, champ: string): Record<string, string> {
    const regles: Record<string, string> = {}

    for (const regle of cssCompile.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selecteur = regle[1]!.trim().replace(/\s+/g, ' ')
      if (!selecteur.startsWith(`${champ} `) || !selecteur.endsWith('.v-field__outline')) continue

      regles[selecteur.slice(champ.length + 1)] = regle[2]!.trim().replace(/\s+/g, ' ')
    }

    return regles
  }

  it('reprend la bordure des champs partagés, sans règle maison', () => {
    expect(blocStyle(COMPOSANT)).not.toContain('v-field__outline')
    expect(reglesDeBordure(css, '.weight-sheet__input')).toEqual(
      reglesDeBordure(compiler(CHAMP_PARTAGE), '.form-field :deep(.form-field__input)'),
    )
  })

  it('peint l’icône du champ date en pétrole, comme le champ date partagé', () => {
    const icone = '.weight-sheet__input--date .v-field__append-inner .v-icon'

    expect(declaration(icone, 'color')).toBe('rgb(var(--v-theme-primary))')
    expect(declaration(icone, 'font-size')).toBe('21px')
  })

  it('passe la bordure en rouge système en erreur, sauf sur un champ verrouillé', () => {
    expect(
      declaration(
        '.weight-sheet__input .v-field--error:not(.v-field--disabled) .v-field__outline',
        'color',
      ),
    ).toBe('rgb(var(--v-theme-error))')
    expect(declaration('.weight-sheet__input .v-field--error .v-field__outline', 'color')).toBe(
      undefined,
    )
  })
})
