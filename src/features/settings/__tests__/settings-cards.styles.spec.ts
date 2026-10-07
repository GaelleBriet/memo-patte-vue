// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile, compileString } from 'sass'
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

describe('cartes des rubriques de Paramètres — contrat de style', () => {
  it('arrondit toutes les cartes de 22 px, comme les planches V19 à V23', () => {
    const global = compile(resolve(process.cwd(), 'src/styles/_settings-row.scss')).css

    expect(declaration(global, '.settings-card', 'border-radius')).toBe('22px')
    expect(
      declaration(
        vueCss('src/features/settings/views/RemindersSettingsView.vue'),
        '.reminders-settings__card',
        'border-radius',
      ),
    ).toBe('22px')
    expect(
      declaration(
        vueCss('src/features/settings/views/BackupSettingsView.vue'),
        '.backup-settings__card',
        'border-radius',
      ),
    ).toBe('22px')
  })
})
