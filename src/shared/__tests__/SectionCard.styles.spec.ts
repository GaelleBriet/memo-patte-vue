import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function cssDeLaCarte(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/SectionCard.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans SectionCard.vue')

  return compileString(bloc, { importers: [aliasSrc] }).css
}

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('SectionCard — contrat de style', () => {
  const css = cssDeLaCarte()

  it('aligne titre et compteur sur la même ligne de base, 12 px au-dessus de la carte', () => {
    expect(declaration(css, '.section-card__heading', 'display')).toBe('flex')
    expect(declaration(css, '.section-card__heading', 'align-items')).toBe('baseline')
    expect(declaration(css, '.section-card__heading', 'justify-content')).toBe('space-between')
    expect(declaration(css, '.section-card__heading', 'margin-bottom')).toBe('12px')
    expect(declaration(css, '.section-card__title', 'margin')).toBe('0')
    expect(declaration(css, '.section-card__title', 'font-size')).toBe('21px')
  })

  it('écrit le compteur en texte méta de 13 px', () => {
    expect(declaration(css, '.section-card__counter', 'color')).toBe('#736e67')
    expect(declaration(css, '.section-card__counter', 'font-size')).toBe('13px')
    expect(declaration(css, '.section-card__counter', 'font-weight')).toBe('500')
    expect(declaration(css, '.section-card__counter', 'white-space')).toBe('nowrap')
  })

  it('arrondit la carte à 22 px, lignes de 76 px séparées d’un filet et barre d’urgence de 3 px', () => {
    expect(declaration(css, '.section-card__card', 'border-radius')).toBe('22px')
    expect(declaration(css, '.section-card__row', 'min-height')).toBe('76px')
    expect(declaration(css, '.section-card__row::before', 'width')).toBe('3px')
    expect(declaration(css, '.section-card__row--overdue::before', 'background')).toBe(
      'rgb(var(--v-theme-overdue))',
    )
  })
})
