// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { ONE_PHONE_GESTURES, startV2Walk, type V2Walk } from '../../../scripts/dose-engine/v2-walk'
import { cardOtherDate, redateWithAnswer } from '../../../scripts/dose-engine/v2-walk-notes'
import type { Frequency, Gesture, TreatmentViewInput } from '../domain/dose-calendar'
import { DAY, H, line, setting, WEEK } from './dose-calendar.v2.aides'

const THREE_MONTHS: Frequency = { value: 3, unit: 'month' }

function walkOn(input: TreatmentViewInput, seed = 1): V2Walk {
  const walk = startV2Walk(seed, ONE_PHONE_GESTURES)
  walk.input = input
  return walk
}

function draws(walk: V2Walk, count: number): Extract<Gesture, { kind: 'note' }>[] {
  return Array.from({ length: count }, () => cardOtherDate(walk)).map((gesture) => {
    if (gesture?.kind !== 'note') throw new Error(`geste inattendu : ${JSON.stringify(gesture)}`)
    return gesture
  })
}

describe('« Fait à une autre date » depuis la carte, tiré par la campagne (TR-13, Q28, Q27)', () => {
  it('Milbemax chaque vendredi, 2 et 9 donnés, le 20 : la dose du 16, une date du 10 au 20, sans question', () => {
    const walk = walkOn({
      settings: [setting('p1', '2026-10-02', WEEK)],
      lines: [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      today: '2026-10-20',
    })
    const gestures = draws(walk, 40)

    expect(new Set(gestures.map(({ due }) => due.dueOn))).toEqual(new Set(['2026-10-16']))
    expect(
      gestures.every(({ givenOn }) => givenOn >= '2026-10-10' && givenOn <= '2026-10-20'),
    ).toBe(true)
    expect(new Set(gestures.map(({ givenOn }) => givenOn)).size).toBeGreaterThan(4)
    expect(gestures.every(({ answer, status }) => answer === undefined && status === 'given')).toBe(
      true,
    )
  })

  it('Métacam tous les jours à 8 h et 20 h, rien noté le 24 : l’une des deux heures du 24, donnée le 24', () => {
    const walk = walkOn({
      settings: [setting('p1', '2026-10-20', DAY, H)],
      lines: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].flatMap((day) =>
        H.map((time) => line('p1', 'given', day, time)),
      ),
      today: '2026-10-24',
    })
    const gestures = draws(walk, 30)

    expect(new Set(gestures.map(({ due }) => `${due.dueOn} ${due.dueTime}`))).toEqual(
      new Set(['2026-10-24 08:00', '2026-10-24 20:00']),
    )
    expect(new Set(gestures.map(({ givenOn }) => givenOn))).toEqual(new Set(['2026-10-24']))
  })

  it('Bravecto à 8 h et 20 h, première prise le 1er nov., le 24 oct. : la dose de 8 h du 1er nov., la réponse tirée', () => {
    const walk = walkOn({
      settings: [setting('p1', '2026-11-01', THREE_MONTHS, H)],
      lines: [],
      today: '2026-10-24',
    })
    const gestures = draws(walk, 40)

    expect(new Set(gestures.map(({ due }) => `${due.dueOn} ${due.dueTime}`))).toEqual(
      new Set(['2026-11-01 08:00']),
    )
    expect(
      gestures.every(({ givenOn }) => givenOn >= '2026-10-17' && givenOn <= '2026-10-24'),
    ).toBe(true)
    expect(new Set(gestures.map(({ answer }) => answer))).toEqual(new Set(['extra', 'replaces']))
  })

  it('rien à donner (arrêté) : aucun geste', () => {
    const s1 = setting('p1', '2026-10-02', WEEK, [], { stoppedOn: '2026-10-05' })
    expect(cardOtherDate(walkOn({ settings: [s1], lines: [], today: '2026-10-20' }))).toBeNull()
  })
})

describe('« Changer la date » d’une prise en plus : la réponse tirée quand la question se pose (Q37)', () => {
  const milbemax = setting('p1', '2026-10-02', WEEK)
  const enPlus = line('p1', 'extra', '2026-10-16')
  const input: TreatmentViewInput = {
    settings: [milbemax],
    lines: [
      ...['2026-10-02', '2026-10-09', '2026-10-16'].map((day) => line('p1', 'given', day)),
      enPlus,
    ],
    today: '2026-10-17',
  }

  it('au 17, qui couvrirait la dose du 23 : « En plus » ou « Remplace »', () => {
    const walk = walkOn(input)
    const answers = new Set(
      Array.from({ length: 30 }, () => redateWithAnswer(walk, enPlus, '2026-10-17').answer),
    )
    expect(answers).toEqual(new Set(['extra', 'replaces']))
  })

  it('au 16, sans question : aucune réponse', () => {
    expect(redateWithAnswer(walkOn(input), enPlus, '2026-10-16').answer).toBeUndefined()
  })

  it('sans l’option, aucune réponse (carnets rejoués par graine)', () => {
    const walk = startV2Walk(1, { answers: true })
    walk.input = input
    expect(redateWithAnswer(walk, enPlus, '2026-10-17').answer).toBeUndefined()
  })
})
