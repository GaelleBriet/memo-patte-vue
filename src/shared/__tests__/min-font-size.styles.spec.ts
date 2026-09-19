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

describe('aucun texte sous 12 px', () => {
  it.each([
    ['src/features/animals/views/CarnetView.vue', '.carnet-stat__label'],
    ['src/features/animals/views/CarnetView.vue', '.carnet-stat__sub'],
    ['src/features/weight/WeightHistoryView.vue', '.weight-history__current-label'],
    ['src/shared/components/WeightSparkline.vue', '.weight-sparkline__months'],
    ['src/shared/components/BottomNavigation.vue', '.bottom-navigation :deep(.v-btn)'],
  ])('%s — %s', (fichier, selecteur) => {
    expect(declaration(css(fichier), selecteur, 'font-size')).toBe('12px')
  })

  it('laisse la taille des valeurs de la courbe au composant, qui la corrige de l’échelle du SVG', () => {
    expect(
      declaration(
        css('src/shared/components/WeightSparkline.vue'),
        '.weight-sparkline__value',
        'font-size',
      ),
    ).toBeUndefined()
  })
})
