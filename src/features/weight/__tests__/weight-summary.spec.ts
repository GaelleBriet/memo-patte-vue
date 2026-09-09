import { describe, expect, it } from 'vitest'
import { weightSummary } from '../weight-summary'

function entry(weightKg: number, measuredOn: string) {
  return { weightKg, measuredOn }
}

describe('weightSummary', () => {
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

    expect(summary.delta).toMatchObject({ deltaKg: -0.3, trend: 'down' })
  })

  it('est nulle sous la décimale affichée', () => {
    const summary = weightSummary([entry(24.5, '2026-08-05'), entry(24.54, '2026-11-08')])!

    expect(summary.delta).toMatchObject({ deltaKg: 0, trend: 'flat' })
  })

  it('ne modifie pas le tableau d’entrée', () => {
    const entries = [entry(23.6, '2026-06-05'), entry(24.5, '2026-11-08')]
    weightSummary(entries)
    expect(entries.map((e) => e.weightKg)).toEqual([23.6, 24.5])
  })
})
