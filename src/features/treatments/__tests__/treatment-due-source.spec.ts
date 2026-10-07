// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { treatmentSchema, type Treatment } from '../schema/treatment.schema'

const ENGINE = /^src\/shared\/domain\/treatment-schedule[\w-]*\.ts$/

function productionSources(dir = 'src'): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : productionSources(path)
    if (!/\.(ts|vue)$/.test(entry) || entry.endsWith('.spec.ts') || ENGINE.test(path)) return []
    return [{ path, source: readFileSync(path, 'utf8') }]
  })
}

function offenders(pattern: RegExp): string[] {
  return productionSources().flatMap(({ path, source }) =>
    [...source.matchAll(pattern)].map(([match]) => `${path} : ${match}`),
  )
}

type Forbidden = Extract<keyof Treatment, 'nextDueDate' | 'lastDoseDate'>
const noForbiddenKey: [Forbidden] extends [never] ? true : false = true

describe('échéances de traitement lues par le moteur seul', () => {
  it('le traitement lu ne porte ni prochaine dose ni dernière prise', () => {
    expect(noForbiddenKey).toBe(true)
    expect(Object.keys(treatmentSchema.shape)).not.toContain('nextDueDate')
    expect(Object.keys(treatmentSchema.shape)).not.toContain('lastDoseDate')
  })

  it('aucun écran ni service ne lit une échéance sur un traitement', () => {
    expect(offenders(/\b\w*treatments?\w*\??\.(?:nextDueDate|lastDoseDate)\b/gi)).toEqual([])
  })

  it('aucune requête ne projette une échéance de traitement depuis ses prises', () => {
    expect(offenders(/\bAS\s+(?:next_due_date|last_dose_date)\b/gi)).toEqual([])
    expect(offenders(/COALESCE\([^)]*next_due_date/gi)).toEqual([])
  })
})
