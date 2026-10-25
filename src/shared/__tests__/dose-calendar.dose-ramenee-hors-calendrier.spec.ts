// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveDose,
  noteDose,
  removeLine,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import {
  ONE_PHONE_GESTURES,
  startV2Walk,
  v2Step,
  type V2Step,
} from '../../../scripts/dose-engine/v2-walk'
import { edited, moved, recorded } from './dose-calendar.reglage-corrige.aides'
import { keys, setting } from './dose-calendar.v2.aides'

const EVERY_TWO_WEEKS = { value: 2, unit: 'week' } as const

// #1282, Q55 : Milo, toutes les 2 semaines à 20 h dès le 13 mars. Le 15, la dose du 27 donnée d'avance
// avec la case (la suite repart du 15 : le 29), passage à 8 h, 14 h et 20 h, 8 h du 29 reportée au
// 8 avril avec la case, puis « Supprimer » le décalage de la prise : la suite revient au 10 avril, le
// 29 sort du calendrier et le 8 avril garde ses trois doses.
function milo(): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-13', EVERY_TWO_WEEKS, ['20:00'])],
    lines: [],
    today: '2026-03-15',
  }
  const due = { settingId: 's1', dueOn: '2026-03-27', dueTime: '20:00' }
  const note = noteDose(start, {
    due,
    status: 'given',
    givenOn: '2026-03-15',
    shiftsFollowing: true,
  })
  if ('refusal' in note) throw new Error(JSON.stringify(note))
  const given = recorded(start, note.changes)
  const shift = given.lines.find(({ status }) => status === 'shift')!
  const hours = edited(given, {
    frequency: EVERY_TWO_WEEKS,
    times: ['08:00', '14:00', '20:00'],
    endsOn: null,
  })
  const reported = moved(hours, '2026-03-29', '08:00', '2026-04-08', true)
  const removal = removeLine(reported, shift.id)
  if ('refusal' in removal) throw new Error(JSON.stringify(removal))
  return recorded(reported, removal.changes)
}

function broughtBack() {
  const input = milo()
  const settingId = treatmentView(input).currentSetting!.id
  const due = { settingId, dueOn: '2026-04-08', dueTime: '08:00' }
  const result = moveDose(input, { due, to: '2026-03-29', shiftsFollowing: false })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return recorded(input, result.changes)
}

const calendar = (input: TreatmentViewInput) => ({
  moteur: keys(
    treatmentView(input)
      .upcoming({ to: '2026-04-20' })
      .filter(({ dueOn }) => dueOn <= '2026-04-20'),
  ),
  reference: referenceReading({ ...input, until: '2026-06-30' }).upcoming.filter(
    (key) => key.slice(0, 10) <= '2026-04-20',
  ),
})

const both = (expected: string[]) => ({ moteur: expected, reference: expected })

describe('Une dose ramenée à son jour d’origine sorti du calendrier y revient (R7, R11, Q55, #1282)', () => {
  it('avant le geste : le 8 avril à 8 h, 14 h et 20 h, puis le 10 avril', () => {
    expect(calendar(milo())).toEqual(
      both([
        '2026-04-08 08:00',
        '2026-04-08 14:00',
        '2026-04-08 20:00',
        '2026-04-10 08:00',
        '2026-04-10 14:00',
        '2026-04-10 20:00',
      ]),
    )
  })

  it('8 h du 8 avril ramenée au 29 mars : le 29 mars à 8 h, 14 h et 20 h, le 10 avril inchangé', () => {
    expect(calendar(broughtBack())).toEqual(
      both([
        '2026-03-29 08:00',
        '2026-03-29 14:00',
        '2026-03-29 20:00',
        '2026-04-10 08:00',
        '2026-04-10 14:00',
        '2026-04-10 20:00',
      ]),
    )
  })

  it('le report reste dans l’historique, arrivé sur son jour d’origine', () => {
    const view = treatmentView(broughtBack())
    const report = view.history.find(({ line }) => line.status === 'postponed')

    expect(report?.line.targetOn).toBe('2026-03-29')
    expect(report?.effect).toMatchObject({ kind: 'moves', arrival: '2026-03-29' })
  })

  it('le jour d’origine encore au calendrier : ramener la dose supprime le report, comme avant', () => {
    const input = moved(milo(), '2026-04-10', '08:00', '2026-04-12', false)
    const settingId = treatmentView(input).currentSetting!.id
    const due = { settingId, dueOn: '2026-04-12', dueTime: '08:00' }
    const result = moveDose(input, { due, to: '2026-04-10', shiftsFollowing: false })
    if ('refusal' in result) throw new Error(JSON.stringify(result))
    const back = recorded(input, result.changes)

    expect(back.lines.filter(({ dueOn }) => dueOn === '2026-04-10')).toEqual([])
    expect(calendar(back)).toEqual(calendar(milo()))
  })
})

// Le pas `at` de la graine, gestes des campagnes à un téléphone.
function stepOf(seed: number, at: number): V2Step {
  const walk = startV2Walk(seed, ONE_PHONE_GESTURES)
  let step: V2Step | null = null
  for (let count = 0; count <= at; count += 1) {
    step = null
    v2Step(walk, (played) => {
      step = played
    })
  }
  return step!
}

const dosesOn = (input: TreatmentViewInput, day: string) => {
  const reference = referenceReading({ ...input, until: '2026-06-30' })
  return {
    moteur: keys(
      treatmentView(input)
        .slots(day, day)
        .filter(({ state }) => state === 'pending')
        .map(({ due }) => due),
    ),
    reference: [...new Set([...reference.unlogged, ...reference.upcoming])].filter(
      (key) => key.slice(0, 10) === day,
    ),
  }
}

describe('Un retour ne déplace que ce que le report portait, l’arrivée garde ses doses (Q56, #1282)', () => {
  it('graine 731001499 : arrivé sur la date choisie du 6 mars, le report ramené au 3 y rend 8 h, 14 h et 20 h ; le 6 garde ses quatre doses', () => {
    const { gesture, after } = stepOf(731_001_499, 4)

    expect(gesture).toMatchObject({ kind: 'move', to: '2026-03-03' })
    expect(dosesOn(after, '2026-03-03')).toEqual(
      both(['2026-03-03 08:00', '2026-03-03 14:00', '2026-03-03 20:00']),
    )
    expect(dosesOn(after, '2026-03-06')).toEqual(
      both(['2026-03-06 06:00', '2026-03-06 12:00', '2026-03-06 18:00', '2026-03-06 23:00']),
    )
  })

  it('graine 731002541 : arrivé sur la date choisie du 28 mars, le report ramené au 24 y rend 20 h ; le 28 garde la sienne', () => {
    const { gesture, after } = stepOf(731_002_541, 16)

    expect(gesture).toMatchObject({ kind: 'move', to: '2026-03-24' })
    expect(dosesOn(after, '2026-03-24')).toEqual(both(['2026-03-24 20:00']))
    expect(dosesOn(after, '2026-03-28')).toEqual(both(['2026-03-28 20:00']))
  })
})
