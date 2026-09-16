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

describe('PlusSection — contrat de style', () => {
  it('étend la zone de tap de « Réactiver Plus » à tout le bandeau', () => {
    const sfc = readFileSync(
      resolve(process.cwd(), 'src/features/purchase/PlusSection.vue'),
      'utf8',
    )
    const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)![1]!
    const css = compileString(bloc, { importers: [aliasSrc] }).css

    expect(declaration(css, '.plus-paused', 'position')).toBe('relative')
    expect(declaration(css, '.plus-paused__action::after', 'position')).toBe('absolute')
    expect(declaration(css, '.plus-paused__action::after', 'inset')).toBe('0')
    expect(declaration(css, '.plus-paused__action:focus-visible', 'outline')).toBe('none')
  })
})
