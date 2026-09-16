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
 * Trois listes posent un titre et un badge sur la même ligne, et toutes trois
 * mettent `min-width: 0` sur la colonne de titre pour que l'ellipse fonctionne.
 * C'est ce `min-width` qui autorise le flex à comprimer le titre sous la largeur
 * de son plus long mot, coupé alors en deux quelle que soit la valeur
 * d'`overflow-wrap`. Le titre ne reste entier que si les trois déclarations sont
 * là ensemble : seul `flex-wrap` fait descendre le badge quand la ligne est trop
 * étroite, et `break-word` évite de couper un mot qui tient sur la sienne.
 */
const LISTES = [
  {
    fichier: 'src/features/home/HomeView.vue',
    ligne: '.reminder-row',
    titre: '.reminder-row__title',
    badge: '.reminder-row__badge',
  },
  {
    fichier: 'src/features/vaccinations/VaccinationsSection.vue',
    ligne: '.vaccination-row',
    titre: '.vaccination-row__name',
    badge: '.vaccination-row__badge',
  },
  {
    fichier: 'src/features/treatments/TreatmentsSection.vue',
    ligne: '.treatment-row',
    titre: '.treatment-row__name',
    badge: '.treatment-row__frequency',
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
