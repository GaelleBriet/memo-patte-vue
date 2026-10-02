// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from '@/shared/__tests__/sass-alias'

function css(fichier: string): string {
  const sfc = readFileSync(resolve(process.cwd(), fichier), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error(`bloc <style lang="scss"> introuvable dans ${fichier}`)
  return compileString(bloc, { importers: [aliasSrc] }).css
}

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

// Sept colonnes de 48 px ne tiennent qu'à partir de 360 px de large : en dessous, c'est le rond qui
// rétrécit avec sa colonne, jamais la hauteur de la zone tactile.
describe('un jour de « Choisir les jours » garde 48 px de zone tactile (TR-16)', () => {
  const feuille = css('src/features/treatments/views/TreatmentChooseDaysMonth.vue')

  it('la colonne suit la largeur de l’écran', () => {
    expect(declaration(feuille, '.choose-days-month__days', 'grid-template-columns')).toBe(
      'repeat(7, minmax(0, 1fr))',
    )
    expect(declaration(feuille, '.choose-days-month__day', 'width')).toBe('100%')
  })

  it('la zone tactile fait 48 px de haut, le rond 48 px au plus sans déborder de sa colonne', () => {
    expect(declaration(feuille, '.choose-days-month__day', 'min-height')).toBe('48px')
    expect(declaration(feuille, '.choose-days-month__disc', 'width')).toBe('min(48px, 100%)')
    expect(declaration(feuille, '.choose-days-month__disc', 'aspect-ratio')).toBe('1')
  })
})
