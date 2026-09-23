// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'
import { paddingBottomNav } from '@/core/theme/layout-tokens'

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

function pixels(valeur: string | undefined): number {
  const mesure = /^(\d+(?:\.\d+)?)px$/.exec(valeur?.trim() ?? '')
  if (!mesure) throw new Error(`valeur en pixels attendue, reçu « ${valeur} »`)
  return Number(mesure[1])
}

function espaceBas(
  feuille: string,
  selecteur: string,
  propriete: 'padding' | 'margin' = 'padding',
): number {
  const bas = declaration(feuille, selecteur, `${propriete}-bottom`)
  if (bas) return pixels(bas)

  const bloc = declaration(feuille, selecteur, `${propriete}-block`)?.split(/\s+/)
  if (bloc) return pixels(bloc.at(-1))

  const raccourci = declaration(feuille, selecteur, propriete)?.split(/\s+/)
  if (!raccourci) throw new Error(`aucun ${propriete} sur ${selecteur}`)
  return pixels(raccourci.length >= 3 ? raccourci[2] : raccourci[0])
}

// La bottom navigation ne comble plus le bas d'un écran poussé : chacun garde
// lui-même de quoi passer au-dessus de la zone de gestes Android.
describe('zone de gestes sous le dernier élément d’un écran poussé', () => {
  it.each([
    ['src/shared/form/FormScreen.vue', '.form-screen__actions'],
    ['src/features/weight/views/WeightHistoryView.vue', '.weight-history__actions'],
    ['src/features/purchase/views/PlusView.vue', '.plus__content'],
    ['src/features/purchase/views/PlusView.vue', '.plus__checkout'],
    ['src/features/settings/views/SettingsView.vue', '.settings__content'],
    ['src/features/settings/views/AnalyticsConsentView.vue', '.analytics-consent'],
    ['src/shared/components/NotificationPrimingView.vue', '.notification-priming'],
    ['src/shared/components/BottomSheet.vue', '.bottom-sheet__panel'],
  ])('%s — %s', (fichier, selecteur) => {
    expect(espaceBas(css(fichier), selecteur)).toBeGreaterThanOrEqual(paddingBottomNav)
  })

  it('src/shared/components/AppToast.vue — .app-toast, par sa marge du bas', () => {
    const feuille = css('src/shared/components/AppToast.vue')

    expect(espaceBas(feuille, '.app-toast', 'margin')).toBeGreaterThanOrEqual(paddingBottomNav)
  })
})
