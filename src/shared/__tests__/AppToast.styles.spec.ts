// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function css(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/components/AppToast.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans AppToast.vue')
  return compileString(bloc, { importers: [aliasSrc] }).css
}

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

const TOAST = '.app-toast :deep(.v-snackbar__wrapper)'

describe('AppToast — contrat de style (maquette B3)', () => {
  const feuille = css()

  it('peint un toast pétrole aux coins de 16 px, avec son ombre pétrole', () => {
    expect(declaration(feuille, TOAST, 'background')).toBe('rgb(var(--v-theme-primary))')
    expect(declaration(feuille, TOAST, 'border-radius')).toBe('16px')
    expect(declaration(feuille, TOAST, 'box-shadow')).toBe('0 8px 22px rgba(1, 56, 62, 0.28)')
  })

  it('se pose à 14 px des bords et à 24 px du bas de la zone disponible', () => {
    expect(declaration(feuille, '.app-toast', 'margin')).toBe('0 14px 24px')
    expect(declaration(feuille, TOAST, 'width')).toBe('100%')
  })

  it('laisse libres sous lui la bottom nav et toute barre fixe du bas déclarée', () => {
    expect(declaration(feuille, '.app-toast', 'padding-bottom')).toBe(
      'calc(var(--v-layout-bottom) + var(--fixed-bottom-bar-height, 0px))',
    )
  })

  it('garde la hauteur et les marges intérieures de B3', () => {
    expect(declaration(feuille, TOAST, 'min-height')).toBe('56px')
    expect(declaration(feuille, '.app-toast :deep(.v-snackbar__content)', 'padding')).toBe(
      '6px 16px',
    )
    expect(declaration(feuille, '.app-toast__content', 'gap')).toBe('10px')
  })

  it('écrit le message en 13 px medium, clair sur le pétrole', () => {
    expect(declaration(feuille, '.app-toast__message', 'font-size')).toBe('13px')
    expect(declaration(feuille, '.app-toast__message', 'font-weight')).toBe('500')
    expect(declaration(feuille, '.app-toast__message', 'line-height')).toBe('1.35')
    expect(declaration(feuille, TOAST, 'color')).toBe('#f9f4ee')
  })

  it('dessine la coche en bleu clair', () => {
    expect(declaration(feuille, '.app-toast__icon', 'color')).toBe('#b9e4e7')
  })

  it('peint un échec dans la couleur système d’erreur, texte et icône compris', () => {
    const ECHEC = '.app-toast--error :deep(.v-snackbar__wrapper)'
    expect(declaration(feuille, ECHEC, 'background')).toBe('rgb(var(--v-theme-error))')
    expect(declaration(feuille, ECHEC, 'color')).toBe('rgb(var(--v-theme-on-error))')
    expect(declaration(feuille, '.app-toast--error .app-toast__icon', 'color')).toBe('inherit')
  })
})
