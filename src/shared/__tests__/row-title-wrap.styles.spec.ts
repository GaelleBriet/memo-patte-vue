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

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

/**
 * Trois listes posent un titre et un badge sur la même ligne. Le titre ne reste
 * entier que si les trois déclarations sont là ensemble : seul `flex-wrap` fait
 * descendre le badge quand la ligne est trop étroite, et `break-word` évite de
 * couper un mot qui tient sur la sienne.
 */
const LISTES = [
  {
    fichier: 'src/features/home/views/HomeTodoCard.vue',
    ligne: '.reminder-row',
    titre: '.reminder-row__title',
    badge: '.reminder-row__badge',
  },
  {
    fichier: 'src/features/vaccinations/views/VaccinationsSection.vue',
    ligne: '.vaccination-row',
    titre: '.vaccination-row__name',
    badge: '.vaccination-row__badge',
  },
  {
    fichier: 'src/features/treatments/views/TreatmentsSection.vue',
    ligne: '.treatment-row',
    titre: '.treatment-row__name',
    badge: '.treatment-row__badge',
  },
] as const

describe('un titre de ligne passe à la ligne sans couper les mots', () => {
  it.each(LISTES)('$fichier', ({ fichier, ligne, titre, badge }) => {
    const feuille = css(fichier)

    expect(declaration(feuille, titre, 'overflow-wrap')).toBe('break-word')
    expect(declaration(feuille, ligne, 'flex-wrap')).toBe('wrap')
    expect(declaration(feuille, badge, 'margin-inline-start')).toBe('auto')
  })
})

/**
 * Une colonne `flex: 1 1 auto` réclame la largeur de toute sa phrase : un détail long
 * envoyait badge et chevron sous le texte (#585). Base nulle, et largeur minimale
 * automatique (le plus long mot) bornée par `max-width` à la place laissée par la
 * pastille : bornée à toute la ligne, un mot long passait sous la pastille.
 */
const LIGNES_DU_CARNET = [
  {
    fichier: 'src/features/vaccinations/views/VaccinationsSection.vue',
    texte: '.vaccination-row__text',
  },
  { fichier: 'src/features/treatments/views/TreatmentsSection.vue', texte: '.treatment-row__text' },
] as const

describe('Carnet : un détail long passe à la ligne sans pousser le chevron dessous', () => {
  it.each(LIGNES_DU_CARNET)('$fichier', ({ fichier, texte }) => {
    const feuille = css(fichier)

    expect(declaration(feuille, texte, 'flex')).toBe('1 1 0')
    expect(declaration(feuille, texte, 'max-width')).toBe('calc(100% - 36px - 12px)')
    expect(declaration(feuille, texte, 'min-width')).toBeUndefined()
  })
})
