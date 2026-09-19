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

function sansBlocsHoverMedia(feuille: string): string {
  return feuille.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}\n/g, '')
}

const REGLES = [
  {
    fichier: 'src/features/home/views/AnimalPickerSheet.vue',
    selecteur: '.animal-picker-sheet__animal',
  },
  {
    fichier: 'src/features/home/views/HomeView.vue',
    selecteur: '.home-up-to-date__add',
  },
  {
    fichier: 'src/features/home/views/HomeView.vue',
    selecteur: '.home-welcome__import',
  },
] as const

describe('les états :hover restent derrière @media (hover: hover)', () => {
  it.each(REGLES)('$selecteur ($fichier)', ({ fichier, selecteur }) => {
    const feuille = css(fichier)
    const echappe = selecteur.replace('.', '\\.')

    expect(feuille).toMatch(new RegExp(`@media \\(hover: hover\\) \\{\\s*${echappe}:hover \\{`))

    const horsMedia = sansBlocsHoverMedia(feuille)
    expect(horsMedia).not.toMatch(new RegExp(`${echappe}:hover`))
    expect(horsMedia).toMatch(new RegExp(`${echappe}:focus-visible`))
  })
})
