// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

import { aliasSrc } from './sass-alias'

function regles(): { selecteur: string; declarations: string }[] {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/components/HistoryRow.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans HistoryRow.vue')
  const css = compileString(bloc, { importers: [aliasSrc] }).css
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((regle) => ({
    selecteur: regle[1]!.trim().replace(/\s+/g, ' '),
    declarations: regle[2]!,
  }))
}

/** Poids retenu pour une date : la dernière règle qui le déclare l'emporte, à spécificité égale. */
function poids(classes: string[]): string | undefined {
  return regles()
    .filter(({ selecteur }) => classes.includes(selecteur))
    .map(({ declarations }) => /(?:^|;)\s*font-weight:\s*([^;]+)/.exec(declarations)?.[1]?.trim())
    .filter((valeur) => valeur !== undefined)
    .at(-1)
}

describe('HistoryRow — poids des dates', () => {
  it('écrit une date en gras, et une prise précédente en poids normal (500)', () => {
    expect(poids(['.history-row__date'])).toBe('700')
    expect(poids(['.history-row__date', '.history-row__date--regular'])).toBe('500')
  })
})
