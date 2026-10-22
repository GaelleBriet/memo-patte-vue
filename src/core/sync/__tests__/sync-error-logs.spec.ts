// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SYNC_SOURCES = [
  'src/core/sync/service/sync-cycle.ts',
  'src/core/sync/service/restore-flow.ts',
  'src/app/sync.ts',
]

const CONSOLE_CALL = /console\.(?:warn|error|log|info|debug)\(/g

function closingQuote(source: string, start: number): number {
  const quote = source[start]
  let index = start + 1
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') index++
    index++
  }
  return index
}

/** Les arguments de l'appel ouvert à `start`, découpés aux virgules de premier niveau. */
function callArguments(source: string, start: number): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === "'" || char === '"' || char === '`') {
      const end = closingQuote(source, index)
      current += source.slice(index, end + 1)
      index = end
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth++
    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) {
        if (current.trim() !== '') args.push(current.trim())
        return args
      }
      depth--
    }
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  throw new Error(`Appel de console non refermé à la position ${start}`)
}

function isSafeArgument(arg: string): boolean {
  if (/^errorSummary\([^()]*\)$/.test(arg)) return true
  if (/^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg)) return true
  if (!/^`[^`]*`$/.test(arg)) return false
  const interpolations = [...arg.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1]?.trim())
  return interpolations.every(
    (expression) => expression !== undefined && expression.endsWith('.entity'),
  )
}

function rawLogArguments(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(CONSOLE_CALL)].flatMap((match) =>
    callArguments(source, (match.index ?? 0) + match[0].length)
      .filter((arg) => !isSafeArgument(arg))
      .map((arg) => `${path} : ${arg}`),
  )
}

describe('journaux de la synchro', () => {
  it.each(SYNC_SOURCES)('%s ne journalise une erreur que par son résumé', (path) => {
    expect(rawLogArguments(path)).toEqual([])
  })

  it('repère une erreur brute passée à la console', () => {
    const source = 'console.warn(`Ligne (${entry.entity}) :`, cause)'
    const args = callArguments(source, source.indexOf('(') + 1)

    expect(args.filter((arg) => !isSafeArgument(arg))).toEqual(['cause'])
  })

  it('repère une erreur glissée dans le gabarit du message', () => {
    expect(isSafeArgument('`Ligne refusée : ${cause}`')).toBe(false)
  })
})
