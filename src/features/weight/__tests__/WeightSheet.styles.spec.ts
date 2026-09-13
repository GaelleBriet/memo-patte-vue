// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/weight/WeightSheet.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable')

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
