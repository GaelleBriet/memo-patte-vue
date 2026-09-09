import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/animals/CarnetView.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style scoped lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style scoped lang="scss"> introuvable')

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

describe('CarnetView — contrat de style', () => {
  it('peint le header en pétrole plein, à la hauteur de la maquette', () => {
    expect(declaration('.carnet-header', 'background')).toBe('rgb(var(--v-theme-primary))')
    expect(declaration('.carnet-header', 'height')).toBe('158px')
  })

  it('donne à l’avatar 56 px, un rond et une bordure claire', () => {
    expect(declaration('.carnet-header__avatar', 'width')).toBe('56px')
    expect(declaration('.carnet-header__avatar', 'height')).toBe('56px')
    expect(declaration('.carnet-header__avatar', 'border-radius')).toBe('50%')
    expect(declaration('.carnet-header__avatar', 'border')).toContain('2px solid')
  })

  it('écrit le sous-titre dans la teinte claire sur pétrole', () => {
    expect(declaration('.carnet-header__subtitle', 'color')).toBe('#b9d0d1')
  })

  it('aligne trois colonnes de stats séparées par des filets, sans cadre', () => {
    expect(declaration('.carnet-stats', 'grid-template-columns')).toBe('repeat(3, 1fr)')
    expect(declaration('.carnet-stats', 'border')).toBeUndefined()
    expect(declaration('.carnet-stats', 'background')).toBeUndefined()
    expect(declaration('.carnet-stat + .carnet-stat', 'border-left')).toBe('1px solid #efece8')
  })

  it('donne au bouton « Réessayer » la forme du bouton principal des formulaires', () => {
    expect(declaration('.carnet-welcome__create, .carnet-error__retry', 'height')).toBe('52px')
    expect(declaration('.carnet-welcome__create, .carnet-error__retry', 'border-radius')).toBe(
      '999px',
    )
  })

  it('ne colore que la colonne Rappels en retard, en corail', () => {
    expect(declaration('.carnet-stat__value', 'color')).toBeUndefined()
    expect(declaration('.carnet-stat--overdue .carnet-stat__value', 'color')).toBe(
      'rgb(var(--v-theme-overdue))',
    )
    expect(declaration('.carnet-stat--overdue .carnet-stat__sub', 'color')).toBe(
      'rgb(var(--v-theme-overdue))',
    )
  })
})
