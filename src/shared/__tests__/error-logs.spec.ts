// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SKIPPED = [
  'src/core/sync/',
  'src/app/sync.ts',
  'src/core/dev/',
  'src/core/supabase/',
  'src/features/auth/',
  'src/features/purchase/',
]

const CONSOLE_CALL = /console\.(?:warn|error|log|info|debug)\(/g
const SAFE_INTERPOLATIONS = ['scheduled', 'reminders.length', 'label', 'step']

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
  if (/^errorSummary\(\w+\)$/.test(arg)) return true
  if (/^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg)) return true
  if (!/^`[^`]*`$/.test(arg)) return false
  return [...arg.matchAll(/\$\{([^}]*)\}/g)].every((match) =>
    SAFE_INTERPOLATIONS.includes(match[1]?.trim() ?? ''),
  )
}

function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesOf(path)
    return /\.(?:ts|vue)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : []
  })
}

function rawLogArguments(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(CONSOLE_CALL)].flatMap((match) =>
    callArguments(source, (match.index ?? 0) + match[0].length)
      .filter((arg) => !isSafeArgument(arg))
      .map((arg) => `${path} : ${arg}`),
  )
}

describe('journaux de la console', () => {
  const sources = sourcesOf('src').filter(
    (path) => !SKIPPED.some((prefix) => path.startsWith(prefix)),
  )

  it('ne journalise une erreur que par son résumé, sans donnée de carnet ni identifiant', () => {
    expect(sources.length).toBeGreaterThan(100)
    expect(sources.flatMap(rawLogArguments)).toEqual([])
  })

  it('repère une erreur brute passée à la console', () => {
    const source = 'console.warn(`Rappels :`, row.id, cause)'
    const args = callArguments(source, source.indexOf('(') + 1)

    expect(args.filter((arg) => !isSafeArgument(arg))).toEqual(['row.id', 'cause'])
  })

  it('repère une erreur glissée dans le gabarit du message', () => {
    expect(isSafeArgument('`Ligne refusée : ${cause}`')).toBe(false)
  })
})
