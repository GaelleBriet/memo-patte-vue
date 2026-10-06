import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function cssDuBadge(): string {
  const sfc = readFileSync(
    resolve(process.cwd(), 'src/shared/components/DueStatusChip.vue'),
    'utf8',
  )
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans DueStatusChip.vue')

  return compileString(bloc, { importers: [aliasSrc] }).css
}

function selecteurs(regle: string): string[] {
  return regle.split(',').map((selecteur) => selecteur.trim().replace(/\s+/g, ' '))
}

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const liste = selecteurs(regle[1]!)
    if (liste.join(', ') !== selecteur && !liste.includes(selecteur)) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

function regleCommune(css: string, ...attendus: string[]): boolean {
  return [...css.matchAll(/([^{}]+)\{/g)].some((regle) => {
    const liste = selecteurs(regle[1]!)
    return attendus.every((selecteur) => liste.includes(selecteur))
  })
}

describe('DueStatusChip — contrat de style', () => {
  const css = cssDuBadge()

  it('dessine une pilule de 12,5 px en gras', () => {
    expect(declaration(css, '.due-status-chip', 'padding')).toBe('6px 12px')
    expect(declaration(css, '.due-status-chip', 'border-radius')).toBe('999px')
    expect(declaration(css, '.due-status-chip', 'font-size')).toBe('12.5px')
    expect(declaration(css, '.due-status-chip', 'font-weight')).toBe('700')
    expect(declaration(css, '.due-status-chip', 'gap')).toBe('4px')
    expect(declaration(css, '.due-status-chip', 'white-space')).toBe('nowrap')
  })

  it('peint « En retard » avec la teinte de retard du thème, comme le bandeau de l’accueil', () => {
    expect(declaration(css, '.due-status-chip--overdue', 'background')).toBe(
      'rgb(var(--v-theme-overdue-container))',
    )
    expect(declaration(css, '.due-status-chip--overdue', 'color')).toBe(
      'rgb(var(--v-theme-on-overdue-container))',
    )
  })

  it('peint « À jour » en vert Carnet', () => {
    expect(declaration(css, '.due-status-chip--up-to-date', 'background')).toBe('#dff3e2')
    expect(declaration(css, '.due-status-chip--up-to-date', 'color')).toBe('#2f5437')
  })

  it('peint « Aujourd’hui » en ambre et « Demain » / « Plus tard » en vert Bientôt', () => {
    expect(declaration(css, '.due-status-chip--today', 'background')).toBe(
      'rgb(var(--v-theme-today-container))',
    )
    expect(declaration(css, '.due-status-chip--today', 'color')).toBe(
      'rgb(var(--v-theme-on-today-container))',
    )
    expect(
      declaration(css, '.due-status-chip--tomorrow, .due-status-chip--later', 'background'),
    ).toBe('rgb(var(--v-theme-soon-container))')
    expect(declaration(css, '.due-status-chip--tomorrow, .due-status-chip--later', 'color')).toBe(
      'rgb(var(--v-theme-on-soon-container))',
    )
  })

  it('reprend le style neutre du badge de fréquence pour « Pas de rappel »', () => {
    expect(declaration(css, '.due-status-chip--none', 'border')).toBe('1px solid #e7e4df')
    expect(declaration(css, '.due-status-chip--none', 'background')).toBe('#f2f0ec')
    expect(declaration(css, '.due-status-chip--none', 'color')).toBe('#5c5751')
    expect(declaration(css, '.due-status-chip--none', 'font-weight')).toBe('600')
  })

  it('borde « À renseigner » de turquoise, sans fond, en pétrole (Q6 du 2026-10-06)', () => {
    expect(declaration(css, '.due-status-chip--to-log', 'box-shadow')).toBe(
      'inset 0 0 0 1.5px #b9e4e7',
    )
    expect(declaration(css, '.due-status-chip--to-log', 'background')).toBe('transparent')
    expect(declaration(css, '.due-status-chip--to-log', 'color')).toBe(
      'rgb(var(--v-theme-primary))',
    )
  })

  it('borde « Prévu le … » d’un vaccin jamais fait par la règle de « À renseigner » (B · V11)', () => {
    expect(regleCommune(css, '.due-status-chip--to-log', '.due-status-chip--planned')).toBe(true)
  })
})
