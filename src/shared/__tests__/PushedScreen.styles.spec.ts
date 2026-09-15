import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et vérifie
// des déclarations ; la géométrie réelle se mesure dans le navigateur.
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDeLEcran(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/PushedScreen.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans PushedScreen.vue')

  const scss = bloc.replaceAll("@use '@/styles/", "@use '")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

function declarations(css: string, selecteur: string, propriete: string): string[] {
  const valeurs: string[] = []
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    for (const trouvee of regle[2]!.matchAll(
      new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`, 'g'),
    ))
      valeurs.push(trouvee[1]!.trim())
  }

  return valeurs
}

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  return declarations(css, selecteur, propriete).at(-1)
}

describe('PushedScreen — contrat de style', () => {
  const css = cssDeLEcran()

  it('borne sa hauteur à la zone utile de v-main, avec repli vh pour les WebView sans dvh', () => {
    expect(declarations(css, '.pushed-screen', 'height')).toEqual([
      'calc(100vh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px))',
      'calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px))',
    ])
    expect(declaration(css, '.pushed-screen', 'overflow')).toBe('hidden')
  })

  it('décale le défilement vers un champ focalisé de la hauteur de la top bar', () => {
    expect(declaration(css, '.pushed-screen__scroll', 'scroll-padding-top')).toBe(
      'var(--pushed-screen-topbar-height, 0px)',
    )
  })

  it('empile une zone défilante et une barre du bas fixe', () => {
    expect(declaration(css, '.pushed-screen', 'flex-direction')).toBe('column')
    expect(declaration(css, '.pushed-screen__scroll', 'overflow-y')).toBe('auto')
    expect(declaration(css, '.pushed-screen__scroll', 'flex')).toBe('1 1 auto')
    expect(declaration(css, '.pushed-screen__actions', 'flex')).toBe('0 0 auto')
  })

  it('colle la top bar en haut du contenu défilant, sans bandeau pétrole', () => {
    expect(declaration(css, '.pushed-screen__topbar', 'position')).toBe('sticky')
    expect(declaration(css, '.pushed-screen__topbar', 'top')).toBe('0')
    expect(declaration(css, '.pushed-screen__topbar', 'background')).toBe(
      'rgb(var(--v-theme-background))',
    )
  })

  it('ne pose bordure et ombre qu’une fois le contenu défilé', () => {
    expect(declaration(css, '.pushed-screen__topbar', 'border-bottom')).toBe(
      '1px solid transparent',
    )
    expect(declaration(css, '.pushed-screen__topbar--scrolled', 'border-bottom-color')).toBe(
      '#ece9e5',
    )
    expect(declaration(css, '.pushed-screen__topbar--scrolled', 'box-shadow')).toBe(
      '0 1px 3px rgba(30, 25, 20, 0.06)',
    )
  })

  it('garde la hauteur de ligne par défaut du titre seul, 1.2 avec un sous-titre', () => {
    expect(declaration(css, '.pushed-screen__title', 'line-height')).toBeUndefined()
    expect(
      declaration(
        css,
        '.pushed-screen__heading--with-subtitle .pushed-screen__title',
        'line-height',
      ),
    ).toBe('1.2')
  })

  it('laisse les marges par défaut du titre et du sous-titre, retirées en mode compact', () => {
    expect(declaration(css, '.pushed-screen__title', 'margin')).toBeUndefined()
    expect(declaration(css, '.pushed-screen__subtitle', 'margin')).toBeUndefined()
    expect(
      declaration(
        css,
        '.pushed-screen__heading--compact .pushed-screen__title, .pushed-screen__heading--compact .pushed-screen__subtitle',
        'margin',
      ),
    ).toBe('0')
  })

  it('distingue le sous-titre hint (600) du sous-titre en texte secondaire (500)', () => {
    expect(declaration(css, '.pushed-screen__subtitle', 'color')).toBe('#736e67')
    expect(declaration(css, '.pushed-screen__subtitle', 'font-weight')).toBe('600')
    expect(declaration(css, '.pushed-screen__subtitle--secondary', 'color')).toBe('#68625c')
    expect(declaration(css, '.pushed-screen__subtitle--secondary', 'font-weight')).toBe('500')
  })

  it('garde la zone de tap de 48 px sur la flèche de retour', () => {
    expect(declaration(css, '.pushed-screen__back', 'width')).toBe('48px')
    expect(declaration(css, '.pushed-screen__back', 'height')).toBe('48px')
  })

  it('donne à la barre du bas sa surface et sa bordure', () => {
    expect(declaration(css, '.pushed-screen__actions', 'background')).toBe('#fcfaf7')
    expect(declaration(css, '.pushed-screen__actions', 'border-top')).toBe('1px solid #ece9e5')
  })
})

describe('Écrans poussés — la hauteur reste à PushedScreen', () => {
  it('le suivi de poids ne redéfinit pas de hauteur', () => {
    const sfc = readFileSync(
      resolve(process.cwd(), 'src/features/weight/WeightHistoryView.vue'),
      'utf8',
    )
    const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1] ?? ''
    const scss = bloc.replaceAll("@use '@/styles/", "@use '")
    const css = compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css

    expect(declaration(css, '.weight-history', 'height')).toBeUndefined()
    expect(css).not.toMatch(/100d?vh/)
  })
})
