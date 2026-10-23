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

describe('la fréquence du formulaire de traitement suit la police agrandie', () => {
  const feuille = css('src/features/treatments/views/TreatmentFormView.vue')

  it('passe le choix de l’unité sous « Tous les » quand la ligne ne suffit plus', () => {
    expect(declaration(feuille, '.treatment-form__frequency', 'flex-wrap')).toBe('wrap')
    expect(declaration(feuille, '.treatment-form__unit', 'flex')).toBe('1 1 auto')
    expect(declaration(feuille, '.treatment-form__unit', 'min-width')).toBe('min-content')
  })
})

describe('le champ d’heure invisible couvre toute la pastille, bordure comprise', () => {
  const feuille = css('src/features/treatments/views/TreatmentTimesField.vue')

  it('déborde de la bordure de 1,5 px pour que les 48 px de la pastille ouvrent le sélecteur', () => {
    expect(declaration(feuille, '.treatment-times__input', 'inset')).toBe('-1.5px')
    expect(declaration(feuille, '.treatment-times__input', 'width')).toBe('calc(100% + 3px)')
    expect(declaration(feuille, '.treatment-times__input', 'height')).toBe('calc(100% + 3px)')
  })
})
