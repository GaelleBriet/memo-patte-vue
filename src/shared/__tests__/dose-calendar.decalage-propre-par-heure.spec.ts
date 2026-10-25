// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  play,
  treatmentView,
  type Due,
  type Gesture,
  type GestureOutcome,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { H, keys, setting } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof play>): GestureOutcome => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result
}

let written = 0

function played(input: TreatmentViewInput, gesture: Gesture): TreatmentViewInput {
  const known = new Set(input.lines.map(({ id }) => id))
  const after = applied(input, accepted(play(input, gesture)).changes)
  return {
    ...after,
    lines: after.lines.map((other) =>
      known.has(other.id) ? other : { ...other, id: `w${(written += 1)}` },
    ),
  }
}

const given = (due: Due, givenOn: string, shiftsFollowing = false): Gesture => ({
  kind: 'note',
  due,
  status: 'given',
  givenOn,
  shiftsFollowing,
})

const priseOf = (carnet: TreatmentViewInput, due: Due): Line =>
  carnet.lines.find(
    (other) =>
      other.status === 'given' && other.dueOn === due.dueOn && other.dueTime === due.dueTime,
  )!

const shifts = (carnet: TreatmentViewInput) =>
  carnet.lines
    .filter(({ status }) => status === 'shift')
    .map(({ dueOn, dueTime, targetOn }) => `${dueOn} ${dueTime} → ${targetOn}`)

const nextDays = (carnet: TreatmentViewInput) => [
  ...new Set(keys(treatmentView(carnet).upcoming({ limit: 6 })).map((key) => key.slice(0, 10))),
]

/**
 * Les doses d'une journée données un autre jour : la première heure sans la case, la dernière avec ;
 * la suite repart de ce jour-là.
 */
function dayGivenLate(
  start: TreatmentViewInput,
  day: string,
  givenOn: string,
): { carnet: TreatmentViewInput; at8: Due; at20: Due } {
  const at8 = { settingId: 's1', dueOn: day, dueTime: '08:00' }
  const at20 = { settingId: 's1', dueOn: day, dueTime: '20:00' }
  const after8 = played({ ...start, today: givenOn }, given(at8, givenOn))
  const carnet = played(after8, given(at20, givenOn, true))
  return { carnet, at8, at20 }
}

function luna(): { carnet: TreatmentViewInput; at8: Due; at20: Due } {
  const s1 = setting('s1', '2026-03-01', { value: 3, unit: 'day' }, H)
  let carnet: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-03-04' }
  for (const dueOn of ['2026-03-01', '2026-03-04']) {
    for (const dueTime of H) {
      carnet = played(carnet, given({ settingId: 's1', dueOn, dueTime }, dueOn))
    }
  }
  return dayGivenLate(carnet, '2026-03-07', '2026-03-08')
}

function weekly(): { carnet: TreatmentViewInput; at8: Due; at20: Due } {
  const s1 = setting('s1', '2026-10-06', { value: 1, unit: 'week' }, H)
  let carnet: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-10-13' }
  for (const dueOn of ['2026-10-06', '2026-10-13']) {
    for (const dueTime of H) {
      carnet = played(carnet, given({ settingId: 's1', dueOn, dueTime }, dueOn))
    }
  }
  return dayGivenLate(carnet, '2026-10-20', '2026-10-21')
}

