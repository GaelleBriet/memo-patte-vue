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

  function crowded(old: string[], notes: [string, 'given' | 'missed'][], times: string[]) {
    const start: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-01', DAY, old)],
      lines: [],
      today: '2026-04-10',
    }
    const noted = notes.reduce(
      (input, [hour, status]) => given(input, '2026-04-10', hour, status),
      start,
    )
    return edited(noted, { frequency: DAY, times, endsOn: null })
  }

  it('deux oublis délogés par des prises : l’un prend l’heure restée libre, rien à donner le 10', () => {
    const after = crowded(
      ['06:00', '08:00', '12:00', '14:00', '22:00'],
      [
        ['06:00', 'given'],
        ['08:00', 'missed'],
        ['12:00', 'given'],
        ['14:00', 'missed'],
      ],
      ['08:00', '14:00', '20:00'],
    )
    expect(dayOf(after, '2026-04-10').slots.map(({ state }) => state)).not.toContain('pending')
    expect(dayOf(after, '2026-04-10').effects.filter(({ kind }) => kind === 'idle')).toHaveLength(1)
    const { moteur, reference } = readings(after)
    expect(moteur.moment).toEqual(['2026-04-11 08:00'])
    expect(moteur).toEqual(reference)
  })

  it('8 h et 18 h données, 12 h et 14 h oubliées, puis 12 h, 14 h et 20 h : rien à donner le 10', () => {
    const after = crowded(
      ['06:00', '08:00', '12:00', '14:00', '18:00'],
      [
        ['08:00', 'given'],
        ['12:00', 'missed'],
        ['14:00', 'missed'],
        ['18:00', 'given'],
      ],
      ['12:00', '14:00', '20:00'],
    )
    expect(dayOf(after, '2026-04-10').slots).toEqual([
      { hour: '12:00', state: 'covered', by: 'given' },
      { hour: '14:00', state: 'covered', by: 'given' },
      { hour: '20:00', state: 'covered', by: 'missed' },
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('150 journées surchargées tirées au hasard : le moteur et le modèle de référence lisent pareil', () => {
    const ALL = ['06:00', '08:00', '10:00', '12:00', '14:00', '18:00', '20:00', '22:00']
    let state = 866
    const rnd = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
    let played = 0
    while (played < 150) {
      const old = ALL.filter(() => rnd() < 0.6)
      const notes = old
        .filter(() => rnd() < 0.8)
        .map((hour): [string, 'given' | 'missed'] => [hour, rnd() < 0.5 ? 'given' : 'missed'])
      const missed = notes.filter(([, status]) => status === 'missed').map(([hour]) => hour)
      const times = [
        ...new Set([...missed.filter(() => rnd() < 0.6), ...ALL.filter(() => rnd() < 0.2)]),
      ].sort()
      if (old.length < 2 || times.length === 0 || notes.length <= times.length) continue
      played += 1
      const { moteur, reference } = readings(crowded(old, notes, times))
      expect({ old, notes, times, ...moteur }).toEqual({ old, notes, times, ...reference })
    }
  }, 30_000)
})
