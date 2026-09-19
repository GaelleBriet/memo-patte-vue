import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/home/views/HomeView.vue')
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

  it('pose l’icône Paramètres sur la ligne du titre, dans le flux du header', () => {
    expect(declaration('.home-header__line', 'display')).toBe('flex')
    expect(declaration('.home-header__line', 'align-items')).toBe('center')
    expect(declaration('.home-header__line', 'justify-content')).toBe('space-between')
    expect(declaration('.home-header__settings', 'position')).toBeUndefined()
  })

  it('écarte l’icône du texte de 14 px dans une ligne de rappel', () => {
    expect(declaration('.reminder-row', 'gap')).toBe('14px')
  })

  it('renvoie un titre de rappel trop long à la ligne sans couper le mot en deux', () => {
    expect(declaration('.reminder-row__title', 'overflow-wrap')).toBe('break-word')
  })

  it('fait passer le badge sous le titre quand les deux ne tiennent plus côte à côte', () => {
    expect(declaration('.reminder-row', 'flex-wrap')).toBe('wrap')
    expect(declaration('.reminder-row__badge', 'margin-inline-start')).toBe('auto')
  })

  it('colore la barre d’urgence selon le statut', () => {
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

  it('donne au lien d’import une zone de tap de 48 px, sans contour de focus', () => {
    expect(declaration('.home-welcome__import', 'position')).toBe('relative')
    expect(declaration('.home-welcome__import::before', 'width')).toBe('max(100%, 48px)')
    expect(declaration('.home-welcome__import::before', 'height')).toBe('max(100%, 48px)')
    expect(declaration('.home-welcome__import:focus-visible', 'outline')).toBe('none')
  })

  it('range les actions rapides en trois tuiles de largeur égale, arrondies à 18 px', () => {
    expect(declaration('.home-quick-actions__grid', 'grid-template-columns')).toBe(
      'repeat(3, minmax(0, 1fr))',
    )
    expect(declaration('.home-quick-tile', 'border-radius')).toBe('18px')
    expect(declaration('.home-quick-tile', 'min-height')).toBe('78px')
    expect(declaration('.home-quick-tile', 'flex-direction')).toBe('column')
  })

  it('resserre la tuile d’action rapide sur la hauteur de la maquette', () => {
    expect(declaration('.home-quick-tile', 'padding')).toBe('10px')
    expect(declaration('.home-quick-tile', 'gap')).toBe('6px')
    expect(declaration('.home-quick-tile__label', 'line-height')).toBe('1.2')
  })

  it('titre les actions rapides comme les autres sections, en 700', () => {
    expect(declaration('.home-quick-actions__title', 'font-weight')).toBe('700')
    expect(declaration('.home-quick-actions__title', 'font-size')).toBe('21px')
  })
})
