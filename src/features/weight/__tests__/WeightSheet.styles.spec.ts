// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/weight/WeightSheet.vue')
const CHAMP_PARTAGE = resolve(process.cwd(), 'src/shared/form/FormField.vue')
const DOSSIER_SRC = resolve(process.cwd(), 'src')

// L'alias `@/` est résolu par Vite, pas par sass.
const aliasSrc = {
  findFileUrl: (url: string) =>
    url.startsWith('@/') ? pathToFileURL(resolve(DOSSIER_SRC, url.slice(2))) : null,
}

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

describe('WeightSheet — contrat de style de la poignée', () => {
  it('offre une zone de tap de 44 px de haut', () => {
    expect(declaration('.weight-sheet__handle', 'height')).toBe('44px')
  })

  it('garde la pilule visible de 36 × 4 px, couleur poignée', () => {
    expect(declaration('.weight-sheet__handle::before', 'width')).toBe('36px')
    expect(declaration('.weight-sheet__handle::before', 'height')).toBe('4px')
    expect(declaration('.weight-sheet__handle::before', 'background')).toBe('#c1bdb7')
  })
})

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

  it('passe la bordure en rouge système en erreur', () => {
    expect(declaration('.weight-sheet__input .v-field--error .v-field__outline', 'color')).toBe(
      'rgb(var(--v-theme-error))',
    )
  })
})
