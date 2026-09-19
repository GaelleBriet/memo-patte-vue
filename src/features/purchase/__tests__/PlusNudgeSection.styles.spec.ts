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
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(source)![1]!
  return compileString(bloc, { importers: [aliasSrc], url: pathToFileURL(fichier) }).css
}

const CSS = styleCompile('src/features/purchase/views/PlusNudgeSection.vue')

describe('PlusNudgeSection — contrat de style', () => {
  it('teinte la carte comme la maquette', () => {
    expect(declaration(CSS, '.plus-nudge', 'background')).toBe('#def1f2')
    expect(declaration(CSS, '.plus-nudge', 'border')).toBe('1px solid #b4d5d7')
    expect(declaration(CSS, '.plus-nudge', 'border-radius')).toBe('16px')
  })

  it('laisse 48 px sous le doigt pour la croix et les deux actions', () => {
    expect(declaration(CSS, '.plus-nudge__close', 'width')).toBe('48px')
    expect(declaration(CSS, '.plus-nudge__close', 'height')).toBe('48px')
    expect(declaration(CSS, '.plus-nudge__discover, .plus-nudge__stop', 'min-height')).toBe('48px')
  })

  it('n’entoure rien au focus clavier, l’app se tient au doigt', () => {
    expect(declaration(CSS, '.plus-nudge__close:focus-visible', 'outline')).toBe('none')
    expect(
      declaration(
        CSS,
        '.plus-nudge__discover:focus-visible, .plus-nudge__stop:focus-visible',
        'outline',
      ),
    ).toBe('none')
  })
})
