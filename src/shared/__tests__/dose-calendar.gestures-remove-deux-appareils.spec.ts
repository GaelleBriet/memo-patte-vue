// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  applied,
  keptAhead,
  removalRefusal,
  removeLine,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { line, next, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)
const TODAY = '2026-10-12'
const GIVEN = [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')]

function removed(lines: Line[], lineId: string): { ids: string[]; next: string[] } {
  const input = { settings: [p1], lines: [...GIVEN, ...lines], today: TODAY }
  const result = removeLine(input, lineId)
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  const ids = result.changes.map((change) => (change.action === 'delete' ? change.id : ''))
  return { ids: ids.sort(), next: next([p1], [...applied(input, result.changes).lines], TODAY) }
}

const sorted = (lines: Line[]) => lines.map(({ id }) => id).sort()
const AS_IF_NEVER_MOVED = ['2026-10-16', '2026-10-23', '2026-10-30']

describe('TR-25 : les décalages et les reports d’une même journée venus de deux appareils sont une ligne (décision du 2026-10-14)', () => {
  const variants: [string, string, 'avant' | 'après'][] = [
    ['ancré au 20, plus ancien', '2026-10-20', 'avant'],
    ['ancré au 19, plus ancien', '2026-10-19', 'avant'],
    ['ancré au 20, plus récent', '2026-10-20', 'après'],
  ]

  for (const [label, anchor, order] of variants) {
    it(`16 reporté au 19 avec la case, décalage de l’autre appareil ${label} : « Supprimer ce report » emporte les deux décalages, 16, 23, 30`, () => {
      const other = () => line('p1', 'shift', '2026-10-16', null, anchor)
      const first = order === 'avant' ? [other()] : []
      const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
      const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
      const lines = [...first, report, shift, ...(order === 'après' ? [other()] : [])]

      expect(removed(lines, report.id)).toEqual({ ids: sorted(lines), next: AS_IF_NEVER_MOVED })
    })
  }

  it('le même report et le même décalage sur les deux appareils : « Supprimer ce report » emporte les quatre lignes, 16, 23, 30', () => {
    const otherShift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const otherReport = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const lines = [otherShift, otherReport, report, shift]

    expect(removed(lines, report.id)).toEqual({ ids: sorted(lines), next: AS_IF_NEVER_MOVED })
  })

  it('« Supprimer ce décalage » emporte les deux décalages de la journée et garde le report', () => {
    const otherShift = line('p1', 'shift', '2026-10-16', null, '2026-10-20')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const lines = [otherShift, report, shift]

    expect(removed(lines, shift.id).ids).toEqual(sorted([shift, otherShift]))
  })

  it('#835 : le décalage de l’autre appareil verrouillé par un report plus lointain refuse aussi « Supprimer ce report »', () => {
    const otherShift = line('p1', 'shift', '2026-10-16', null, '2026-10-20')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const later = line('p1', 'postponed', '2026-10-27', null, '2026-10-28')
    const input = { settings: [p1], lines: [...GIVEN, otherShift, report, later], today: TODAY }

    expect(removalRefusal(input, report.id)).toEqual({ reason: 'later-line' })
  })

  it('le 21, Milo : 16 reporté au 19 et donné le 19, l’autre appareil (plus récent) au 20 ; « Supprimer ce report » est refusé, comme pour le report en vigueur', () => {
    const report19 = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const given19 = line('p1', 'given', '2026-10-19')
    const report20 = line('p1', 'postponed', '2026-10-16', null, '2026-10-20')
    const input = {
      settings: [p1],
      lines: [...GIVEN, report19, given19, report20],
      today: '2026-10-21',
    }

    expect(removalRefusal(input, report20.id)).toEqual({ reason: 'arrival-logged' })
    expect(removeLine(input, report20.id)).toEqual({ refusal: { reason: 'arrival-logged' } })
  })
})

describe('TR-25 : graines du relecteur de #845, un report emporté dont l’arrivée est notée refuse le geste', () => {
  const seeds: Record<string, { target: string; input: TreatmentViewInput }> = JSON.parse(
    readFileSync(
      new URL('./fixtures/dose-calendar-suppression-report-graines.json', import.meta.url),
      'utf8',
    ),
  )

  for (const [seed, { target, input }] of Object.entries(seeds)) {
    it(`graine ${seed} : « Supprimer ce report » refusé, aucune prise ne perd sa dose`, () => {
      expect(removeLine(input, target)).toEqual({ refusal: { reason: 'arrival-logged' } })
    })
  }
})

describe('#842, R12 : les lignes que « Annuler » doit laisser devant les lignes supprimées', () => {
  const ids = (lines: Line[]) => lines.map(({ id }) => id)

  it('9 oct., Milo : oubliée sur l’autre appareil puis donnée ici ; « Supprimer » la ligne grisée garde « Donnée » devant', () => {
    const missed = line('p1', 'missed', '2026-10-09')
    const given = line('p1', 'given', '2026-10-09')
    const later = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [GIVEN[0]!, missed, given, later], today: TODAY }

    expect(ids(keptAhead(input, [missed.id]))).toEqual([given.id])
  })

  it('de proche en proche : le report du 16 au 19, puis la prise du 19 ; dans l’ordre où elles ont été écrites', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-20')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const given19 = line('p1', 'given', '2026-10-19')
    const input = { settings: [p1], lines: [...GIVEN, shift, report, given19], today: '2026-10-21' }

    expect(ids(keptAhead(input, [shift.id]))).toEqual([report.id, given19.id])
  })

  it('#867 : un report plus ancien que la réécriture de son réglage n’est pas réécrit, rien ne l’est', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-20')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const rewritten = { ...p1, updatedAt: line('p1', 'given', '2026-10-30').updatedAt }
    const input = { settings: [rewritten], lines: [...GIVEN, shift, report], today: '2026-10-21' }

    expect(keptAhead(input, [shift.id])).toEqual([])
  })
})