describe('le décalage d’une journée appartient à la prise de son heure (R6, N2, #1262)', () => {
  it('Luna : les doses du 7 données le 8, 8 h sans la case, 20 h avec : la suite passe aux 11, 14, 17', () => {
    const { carnet } = luna()
    expect(shifts(carnet)).toEqual(['2026-03-07 20:00 → 2026-03-08'])
    expect(nextDays({ ...carnet, today: '2026-03-10' })).toEqual([
      '2026-03-11',
      '2026-03-14',
      '2026-03-17',
    ])
  })

  for (const [to, checked] of [
    ['2026-03-09', true],
    ['2026-03-09', false],
    ['2026-03-06', true],
    ['2026-03-06', false],
  ] as const) {
    it(`Luna, le 10 : la prise de 8 h du 8 changée au ${to.slice(8)}, case ${checked ? 'cochée' : 'décochée'} : pas de case, le décalage de la prise de 20 h reste au 8, la suite aux 11, 14, 17 (Q48)`, () => {
      const { carnet, at8, at20 } = luna()
      const le10 = { ...carnet, today: '2026-03-10' }
      const prise = priseOf(le10, at8)
      const result = accepted(
        play(le10, { kind: 'redate', lineId: prise.id, givenOn: to, shiftsFollowing: checked }),
      )
      expect(result.offersShift).toBe(false)
      const after = applied(le10, result.changes)
      expect(shifts(after)).toEqual(['2026-03-07 20:00 → 2026-03-08'])
      expect(priseOf(after, at20).givenOn).toBe('2026-03-08')
      expect(priseOf(after, at8).givenOn).toBe(to)
      expect(nextDays(after)).toEqual(['2026-03-11', '2026-03-14', '2026-03-17'])
    })
  }

  it('Luna, le 10 : « Fait à une autre date » au 9 pour 8 h du 7, prise de 20 h et son décalage gardés : pas de case, la suite aux 11, 14, 17 (Q48)', () => {
    const { carnet, at8 } = luna()
    const le10 = { ...carnet, today: '2026-03-10' }
    const sans8 = { ...le10, lines: le10.lines.filter(({ id }) => id !== priseOf(le10, at8).id) }
    const result = accepted(play(sans8, given(at8, '2026-03-09', true)))
    expect(result.offersShift).toBe(false)
    const after = applied(sans8, result.changes)
    expect(shifts(after)).toEqual(['2026-03-07 20:00 → 2026-03-08'])
    expect(nextDays(after)).toEqual(['2026-03-11', '2026-03-14', '2026-03-17'])
  })

  for (const checked of [true, false]) {
    it(`hebdomadaire : les doses du 20 octobre données le 21 ; le 23, la prise de 8 h changée au 22, case ${checked ? 'cochée' : 'décochée'} : pas de case, le décalage de la prise de 20 h reste au 21, la suite au 28 (Q48)`, () => {
      const { carnet, at8, at20 } = weekly()
      const le23 = { ...carnet, today: '2026-10-23' }
      expect(nextDays(le23)[0]).toBe('2026-10-28')
      const prise = priseOf(le23, at8)
      const result = accepted(
        play(le23, {
          kind: 'redate',
          lineId: prise.id,
          givenOn: '2026-10-22',
          shiftsFollowing: checked,
        }),
      )
      expect(result.offersShift).toBe(false)
      const after = applied(le23, result.changes)
      expect(shifts(after)).toEqual(['2026-10-20 20:00 → 2026-10-21'])
      expect(priseOf(after, at20).givenOn).toBe('2026-10-21')
      expect(nextDays(after).slice(0, 2)).toEqual(['2026-10-28', '2026-11-04'])
    })
  }

  it('hebdomadaire, le 23 octobre : la prise de 20 h du 21 changée au 22, case cochée : le décalage la suit, suite au 29', () => {
    const { carnet, at20 } = weekly()
    const le23 = { ...carnet, today: '2026-10-23' }
    const prise = priseOf(le23, at20)
    const result = accepted(
      play(le23, {
        kind: 'redate',
        lineId: prise.id,
        givenOn: '2026-10-22',
        shiftsFollowing: true,
      }),
    )
    expect(result.offersShift).toBe(true)
    const after = applied(le23, result.changes)
    expect(shifts(after)).toEqual(['2026-10-20 20:00 → 2026-10-22'])
    expect(nextDays(after)[0]).toBe('2026-10-29')
  })

  it('Luna, le 10 : la prise de 20 h du 8 changée au 9, case cochée : le décalage la suit, suite aux 12, 15', () => {
    const { carnet, at20 } = luna()
    const le10 = { ...carnet, today: '2026-03-10' }
    const prise = priseOf(le10, at20)
    const result = accepted(
      play(le10, {
        kind: 'redate',
        lineId: prise.id,
        givenOn: '2026-03-09',
        shiftsFollowing: true,
      }),
    )
    expect(result.offersShift).toBe(true)
    const after = applied(le10, result.changes)
    expect(shifts(after)).toEqual(['2026-03-07 20:00 → 2026-03-09'])
    expect(nextDays(after).slice(0, 2)).toEqual(['2026-03-12', '2026-03-15'])
  })

  it('Luna, le 10 : la prise de 20 h du 8 changée au 9, case décochée : son décalage part, le 10 est à donner', () => {
    const { carnet, at20 } = luna()
    const le10 = { ...carnet, today: '2026-03-10' }
    const prise = priseOf(le10, at20)
    const result = accepted(
      play(le10, {
        kind: 'redate',
        lineId: prise.id,
        givenOn: '2026-03-09',
        shiftsFollowing: false,
      }),
    )
    expect(result.offersShift).toBe(true)
    const after = applied(le10, result.changes)
    expect(shifts(after)).toEqual([])
    expect(keys(treatmentView(after).currentDoses)).toEqual([
      '2026-03-10 08:00',
      '2026-03-10 20:00',
    ])
  })
})

