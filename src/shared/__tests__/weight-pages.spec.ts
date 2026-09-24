import { describe, expect, it } from 'vitest'

import { WEIGHT_PAGE_SIZE, weightPagePeriod, weightPages } from '../domain/weight-pages'

function pesees(count: number): { measuredOn: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    measuredOn: new Date(Date.UTC(2025, 6, 1 + index * 14)).toISOString().slice(0, 10),
  }))
}

describe('weightPages', () => {
  it('compte douze pesées par page', () => {
    expect(WEIGHT_PAGE_SIZE).toBe(12)
  })

  it('découpe depuis la plus récente : la page la plus ancienne garde le reste', () => {
    expect(weightPages(30)).toEqual([
      { start: 0, end: 6 },
      { start: 6, end: 18 },
      { start: 18, end: 30 },
    ])
  })

  it('tient en une page jusqu’à douze pesées', () => {
    expect(weightPages(2)).toEqual([{ start: 0, end: 2 }])
    expect(weightPages(12)).toEqual([{ start: 0, end: 12 }])
  })

  it('ouvre une page de plus dès la treizième, même pour une seule pesée', () => {
    expect(weightPages(13)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 13 },
    ])
    expect(weightPages(24)).toEqual([
      { start: 0, end: 12 },
      { start: 12, end: 24 },
    ])
  })

  it('ne rend aucune page sans pesée', () => {
    expect(weightPages(0)).toEqual([])
  })

  it('accepte une autre taille de page', () => {
    expect(weightPages(5, 2)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
      { start: 3, end: 5 },
    ])
  })
})

describe('weightPagePeriod', () => {
  const trente = pesees(30)

  it('borne la page par sa première et sa dernière pesée, et les compte', () => {
    expect(weightPagePeriod(trente, { start: 18, end: 30 })).toEqual({
      from: trente[18]!.measuredOn,
      to: trente[29]!.measuredOn,
      count: 12,
      isStart: false,
    })
  })

  it('marque le début du suivi sur la page qui porte la toute première pesée', () => {
    expect(weightPagePeriod(trente, { start: 0, end: 6 })).toEqual({
      from: trente[0]!.measuredOn,
      to: trente[5]!.measuredOn,
      count: 6,
      isStart: true,
    })
  })

  it('borne une page d’une seule pesée par cette pesée', () => {
    const treize = pesees(13)

    expect(weightPagePeriod(treize, { start: 0, end: 1 })).toEqual({
      from: treize[0]!.measuredOn,
      to: treize[0]!.measuredOn,
      count: 1,
      isStart: true,
    })
  })
})
