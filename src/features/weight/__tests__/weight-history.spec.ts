import { describe, expect, it } from 'vitest'

import { weightHistory } from '../logic/weight-history'

let sequence = 0

function entry(weightKg: number, measuredOn: string) {
  sequence += 1
  return { id: `pesee-${sequence}`, weightKg, measuredOn }
}

describe('weightHistory — état de l’écran', () => {
  it('H3 : sans pesée, ni poids actuel ni lignes', () => {
    const history = weightHistory([], null)

    expect(history.state).toBe('empty')
    expect(history.current).toBeNull()
    expect(history.headline).toBeNull()
    expect(history.rows).toEqual([])
  })

  it('H2 : une seule pesée, datée comme première pesée', () => {
    const history = weightHistory([entry(24.5, '2026-11-08')], null)

    expect(history.state).toBe('single')
    expect(history.current).toEqual({ weightKg: 24.5, measuredOn: '2026-11-08' })
    expect(history.headline).toEqual({ kind: 'first', measuredOn: '2026-11-08' })
  })

  it('H1 : à partir de deux pesées, l’historique est complet', () => {
    const history = weightHistory([entry(24.3, '2026-10-11'), entry(24.5, '2026-11-08')], null)

    expect(history.state).toBe('full')
    expect(history.current).toEqual({ weightKg: 24.5, measuredOn: '2026-11-08' })
  })
})

describe('weightHistory — delta du poids actuel', () => {
  it('compare à la date de la pesée précédente quand le poids monte', () => {
    const history = weightHistory([entry(24, '2026-08-09'), entry(24.5, '2026-11-08')], null)

    expect(history.headline).toEqual({
      kind: 'delta',
      previousKg: 24,
      latestKg: 24.5,
      trend: 'up',
      previousMeasuredOn: '2026-08-09',
    })
  })

  it('garde le signe d’une baisse', () => {
    const history = weightHistory([entry(24.5, '2026-08-09'), entry(24.2, '2026-11-08')], null)

    expect(history.headline).toMatchObject({
      kind: 'delta',
      previousKg: 24.5,
      latestKg: 24.2,
      trend: 'down',
    })
  })

  it('date aussi une variation nulle à la décimale près', () => {
    const history = weightHistory([entry(24.5, '2026-08-09'), entry(24.54, '2026-11-08')], null)

    expect(history.headline).toEqual({
      kind: 'delta',
      previousKg: 24.5,
      latestKg: 24.54,
      trend: 'flat',
      previousMeasuredOn: '2026-08-09',
    })
  })
})

describe('weightHistory — liste « Toutes les pesées »', () => {
  const milo = [
    entry(23.6, '2026-06-07'),
    entry(23.8, '2026-07-12'),
    entry(24, '2026-08-09'),
    entry(24.2, '2026-09-13'),
    entry(24.3, '2026-10-11'),
    entry(24.5, '2026-11-08'),
  ]

  it('met la pesée la plus récente en haut', () => {
    const rows = weightHistory(milo, null).rows

    expect(rows.map((row) => row.measuredOn)).toEqual([
      '2026-11-08',
      '2026-10-11',
      '2026-09-13',
      '2026-08-09',
      '2026-07-12',
      '2026-06-07',
    ])
    expect(rows[0]).toMatchObject({ id: milo[5]!.id, weightKg: 24.5 })
  })

  it('donne à chaque ligne son delta par rapport à la pesée immédiatement précédente, datée', () => {
    const rows = weightHistory(milo, null).rows

    expect(rows.map((row) => row.delta?.previousKg)).toEqual([
      24.3,
      24.2,
      24,
      23.8,
      23.6,
      undefined,
    ])
    expect(rows[0]!.delta).toEqual({
      previousKg: 24.3,
      latestKg: 24.5,
      trend: 'up',
      previousMeasuredOn: '2026-10-11',
    })
  })

  it('laisse la toute première pesée sans delta', () => {
    const rows = weightHistory(milo, null).rows

    expect(rows[rows.length - 1]!.delta).toBeNull()
  })

  it('classe les baisses et les deltas nuls', () => {
    const rows = weightHistory(
      [entry(24.5, '2026-08-09'), entry(24.2, '2026-09-13'), entry(24.2, '2026-10-11')],
      null,
    ).rows

    expect(rows.map((row) => row.delta)).toEqual([
      { previousKg: 24.2, latestKg: 24.2, trend: 'flat', previousMeasuredOn: '2026-09-13' },
      { previousKg: 24.5, latestKg: 24.2, trend: 'down', previousMeasuredOn: '2026-08-09' },
      null,
    ])
  })

  it('une seule pesée : une ligne, sans delta', () => {
    const rows = weightHistory([entry(24.5, '2026-11-08')], null).rows

    expect(rows).toHaveLength(1)
    expect(rows[0]!.delta).toBeNull()
  })

  it('ne modifie pas le tableau d’entrée', () => {
    const entries = [entry(23.6, '2026-06-07'), entry(24.5, '2026-11-08')]
    weightHistory(entries, null)

    expect(entries.map((item) => item.weightKg)).toEqual([23.6, 24.5])
  })
})

describe('weightHistory — poids à l’arrivée', () => {
  it('le reprend tel quel, même sans pesée', () => {
    expect(weightHistory([], 8.5).initialWeightKg).toBe(8.5)
    expect(weightHistory([entry(24.5, '2026-11-08')], 8.5).initialWeightKg).toBe(8.5)
  })

  it('reste absent quand l’animal n’en a pas', () => {
    expect(weightHistory([], null).initialWeightKg).toBeNull()
  })

  it('n’est jamais injecté comme pesée', () => {
    const history = weightHistory([entry(24.5, '2026-11-08')], 8.5)

    expect(history.state).toBe('single')
    expect(history.rows).toHaveLength(1)
  })
})
