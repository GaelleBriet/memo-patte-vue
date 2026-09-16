// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from '@/shared/__tests__/sass-alias'

function declaration(css: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

function styleCompile(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/features/purchase/PlusView.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)![1]!
  return compileString(bloc, { importers: [aliasSrc] }).css
}

describe('PlusView — contrat de style', () => {
  it('ancre la zone de tap du lien Google Play sur le lien, pas sur l’écran', () => {
    const css = styleCompile()

    expect(declaration(css, '.plus__manage::before', 'position')).toBe('absolute')
    expect(declaration(css, '.plus__manage', 'position')).toBe('relative')
  })

  it('borde l’offre annuelle non cochée sans la faire passer pour cochée', () => {
    const css = styleCompile()

    expect(declaration(css, '.plus-offer--best', 'border-color')).toBe(
      'rgba(var(--v-theme-primary), 0.18)',
    )
  })

  it('laisse le bouton d’achat grandir plutôt que déborder, quel que soit le prix', () => {
    const css = styleCompile()

    expect(declaration(css, '.plus__submit, .plus__retry-offers', 'height')).toBe('auto')
    expect(declaration(css, '.plus__submit, .plus__retry-offers', 'min-height')).toBe('52px')
    expect(declaration(css, '.plus__submit :deep(.v-btn__content)', 'white-space')).toBe('normal')
    expect(declaration(css, '.plus__submit :deep(.v-btn__content)', 'overflow-wrap')).toBe(
      'anywhere',
    )
  })
})
