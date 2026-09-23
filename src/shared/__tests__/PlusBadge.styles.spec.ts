// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function css(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/components/PlusBadge.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans PlusBadge.vue')
  return compileString(bloc, { importers: [aliasSrc] }).css
}

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

describe('PlusBadge — contrat de style', () => {
  const feuille = css()

  it('dessine une pastille de 16 px, détourée de 2 px autour', () => {
    expect(declaration(feuille, '.plus-badge', 'box-sizing')).toBe('content-box')
    expect(declaration(feuille, '.plus-badge', 'width')).toBe('16px')
    expect(declaration(feuille, '.plus-badge', 'height')).toBe('16px')
    expect(declaration(feuille, '.plus-badge', 'border')).toBe('2px solid')
    expect(declaration(feuille, '.plus-badge', 'border-radius')).toBe('50%')
  })

  it('peint la pastille en bleu clair et l’icône en pétrole', () => {
    expect(declaration(feuille, '.plus-badge', 'background')).toBe('#b9e4e7')
    expect(declaration(feuille, '.plus-badge', 'color')).toBe('rgb(var(--v-theme-primary))')
  })

  it('reprend la couleur du fond porteur pour son contour', () => {
    expect(declaration(feuille, '.plus-badge--on-surface', 'border-color')).toBe(
      'rgb(var(--v-theme-surface))',
    )
    expect(declaration(feuille, '.plus-badge--on-primary', 'border-color')).toBe(
      'rgb(var(--v-theme-primary))',
    )
  })

  it('ne capte aucun tap, qui revient à l’icône qu’elle décore', () => {
    expect(declaration(feuille, '.plus-badge', 'pointer-events')).toBe('none')
  })
})
