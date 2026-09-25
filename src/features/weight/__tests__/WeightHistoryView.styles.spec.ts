// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/weight/views/WeightHistoryView.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style scoped lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style scoped lang="scss"> introuvable')

  const scss = bloc.replaceAll("@use '@/styles/", "@use '")

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

describe('WeightHistoryView — grille du résumé (planche H2)', () => {
  it('garde deux colonnes : la lecture, puis la puce « × Poids actuel »', () => {
    expect(declaration('.weight-history__summary', 'display')).toBe('grid')
    expect(declaration('.weight-history__summary', 'grid-template-columns')).toBe(
      'minmax(0, 1fr) auto',
    )
  })

  it('étend la lecture sur les deux colonnes, en reprenant leurs pistes', () => {
    expect(declaration('.weight-history__reading', 'grid-column')).toBe('1/-1')
    expect(declaration('.weight-history__reading', 'grid-row')).toBe('1')
    expect(declaration('.weight-history__reading', 'display')).toBe('grid')
    expect(declaration('.weight-history__reading', 'grid-template-columns')).toBe('subgrid')
  })

  it('laisse la ligne « Pesée du … » dans la première colonne, à côté de la puce', () => {
    expect(declaration('.weight-history__current-label', 'grid-column')).toBe('1')
    expect(declaration('.weight-history__reset', 'grid-column')).toBe('2')
    expect(declaration('.weight-history__reset', 'grid-row')).toBe('1')
  })

  it('passe le poids et sa variation sous la puce, sur toute la largeur', () => {
    expect(declaration('.weight-history__headline', 'grid-column')).toBe('1/-1')
    expect(declaration('.weight-history__delta', 'grid-column')).toBe('1/-1')
  })
})
