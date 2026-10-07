// @vitest-environment node
import { describe, expect, it } from 'vitest'

import i18n from '../index'
import en from '../locales/en.json'
import fr from '../locales/fr.json'

function leaves(node: unknown, path: string[] = []): [string, string][] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => leaves(child, [...path, key]))
  }
  return [[path.join('.'), String(node)]]
}

const pluralKeys = (messages: unknown) =>
  leaves(messages)
    .map(([key, value]) => [key, value.split(' | ')] as const)
    .filter(([, branches]) => branches.length > 1)

function render(locale: 'fr' | 'en', key: string, source: string, n: number): string {
  const placeholders = Object.fromEntries(
    [...source.matchAll(/\{(\w+)\}/g)].map(([literal, name]) => [name, literal]),
  )
  return i18n.global.t(key, { ...placeholders, n }, { plural: n, locale })
}

function branch(branches: readonly string[], index: number, n: number): string {
  return branches[index]!.trim().replaceAll('{n}', String(n))
}

const expectedForm: Record<number, readonly number[]> = { 2: [0, 0, 1], 3: [0, 1, 2] }

const frenchCases = pluralKeys(fr).flatMap(([key, branches]) =>
  [0, 1, 2].map((n) => [key, n, expectedForm[branches.length]![n]!, branches] as const),
)

describe('pluriel', () => {
  it('fr compte des clés à deux et à trois formes', () => {
    const lengths = new Set(pluralKeys(fr).map(([, branches]) => branches.length))

    expect(lengths).toEqual(new Set([2, 3]))
  })

  it.each(frenchCases)('fr %s : %i prend la forme %i', (key, n, index, branches) => {
    expect(render('fr', key, branches.join(' | '), n)).toBe(branch(branches, index, n))
  })

  it.each(pluralKeys(en).filter(([, branches]) => branches.length === 2))(
    'en %s garde le pluriel pour 0',
    (key, branches) => {
      expect(render('en', key, branches.join(' | '), 0)).toBe(branch(branches, 1, 0))
    },
  )

  it('fr laisse les non-entiers à la règle d’origine', () => {
    expect(i18n.global.t('dosage.unit.tablet', 1.5, { locale: 'fr' })).toBe('comprimés')
  })
})
