import { afterEach, describe, expect, it } from 'vitest'
import { weightSummary } from '../logic/weight-summary'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

function entry(weightKg: number, measuredOn: string) {
  return { weightKg, measuredOn }
}

describe('weightSummary', () => {
  afterEach(() => applyWeightUnit('kg'))

  it('rend null sans pesée', () => {
    expect(weightSummary([])).toBeNull()
  })

  it('prend la dernière pesée comme poids actuel', () => {
    const summary = weightSummary([entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')])!

    expect(summary.latest).toEqual({ weightKg: 24.5, measuredOn: '2026-11-08' })
  })

  it('signale une première pesée quand il n’y en a qu’une', () => {
    const summary = weightSummary([entry(24.5, '2026-11-08')])!

    expect(summary.delta).toEqual({ kind: 'first', measuredOn: '2026-11-08' })
  })

  it('calcule la variation par rapport à la pesée précédente, à la hausse', () => {
    const summary = weightSummary([
      entry(23.6, '2026-06-05'),
      entry(24, '2026-08-05'),
      entry(24.5, '2026-11-08'),
    ])!

    expect(summary.delta).toEqual({
      kind: 'delta',
      deltaKg: 0.5,
      trend: 'up',
      previousMeasuredOn: '2026-08-05',
    })
  })

  it('garde le signe d’une baisse', () => {
    const summary = weightSummary([entry(24.5, '2026-08-05'), entry(24.2, '2026-11-08')])!

    expect(summary.delta).toMatchObject({ deltaKg: expect.closeTo(-0.3, 10), trend: 'down' })
  })

  it('garde l’écart brut et le dit stable sous la décimale affichée', () => {
    const summary = weightSummary([entry(24.5, '2026-08-05'), entry(24.54, '2026-11-08')])!

    expect(summary.delta).toMatchObject({ deltaKg: expect.closeTo(0.04, 10), trend: 'flat' })
  })

  it('juge la tendance à la décimale de l’unité choisie', () => {
    applyWeightUnit('lb')

    const summary = weightSummary([entry(24.5, '2026-08-05'), entry(24.54, '2026-11-08')])!

    expect(summary.delta).toMatchObject({ trend: 'up' })
  })

  it('ne modifie pas le tableau d’entrée', () => {
    const entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    weightSummary(entries)
    expect(entries.map((e) => e.weightKg)).toEqual([23.6, 24.5])
  })
})
