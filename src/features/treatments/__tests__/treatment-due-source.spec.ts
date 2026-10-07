// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { treatmentSchema, type Treatment } from '../schema/treatment.schema'

function productionSources(dir: string): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : productionSources(path)
    if (!/\.(ts|vue)$/.test(entry) || entry.endsWith('.spec.ts')) return []
    return [{ path, source: readFileSync(path, 'utf8') }]
  })
}

function offenders(dir: string, pattern: RegExp): string[] {
  return productionSources(dir).flatMap(({ path, source }) =>
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

  it('aucun module de l’app ne garde un calcul d’échéance hors du moteur', () => {
    expect(offenders('src', /\b(?:addFrequency|periodHeads|headDoseIdSql)\b/g)).toEqual([])
  })

  it('aucune requête des traitements ne projette une échéance depuis ses prises', () => {
    const treatments = 'src/features/treatments'
    expect(offenders(treatments, /\bAS\s+(?:next_due_date|last_dose_date)\b/gi)).toEqual([])
    expect(offenders(treatments, /COALESCE\([^)]*next_due_date/gi)).toEqual([])
  })
})
