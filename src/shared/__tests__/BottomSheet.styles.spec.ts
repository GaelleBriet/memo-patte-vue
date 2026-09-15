// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

import { aliasSrc } from './sass-alias'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
function css(fichier: string): string {
  const sfc = readFileSync(resolve(process.cwd(), fichier), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error(`bloc <style lang="scss"> introuvable dans ${fichier}`)

  return compileString(bloc, { importers: [aliasSrc] }).css
}

let feuille: string

beforeAll(() => {
  feuille = css('src/shared/BottomSheet.vue')
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('BottomSheet — contrat de style', () => {
  it('arrondit les coins hauts à 24 px et pose le voile', () => {
    expect(declaration('.bottom-sheet__content', 'border-radius')).toBe('24px 24px 0 0')
    expect(declaration('.bottom-sheet .v-overlay__scrim', 'background')).toBe('rgb(20, 26, 26)')
  })

  it('offre une poignée tapable sur 48 px de haut', () => {
    expect(declaration('.bottom-sheet__handle', 'height')).toBe('48px')
  })

  it('dessine la pilule de 36 × 4 px, couleur poignée', () => {
    expect(declaration('.bottom-sheet__handle::before', 'width')).toBe('36px')
    expect(declaration('.bottom-sheet__handle::before', 'height')).toBe('4px')
    expect(declaration('.bottom-sheet__handle::before', 'background')).toBe('#c1bdb7')
  })

  it('pose le titre à 34 px du bord, sous la zone de tap de la poignée', () => {
    expect(declaration('.bottom-sheet__panel', 'padding')).toBe('34px 20px 24px')
    expect(declaration('.bottom-sheet__header', 'margin-top')).toBeUndefined()
  })
})

describe('Feuilles modales — le patron reste à BottomSheet', () => {
  it.each(['src/features/weight/WeightSheet.vue', 'src/features/home/AnimalPickerSheet.vue'])(
    '%s ne recopie ni voile, ni poignée, ni coins',
    (fichier) => {
      const styles = css(fichier)

      expect(styles).not.toContain('v-overlay__scrim')
      expect(styles).not.toContain('__handle')
      expect(styles).not.toContain('border-radius: 24px 24px 0 0')
    },
  )
})
