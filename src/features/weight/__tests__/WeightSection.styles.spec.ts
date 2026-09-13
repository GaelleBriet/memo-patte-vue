// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/weight/WeightSection.vue')
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

describe('WeightSection — contrat de style du lien « Voir l’historique »', () => {
  it('offre une zone de tap de 48 px de haut', () => {
    expect(declaration('.weight-section__history', 'min-height')).toBe('48px')
  })

  it('reprend cette hauteur en marges négatives : la ligne du poids ne grandit pas', () => {
    expect(declaration('.weight-section__history', 'margin-block')).toBe('-14px')
  })
})
