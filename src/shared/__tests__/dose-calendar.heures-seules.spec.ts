// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  newSettings,
  play,
  settingsApplied,
  treatmentView,
  type Gesture,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { keys, setting, TWO_DAYS } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' as const }
const TWO_WEEKS = { value: 2, unit: 'week' as const }
const H3 = ['08:00', '14:00', '20:00']

function gesture(input: TreatmentViewInput, played: Gesture): TreatmentViewInput {
  const result = play(input, played)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return applied(input, result.changes)
}

function settings(input: TreatmentViewInput, request: SettingsRequest): TreatmentViewInput {
  const result = newSettings(input, request)
  if (!('plan' in result)) throw new Error(JSON.stringify(result))
  return settingsApplied(input, result.plan)
}

const dueOf = (input: TreatmentViewInput, dueOn: string, dueTime: string) => ({
  settingId: input.settings.at(-1)!.id,
  dueOn,
  dueTime,
})

function moteur(input: TreatmentViewInput, from: string) {
  const view = treatmentView(input)
  return {
    phase: view.phase,
    moment: keys(view.currentDoses),
    aRenseigner: keys(view.unloggedDoses),
    journees: view.slots(from, input.today).map(({ due, state }) => `${keys([due])[0]} ${state}`),
  }
}

function reference(input: TreatmentViewInput) {
  const { phase, current, unlogged } = referenceReading({ ...input, until: '2026-12-31' })
  return { phase, moment: current, aRenseigner: unlogged }
}

describe('R9, R11 : heures seules sur un réglage sans prise, rien de tombé, aucune journée passée ne change', () => {
  it('Milo tous les 2 jours à 8 h depuis le 1er oct., dose du 1er donnée, celle du 3 donnée en avance le 2 ; le 2, tous les 3 jours à 20 h à la date proposée ; le 5, 21 h : la journée du 3 reste couverte', () => {
    let carnet: TreatmentViewInput = {
      settings: [setting('t1', '2026-10-01', TWO_DAYS, ['08:00'])],
      lines: [],
      today: '2026-10-02',
    }
    for (const [dueOn, givenOn] of [
      ['2026-10-01', '2026-10-01'],
      ['2026-10-03', '2026-10-02'],
    ] as const) {
      carnet = gesture(carnet, {
        kind: 'note',
        due: dueOf(carnet, dueOn, '08:00'),
        status: 'given',
        givenOn,
        shiftsFollowing: false,
      })
    }
    carnet = settings(carnet, { frequency: THREE_DAYS, times: ['20:00'], endsOn: null })
    carnet = { ...carnet, today: '2026-10-05' }
    const avant = moteur(carnet, '2026-10-01')
    expect(avant.journees).toEqual(['2026-10-01 08:00 given', '2026-10-03 20:00 covered'])

    const apres = settings(carnet, { frequency: THREE_DAYS, times: ['21:00'], endsOn: null })

    expect(moteur(apres, '2026-10-01')).toEqual({
      ...avant,
      moment: ['2026-10-06 21:00'],
      journees: ['2026-10-01 08:00 given', '2026-10-03 21:00 covered'],
    })
    expect(reference(apres)).toEqual({
      phase: 'upcoming',
      moment: ['2026-10-06 21:00'],
      aRenseigner: [],
    })
  })

  it('graine 4870000769 : toutes les 2 semaines à 8, 14 et 20 h ; le 11 avr., la dose du 19 reportée au 14 en décalant la suite ; 8 h le 14, 14 h le 15 ; le 15, 20 h seule à la date proposée ; le 19, 21 h : rien ne revient en retard', () => {
    let carnet: TreatmentViewInput = {
      settings: [setting('t1', '2026-04-05', TWO_WEEKS, H3)],
      lines: [],
      today: '2026-04-11',
    }
    carnet = gesture(carnet, {
      kind: 'move',
      due: dueOf(carnet, '2026-04-19', '08:00'),
      to: '2026-04-14',
      shiftsFollowing: true,
    })
    carnet = { ...carnet, today: '2026-04-15' }
    for (const [dueTime, givenOn] of [
      ['08:00', '2026-04-14'],
      ['14:00', '2026-04-15'],
    ] as const) {
      carnet = gesture(carnet, {
        kind: 'note',
        due: dueOf(carnet, '2026-04-14', dueTime),
        status: 'given',
        givenOn,
        shiftsFollowing: false,
      })
    }
    carnet = settings(carnet, { frequency: TWO_WEEKS, times: ['20:00'], endsOn: null })
    carnet = { ...carnet, today: '2026-04-19' }
    const dosesDu5 = ['2026-04-05 08:00', '2026-04-05 14:00', '2026-04-05 20:00']
    expect(moteur(carnet, '2026-04-01')).toEqual({
      phase: 'upcoming',
      moment: ['2026-04-28 20:00'],
      aRenseigner: dosesDu5,
      journees: [...dosesDu5.map((key) => `${key} pending`), '2026-04-14 20:00 covered'],
    })

    const apres = settings(carnet, { frequency: TWO_WEEKS, times: ['21:00'], endsOn: null })

    const attendu = { phase: 'upcoming', moment: ['2026-04-28 21:00'], aRenseigner: dosesDu5 }
    expect(moteur(apres, '2026-04-01')).toEqual({
      ...attendu,
      journees: [...dosesDu5.map((key) => `${key} pending`), '2026-04-14 20:00 covered'],
    })
    expect(reference(apres)).toEqual(attendu)
  })
})