describe('G18 à deux heures : le décalage d’une dose avancée, réécrit par une prise (#1262)', () => {
  function avancee(givenOn: string) {
    const s1 = setting('s1', '2026-03-01', { value: 3, unit: 'day' }, H)
    let carnet: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-03-04' }
    for (const dueOn of ['2026-03-01', '2026-03-04']) {
      for (const dueTime of H) {
        carnet = played(carnet, given({ settingId: 's1', dueOn, dueTime }, dueOn))
      }
    }
    const le5 = played(
      { ...carnet, today: '2026-03-05' },
      {
        kind: 'move',
        due: { settingId: 's1', dueOn: '2026-03-07', dueTime: '08:00' },
        to: '2026-03-06',
        shiftsFollowing: true,
      },
    )
    return dayGivenLate(le5, '2026-03-06', givenOn)
  }

  it('Luna : 8 h du 7 avancée au 6 avec la case, les doses du 6 données le 5, 20 h avec la case ; le 8, la prise de 20 h changée au 6 : le décalage revient au 6, prochaines doses les 9 et 12', () => {
    const { carnet, at20 } = avancee('2026-03-05')
    expect(shifts(carnet)).toEqual(['2026-03-07 08:00 → 2026-03-05'])
    const le8 = { ...carnet, today: '2026-03-08' }
    const prise = priseOf(le8, at20)
    const result = accepted(
      play(le8, { kind: 'redate', lineId: prise.id, givenOn: '2026-03-06', shiftsFollowing: true }),
    )
    const after = applied(le8, result.changes)
    expect(shifts(after)).toEqual(['2026-03-07 08:00 → 2026-03-06'])
    expect(nextDays(after).slice(0, 2)).toEqual(['2026-03-09', '2026-03-12'])
  })

  it.each(['2026-03-04', '2026-03-05', '2026-03-07', '2026-03-08'])(
    'Luna : 8 h du 7 avancée au 6 avec la case, les doses du 6 données le 6 ; le 8, la prise de 20 h changée au %s : pas de case',
    (to) => {
      const { carnet, at20 } = avancee('2026-03-06')
      const le8 = { ...carnet, today: '2026-03-08' }
      const prise = priseOf(le8, at20)
      const result = accepted(
        play(le8, { kind: 'redate', lineId: prise.id, givenOn: to, shiftsFollowing: true }),
      )
      expect(result.offersShift).toBe(false)
    },
  )
})
