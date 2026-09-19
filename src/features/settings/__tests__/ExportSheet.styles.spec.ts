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

describe('ExportSheet — contrat de style', () => {
  it('écarte le spinner de « Préparation… » : le contenu du bouton n’hérite pas du gap', () => {
    const sfc = readFileSync(
      resolve(process.cwd(), 'src/features/settings/views/ExportSheet.vue'),
      'utf8',
    )
    const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)![1]!
    const css = compileString(bloc, { importers: [aliasSrc] }).css

    expect(declaration(css, '.export-sheet__spinner', 'margin-inline-end')).toBe('8px')
  })
})
