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

// Vitest ne met pas en page : la mesure réelle est faite dans Chromium (docs/technical/accessibilite.md).
describe('zones de tap de 48 px, sans changement de rendu', () => {
  it.each([
    ['src/shared/components/AnimalChipSelector.vue', '.animal-chip::before'],
    ['src/shared/components/AnimalChipSelector.vue', '.animal-chip-selector__add::before'],
    ['src/shared/components/BottomSheet.vue', '.bottom-sheet__close::before'],
    ['src/shared/form/FormScreen.vue', '.form-screen__cancel::before'],
    ['src/shared/components/NotificationPrimingView.vue', '.notification-priming__later::before'],
    ['src/features/home/HomeView.vue', '.home-up-to-date__add::before'],
    ['src/features/settings/ImportSheet.vue', '.import-confirm__actions .v-btn::before'],
    ['src/features/weight/views/WeightHistoryView.vue', '.weight-history__retry::before'],
  ])('%s — %s', (fichier, selecteur) => {
    const feuille = css(fichier)

    expect(declaration(feuille, selecteur, 'width')).toBe('max(100%, 48px)')
    expect(declaration(feuille, selecteur, 'height')).toBe('max(100%, 48px)')
    expect(declaration(feuille, selecteur, 'background')).toBeUndefined()
  })

  it('laisse la zone agrandie des chips dépasser de la chip et de la rangée défilante', () => {
    const feuille = css('src/shared/components/AnimalChipSelector.vue')

    expect(declaration(feuille, '.animal-chip', 'overflow')).toBe('visible')
    expect(
      declaration(
        feuille,
        '.animal-chip-selector__group :deep(.v-slide-group__content)',
        'padding-block',
      ),
    ).toBe('3px')
    expect(declaration(feuille, '.animal-chip-selector__group', 'margin-block')).toBe('-3px')
  })

  it('donne à la poignée d’une feuille 48 px de haut, posée au-dessus du titre', () => {
    const feuille = css('src/shared/components/BottomSheet.vue')

    expect(declaration(feuille, '.bottom-sheet__handle', 'height')).toBe('48px')
    expect(declaration(feuille, '.bottom-sheet__handle', 'position')).toBe('absolute')
    expect(declaration(feuille, '.bottom-sheet__panel', 'padding')).toBe('34px 20px 24px')
  })

  it('étend la zone de « Retirer la photo » vers le bas, loin du bouton photo', () => {
    const feuille = css('src/features/animals/views/AnimalPhotoField.vue')

    expect(declaration(feuille, '.animal-photo__remove::before', 'top')).toBe('0')
    expect(declaration(feuille, '.animal-photo__remove::before', 'height')).toBe('48px')
  })
})
