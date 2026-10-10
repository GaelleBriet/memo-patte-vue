// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { viewInputOf, type LegacyInput } from '../domain/dose-calendar'

type Period = LegacyInput['periods'][number]
type Dose = LegacyInput['doses'][number]

const MONTH = { value: 1, unit: 'month' } as const

function period(id: string, firstDueOn: string, referenceOn: string, extra: Partial<Period> = {}) {
  return {
    id,
    startsOn: firstDueOn,
    firstDueOn,
    referenceOn,
    endsOn: null,
    stoppedOn: null,
    frequency: MONTH,
    times: [],
    createdAt: `2026-01-01T00:00:0${id.slice(1)}.000Z`,
    ...extra,
  }
}

function dose(status: Dose['status'], nextDueDate: string): Dose {
  const fields = { periodId: 'p1', dueOn: '2026-01-31', dueTime: null, givenOn: null }
  return { id: status, ...fields, status, nextDueDate, updatedAt: '2026-02-01T00:00:00.000Z' }
}

const origins = (periods: Period[]) =>
  viewInputOf({ periods, doses: [], today: '2026-03-01' }).settings.map(
    ({ gridOriginOn }) => gridOriginOn,
  )

describe('plan §3.1 : `referenceOn` devient l’origine de la grille', () => {
  it('le 31 d’un mensuel est gardé quand sa grille passe par la première échéance', () => {
    expect(origins([period('p1', '2026-04-30', '2026-01-31')])).toEqual(['2026-01-31'])
    expect(origins([period('p1', '2026-04-29', '2026-01-31')])).toEqual(['2026-04-29'])
  })

  it('R3 : à fréquence gardée, l’origine est héritée ; après un arrêt, elle repart', () => {
    const p1 = period('p1', '2026-01-31', '2026-01-31')
    const p2 = period('p2', '2026-02-28', '2026-02-28', { startsOn: '2026-02-20' })
    expect(origins([p1, p2])).toEqual(['2026-01-31', null])
    const stopped = { ...p1, stoppedOn: '2026-02-10' }
    expect(origins([stopped, p2])).toEqual(['2026-01-31', '2026-02-28'])
  })
})

describe('`nextDueDate` devient `targetOn` pour un report ou un décalage seulement', () => {
  it('une prise n’a pas de jour d’arrivée', () => {
    const doses = [
      dose('given', '2026-02-28'),
      dose('postponed', '2026-02-02'),
      dose('shift', '2026-02-03'),
    ]
    const { lines } = viewInputOf({ periods: [], doses, today: '2026-03-01' })
    expect(lines.map(({ settingId, targetOn }) => [settingId, targetOn])).toEqual([
      ['p1', null],
      ['p1', '2026-02-02'],
      ['p1', '2026-02-03'],
    ])
  })
})
