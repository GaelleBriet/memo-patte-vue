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
  const sfc = readFileSync(
    resolve(process.cwd(), 'src/features/purchase/views/PlusView.vue'),
    'utf8',
  )
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)![1]!
  return compileString(bloc, { importers: [aliasSrc] }).css
}

describe('PlusView — contrat de style', () => {
  it('ancre la zone de tap des deux liens sur le lien, pas sur l’écran', () => {
    const css = styleCompile()

    expect(declaration(css, '.plus__restore::before, .plus__manage::before', 'position')).toBe(
      'absolute',
    )
    expect(declaration(css, '.plus__restore, .plus__manage', 'position')).toBe('relative')
  })

  it('laisse le bouton de la barre grandir plutôt que déborder, quel que soit le prix', () => {
    const css = styleCompile()

    expect(declaration(css, '.plus__submit, .plus__retry-offers', 'height')).toBe('auto')
    expect(declaration(css, '.plus__submit, .plus__retry-offers', 'min-height')).toBe('52px')
    expect(declaration(css, '.plus__submit :deep(.v-btn__content)', 'white-space')).toBe('normal')
    expect(declaration(css, '.plus__submit :deep(.v-btn__content)', 'overflow-wrap')).toBe(
      'anywhere',
    )
  })

  it.each([
    '.plus-offer__badge',
    '.plus-offer__detail',
    '.plus__disclosure',
    '.plus__terms',
    '.plus__unavailable-hint',
  ])('n’écrit pas sous 12 px : %s', (selecteur) => {
    expect(declaration(styleCompile(), selecteur, 'font-size')).toBe('12px')
  })

  it('ne montre aucun anneau de focus sur une offre touchée', () => {
    expect(declaration(styleCompile(), '.plus-offer:focus-visible', 'outline')).toBe('none')
  })
})
