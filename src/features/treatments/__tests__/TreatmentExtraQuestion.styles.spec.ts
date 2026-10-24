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

// « Replaces the one due Nov 1 at 8 am » était coupé à droite sur un écran de 1080 × 2400 (#1239).
describe('« Cette prise » : un libellé long passe à la ligne, jamais coupé (R5)', () => {
  const feuille = css('src/features/treatments/views/TreatmentExtraQuestion.vue')
  const choix = '.treatment-extra-question .treatment-extra-question__choices'

  it('le texte d’un choix revient à la ligne', () => {
    expect(declaration(feuille, `${choix} .v-btn__content`, 'white-space')).toBe('normal')
  })

  it('les choix grandissent avec leurs lignes, à partir de la hauteur habituelle', () => {
    expect(declaration(feuille, `${choix}.form-segmented`, 'height')).toBe('auto')
    expect(declaration(feuille, `${choix}.form-segmented`, 'min-height')).toBe('48px')
    expect(declaration(feuille, `${choix} .form-segmented__option`, 'height')).toBe('auto')
  })
})
