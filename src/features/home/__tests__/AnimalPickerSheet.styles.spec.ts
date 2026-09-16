// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileString } from 'sass'

// Vitest tourne avec `css: false` et jsdom ne met pas en page : ces tests compilent
// le bloc `<style>` et vérifient des déclarations, jamais la géométrie rendue.
const COMPOSANT = resolve(process.cwd(), 'src/features/home/AnimalPickerSheet.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable')

  // L'alias `@/` est résolu par Vite, pas par sass.
  const scss = bloc.replaceAll("@use '@/styles/", "@use '")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

let css: string

beforeAll(() => {
  css = cssDuComposant()
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('AnimalPickerSheet — contrat de style', () => {
  it('donne un avatar rond de 40 px à chaque ligne', () => {
    expect(declaration('.animal-picker-sheet__avatar', 'width')).toBe('40px')
    expect(declaration('.animal-picker-sheet__avatar', 'border-radius')).toBe('50%')
  })

  // `--v-theme-primary` vaut « 1,56,62 » : la syntaxe `rgb(var() / %)` refuse ces virgules
  // et le navigateur jette la déclaration, sans rien signaler.
  it('teinte la ligne appuyée avec une couleur que le navigateur sait calculer', () => {
    expect(
      declaration(
        '.animal-picker-sheet__animal:hover, .animal-picker-sheet__animal:focus-visible',
        'background',
      ),
    ).toBe('rgba(var(--v-theme-primary), 0.06)')
  })
})
