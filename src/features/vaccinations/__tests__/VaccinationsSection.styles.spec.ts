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

function vueCss(fichier: string): string {
  const sfc = readFileSync(resolve(process.cwd(), fichier), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)![1]!
  return compileString(bloc, { importers: [aliasSrc] }).css
}

describe('VaccinationsSection — contrat de style', () => {
  it('grise le nom d’un vaccin d’un animal qu’on ne suit plus (V15 ter)', () => {
    const css = vueCss('src/features/vaccinations/views/VaccinationsSection.vue')

    expect(declaration(css, '.vaccination-row__name--muted', 'color')).toBe('#68625c')
  })
})
