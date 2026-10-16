// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { edited, given, on, readings } from './dose-calendar.reglage-corrige.aides'
import { DAY, H, setting } from './dose-calendar.v2.aides'

const daily = (): TreatmentViewInput => ({
  settings: [setting('s1', '2026-04-01', DAY, H)],
  lines: [],
  today: '2026-04-01',
})

function dayOf(input: TreatmentViewInput, day: string) {
  const view = treatmentView(input)
  return {
    slots: view.slots(day, day).map(({ due, state, by }) => ({
      hour: due.dueTime,
      state,
      by: by?.status ?? null,
    })),
    effects: view.history
      .filter(({ line }) => line.dueOn === day)
      .map(({ line, effect }) => ({ status: line.status, hour: line.dueTime, kind: effect.kind })),
  }
}

describe('R4, #866 : le jour du changement d’heures, une prise donnée passe avant un oubli', () => {
  // Chaque jour à 8 h et 20 h ; le 10, 8 h donnée et 20 h marquée oubliée ; le même jour, 20 h seule.
  const noted = () =>
    given(given(on(daily(), '2026-04-10'), '2026-04-10', '08:00'), '2026-04-10', '20:00', 'missed')

  it('20 h seule : 20 h couverte par la prise de 8 h, l’oubli de 20 h sans effet', () => {
    const after = edited(noted(), { frequency: DAY, times: ['20:00'], endsOn: null })
    expect(dayOf(after, '2026-04-10')).toEqual({
      slots: [{ hour: '20:00', state: 'covered', by: 'given' }],
      effects: [
        { status: 'given', hour: '08:00', kind: 'covers' },
        { status: 'missed', hour: '20:00', kind: 'idle' },
      ],
    })
    const { moteur, reference } = readings(after)
    expect(moteur.ensuite).toEqual(['2026-04-11 20:00', '2026-04-12 20:00', '2026-04-13 20:00'])
    expect(moteur).toEqual(reference)
  })

  it('8 h seule : la prise de 8 h garde son heure, l’oubli de 20 h sans effet', () => {
    const after = edited(noted(), { frequency: DAY, times: ['08:00'], endsOn: null })
    expect(dayOf(after, '2026-04-10')).toEqual({
      slots: [{ hour: '08:00', state: 'given', by: 'given' }],
      effects: [
        { status: 'given', hour: '08:00', kind: 'covers' },
        { status: 'missed', hour: '20:00', kind: 'idle' },
      ],
    })
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('autant de notes que d’heures : l’oubli reste sur son heure, la prise prend l’autre', () => {
    const after = edited(noted(), { frequency: DAY, times: ['09:00', '20:00'], endsOn: null })
    expect(dayOf(after, '2026-04-10').slots).toEqual([
      { hour: '09:00', state: 'covered', by: 'given' },
      { hour: '20:00', state: 'missed', by: 'missed' },
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('8 h oubliée, 14 h et 20 h données, puis 20 h seule : la prise de 20 h couvre son heure, l’oubli sans effet', () => {
    const three = (): TreatmentViewInput => ({
      settings: [setting('s1', '2026-04-01', DAY, ['08:00', '14:00', '20:00'])],
      lines: [],
      today: '2026-04-10',
    })
    const input = given(
      given(given(three(), '2026-04-10', '08:00', 'missed'), '2026-04-10', '14:00'),
      '2026-04-10',
      '20:00',
    )
    const after = edited(input, { frequency: DAY, times: ['20:00'], endsOn: null })
    expect(dayOf(after, '2026-04-10')).toEqual({
      slots: [{ hour: '20:00', state: 'given', by: 'given' }],
      effects: [
        { status: 'missed', hour: '08:00', kind: 'idle' },
        { status: 'given', hour: '14:00', kind: 'idle' },
        { status: 'given', hour: '20:00', kind: 'covers' },
      ],
    })
  })
})
