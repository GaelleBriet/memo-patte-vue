// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
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

function styleCompile(chemin: string): string {
  const fichier = resolve(process.cwd(), chemin)
  const source = readFileSync(fichier, 'utf8')
  const bloc = chemin.endsWith('.vue')
    ? /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(source)![1]!
    : source
  return compileString(bloc, { importers: [aliasSrc], url: pathToFileURL(fichier) }).css
}

describe('PlusSection — contrat de style', () => {
  it('teinte le bandeau « en pause » comme la maquette, et non en gris', () => {
    const css = styleCompile('src/features/purchase/PlusSection.vue')

    expect(declaration(css, '.plus-paused', 'background')).toBe('#def1f2')
    expect(declaration(css, '.plus-paused', 'border')).toBe('1px solid #b4d5d7')
  })

  it('cale l’icône du bandeau sur la première ligne de texte', () => {
    const css = styleCompile('src/features/purchase/PlusSection.vue')

    expect(declaration(css, '.plus-paused__body', 'align-items')).toBe('flex-start')
  })

  it('cale l’icône d’une ligne de réglage à libellé long sur sa première ligne', () => {
    const css = styleCompile('src/styles/_settings-row.scss')

    expect(declaration(css, '.settings-row--multiline', 'align-items')).toBe('flex-start')
  })
})
