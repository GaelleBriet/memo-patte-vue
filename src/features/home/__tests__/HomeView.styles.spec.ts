import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/home/HomeView.vue')
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

describe('HomeView — contrat de style', () => {
  it('peint le header en pétrole plein, à la hauteur de la maquette', () => {
    expect(declaration('.home-header', 'background')).toBe('rgb(var(--v-theme-primary))')
    expect(declaration('.home-header', 'height')).toBe('158px')
  })

  it('écrit le titre en Space Grotesk 26 px et le sous-titre dans la teinte claire', () => {
    expect(declaration('.home-header__title', 'font-size')).toBe('26px')
    expect(declaration('.home-header__title', 'font-family')).toContain('Space Grotesk')
    expect(declaration('.home-header__subtitle', 'color')).toBe('#b9d0d1')
    expect(declaration('.home-header__subtitle', 'font-size')).toBe('13.5px')
  })

  it('arrondit la carte de rappels à 22 px et sépare les lignes d’un filet', () => {
    expect(declaration('.home-reminders', 'border-radius')).toBe('22px')
    expect(declaration('.reminder-row', 'min-height')).toBe('76px')
    expect(declaration('.reminder-row + .reminder-row', 'border-top')).toBe('1px solid #efece8')
  })

  it('colore la barre d’urgence de 3 px selon le statut', () => {
    expect(declaration('.reminder-row::before', 'width')).toBe('3px')
    expect(declaration('.reminder-row--overdue::before', 'background')).toBe(
      'rgb(var(--v-theme-overdue))',
    )
    expect(declaration('.reminder-row--today::before', 'background')).toBe(
      'rgb(var(--v-theme-today))',
    )
    expect(
      declaration('.reminder-row--tomorrow::before, .reminder-row--later::before', 'background'),
    ).toBe('rgb(var(--v-theme-soon))')
  })

  it('peint le badge d’échéance avec le couple fond / texte de son urgence', () => {
    expect(declaration('.reminder-row--overdue .reminder-row__badge', 'background')).toBe(
      'rgb(var(--v-theme-overdue-container))',
    )
    expect(declaration('.reminder-row--overdue .reminder-row__badge', 'color')).toBe(
      'rgb(var(--v-theme-on-overdue-container))',
    )
    expect(declaration('.reminder-row--today .reminder-row__badge', 'background')).toBe(
      'rgb(var(--v-theme-today-container))',
    )
  })

  it('peint le bandeau retard en rose pâle', () => {
    expect(declaration('.home-overdue-banner', 'background')).toBe(
      'rgb(var(--v-theme-overdue-container))',
    )
    expect(declaration('.home-overdue-banner', 'color')).toBe(
      'rgb(var(--v-theme-on-overdue-container))',
    )
  })

  it('donne 46 px à la pastille « Tout est à jour », en vert distinct de « Bientôt »', () => {
    expect(declaration('.home-up-to-date__dot', 'width')).toBe('46px')
    expect(declaration('.home-up-to-date__dot', 'background')).toBe(
      'rgb(var(--v-theme-up-to-date))',
    )
    expect(declaration('.home-up-to-date__dot', 'color')).toBe('rgb(var(--v-theme-on-up-to-date))')
  })

  it('étire la bienvenue sur la hauteur de l’écran sans la recalculer depuis le viewport', () => {
    expect(declaration('.home', 'min-height')).toBe('100%')
    expect(declaration('.home', 'display')).toBe('flex')
    expect(declaration('.home', 'flex-direction')).toBe('column')
    expect(declaration('.home-welcome', 'flex')).toBe('1 0 auto')
    expect(declaration('.home-welcome', 'min-height')).toBeUndefined()
  })

  it('donne à l’illustration 150 px et au bouton de bienvenue la pleine largeur arrondie à 18 px', () => {
    expect(declaration('.home-welcome__illustration', 'width')).toBe('150px')
    expect(declaration('.home-welcome__create', 'width')).toBe('100%')
    expect(declaration('.home-welcome__create', 'border-radius')).toBe('18px')
  })

  it('range les actions rapides en trois tuiles de largeur égale, arrondies à 18 px', () => {
    expect(declaration('.home-quick-actions__grid', 'grid-template-columns')).toBe(
      'repeat(3, minmax(0, 1fr))',
    )
    expect(declaration('.home-quick-tile', 'border-radius')).toBe('18px')
    expect(declaration('.home-quick-tile', 'min-height')).toBe('78px')
    expect(declaration('.home-quick-tile', 'flex-direction')).toBe('column')
  })
})
