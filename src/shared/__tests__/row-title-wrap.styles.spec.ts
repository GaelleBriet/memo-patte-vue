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

// `anywhere` ramène la largeur minimale du titre à zéro : la colonne cède toute sa
// place au badge et coupe un mot en deux à 360 px. `break-word` garde la protection
// contre le débordement à 130 %, sans casser un mot qui tient sur sa ligne.
describe('un titre de ligne passe à la ligne sans couper les mots', () => {
  it.each([
    ['src/features/home/HomeView.vue', '.reminder-row__title'],
    ['src/features/vaccinations/VaccinationsSection.vue', '.vaccination-row__name'],
    ['src/features/treatments/TreatmentsSection.vue', '.treatment-row__name'],
  ])('%s — %s', (fichier, selecteur) => {
    expect(declaration(css(fichier), selecteur, 'overflow-wrap')).toBe('break-word')
  })
})
