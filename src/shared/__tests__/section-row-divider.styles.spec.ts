// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function css(fichier: string): string {
  const sfc = readFileSync(resolve(process.cwd(), fichier), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error(`bloc <style lang="scss"> introuvable dans ${fichier}`)
  return compileString(bloc, { importers: [aliasSrc] }).css
}

function regles(feuille: string): { selecteurs: string[]; declarations: string }[] {
  return [...feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((regle) => ({
    selecteurs: regle[1]!.split(',').map((selecteur) => selecteur.trim().replace(/\s+/g, ' ')),
    declarations: regle[2]!,
  }))
}

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  const regle = regles(feuille).find(({ selecteurs }) => selecteurs.includes(selecteur))
  return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`)
    .exec(regle?.declarations ?? '')?.[1]
    ?.trim()
}

/**
 * Le filet entre deux lignes d'une carte vient de `.section-card__row + .section-card__row`.
 * Une section dont les lignes sont des boutons ne doit pas remettre leur bordure à zéro : sa règle
 * scopée, de même spécificité et chargée après, effacerait le filet.
 */
const SECTIONS = [
  'src/features/vaccinations/views/VaccinationsSection.vue',
  'src/features/treatments/views/TreatmentsSection.vue',
]

const REMISE_A_ZERO = /(?:^|;)\s*border(?:-top)?(?:-width|-style)?\s*:\s*(?:0|none)\s*(?:;|$)/

describe('filet entre les lignes-boutons d’une carte de section', () => {
  it.each(SECTIONS)('%s ne remet pas à zéro la bordure de ses lignes', (fichier) => {
    const remises = regles(css(fichier)).filter(
      ({ selecteurs, declarations }) =>
        selecteurs.some((selecteur) => selecteur.includes('-row')) &&
        REMISE_A_ZERO.test(declarations),
    )

    expect(remises.flatMap(({ selecteurs }) => selecteurs)).toEqual([])
  })

  it('SectionCard efface la bordure d’un bouton sous la spécificité du filet', () => {
    const carte = css('src/shared/components/SectionCard.vue')

    expect(declaration(carte, 'button.section-card__row', 'border')).toBe('0')
    expect(declaration(carte, '.section-card__row + .section-card__row', 'border-top')).toBe(
      '1px solid #efece8',
    )
  })
})
