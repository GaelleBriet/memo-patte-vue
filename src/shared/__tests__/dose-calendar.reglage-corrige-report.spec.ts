// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  moveDose,
  newSettings,
  noteDose,
  settingsApplied,
  treatmentView,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { DAY, keys, setting, TWO_DAYS } from './dose-calendar.v2.aides'

let made = 0

function written(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  if (plan.action === 'rewrite') return settingsApplied(input, plan)
  made += 1
  const createdAt = `2026-02-01T00:00:${String(made).padStart(2, '0')}.000Z`
  const created = { ...plan.setting, id: `r${made}`, stoppedOn: null, createdAt }
  return applied({ ...input, settings: [...input.settings, created] }, plan.lines ?? [])
}

const on = (input: TreatmentViewInput, today: string) => ({ ...input, today })
const current = (input: TreatmentViewInput) => treatmentView(input).currentSetting!.id

function given(
  input: TreatmentViewInput,
  dueOn: string,
  dueTime: string,
  status: 'given' | 'missed' = 'given',
) {
  const due = { settingId: current(input), dueOn, dueTime }
  const gesture = { due, status, givenOn: input.today, shiftsFollowing: false }
  const result = noteDose(input, gesture)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return applied(input, result.changes)
}

function moved(
  input: TreatmentViewInput,
  dueOn: string,
  dueTime: string | null,
  to: string,
  shifts = true,
) {
  const due = { settingId: current(input), dueOn, dueTime }
  const result = moveDose(input, { due, to, shiftsFollowing: shifts })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return applied(input, result.changes)
}

function edited(input: TreatmentViewInput, request: SettingsRequest, answer?: 'keep' | 'correct') {
  const result = newSettings(input, request)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  if ('plan' in result) return written(input, result.plan)
  const plan = result.question[answer ?? 'keep']
  if ('refusal' in plan) throw new Error(JSON.stringify(plan))
  return written(input, plan)
}

function readings(input: TreatmentViewInput) {
  const view = treatmentView(input)
  const reference = referenceReading({ ...input, until: '2026-06-30' })
  return {
    moteur: {
      phase: view.phase,
      moment: keys(view.currentDoses),
      aRenseigner: keys(view.unloggedDoses),
      ensuite: keys(view.upcoming({ limit: 3 })),
    },
    reference: {
      phase: reference.phase,
      moment: reference.current,
      aRenseigner: reference.unlogged,
      ensuite: reference.upcoming.slice(0, 3),
    },
  }
}

function expectBoth(input: TreatmentViewInput, expected: ReturnType<typeof readings>['moteur']) {
  expect(readings(input)).toEqual({ moteur: expected, reference: expected })
}

describe('TR-28, R9 : heures seules corrigées, la première journée du réglage, arrivée d’un report décalé, reste', () => {
  // Milo, tous les 2 jours à 20 h dès le 18 mars ; le 19, « Prochaine dose » le 29 ; le 27, la dose du
  // 29 reportée au 7 avril avec « Décaler aussi les doses suivantes », puis posologie seule.
  function milo() {
    const every = (times: string[]) => ({ frequency: TWO_DAYS, times, endsOn: null })
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-18', TWO_DAYS, ['20:00'])],
      lines: [],
      today: '2026-03-18',
    }
    input = given(input, '2026-03-18', '20:00')
    input = edited(on(input, '2026-03-19'), { ...every(['20:00']), firstDueOn: '2026-03-29' })
    input = moved(on(input, '2026-03-27'), '2026-03-29', '20:00', '2026-04-07')
    return { input: edited(input, every(['20:00'])), every }
  }

  it('avant le changement : prochaine dose le 7 avril à 20 h', () => {
    const { input } = milo()
    expectBoth(on(input, '2026-03-31'), {
      phase: 'upcoming',
      moment: ['2026-04-07 20:00'],
      aRenseigner: [],
      ensuite: ['2026-04-07 20:00', '2026-04-09 20:00', '2026-04-11 20:00'],
    })
  })

  it.each([
    ['21 h', ['21:00'], ['2026-04-07 21:00', '2026-04-09 21:00', '2026-04-11 21:00']],
    [
      '8 h et 20 h',
      ['08:00', '20:00'],
      ['2026-04-07 20:00', '2026-04-09 08:00', '2026-04-09 20:00'],
    ],
  ])('le 31 mars, %s : la dose du 7 avril garde son rappel', (_, times, ensuite) => {
    const { input, every } = milo()
    const after = edited(on(input, '2026-03-31'), every(times))
    expectBoth(after, { phase: 'upcoming', moment: [ensuite[0]!], aRenseigner: [], ensuite })
  })

  it('chaque jour à 20 h dès le 9 mars ; le 10, sans heure, « Prochaine dose » le 22, reportée le 15 au 1er avril avec décalage, puis 6, 12, 18 et 23 h ; le 18, sans heure : prochaine dose le 1er avril', () => {
    const daily = (times: string[]) => ({ frequency: DAY, times, endsOn: null })
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-09', DAY, ['20:00'])],
      lines: [],
      today: '2026-03-09',
    }
    input = given(input, '2026-03-09', '20:00')
    input = edited(on(input, '2026-03-10'), { ...daily([]), firstDueOn: '2026-03-22' })
    input = moved(on(input, '2026-03-15'), '2026-03-22', null, '2026-04-01')
    input = edited(input, daily(['06:00', '12:00', '18:00', '23:00']))
    expectBoth(edited(on(input, '2026-03-18'), daily([])), {
      phase: 'upcoming',
      moment: ['2026-04-01'],
      aRenseigner: [],
      ensuite: ['2026-04-01', '2026-04-02', '2026-04-03'],
    })
  })
})

describe('R9 : heures seules corrigées, une dose passée à renseigner le reste et la prochaine dose garde son jour', () => {
  it('tous les 2 jours à 20 h dès le 28 mars, dose du 28 oubliée ; le 1er avril, « Prochaine dose » le 5, reportée au 13 avec décalage, posologie seule ; le 5, 20 h 01 : 30 mars à renseigner, prochaine dose le 13', () => {
    const every = (times: string[]) => ({ frequency: TWO_DAYS, times, endsOn: null })
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-28', TWO_DAYS, ['20:00'])],
      lines: [],
      today: '2026-03-28',
    }
    input = given(input, '2026-03-28', '20:00', 'missed')
    input = edited(on(input, '2026-04-01'), { ...every(['20:00']), firstDueOn: '2026-04-05' })
    input = moved(input, '2026-04-05', '20:00', '2026-04-13')
    input = edited(input, every(['20:00']))
    const after = edited(on(input, '2026-04-05'), every(['20:01']))
    expectBoth(after, {
      phase: 'upcoming',
      moment: ['2026-04-13 20:01'],
      aRenseigner: ['2026-03-30 20:00'],
      ensuite: ['2026-04-13 20:01', '2026-04-15 20:01', '2026-04-17 20:01'],
    })
  })
})

describe('TR-28, Q38 : « Elles n’étaient pas à donner » retire aussi les doses arrivées par un report', () => {
  it('tous les 2 jours à 6, 12, 18 et 23 h dès le 10 avr. ; le 17, « Prochaine dose » le 18, avancée au 17, posologie seule avec fin le 9 mai ; le 18, 8 h et 20 h, « Elles n’étaient pas à donner » : plus rien le 17, prochaine dose le 20', () => {
    const four = ['06:00', '12:00', '18:00', '23:00']
    const every = (times: string[]): SettingsRequest => ({
      frequency: TWO_DAYS,
      times,
      endsOn: '2026-05-09',
    })
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-10', TWO_DAYS, four)],
      lines: [],
      today: '2026-04-10',
    }
    input = given(input, '2026-04-10', '23:00')
    input = given(on(input, '2026-04-14'), '2026-04-14', '12:00')
    input = given(input, '2026-04-14', '18:00')
    input = given(input, '2026-04-14', '23:00', 'missed')
    input = given(on(input, '2026-04-16'), '2026-04-16', '06:00')
    input = edited(on(input, '2026-04-17'), {
      ...every(four),
      endsOn: null,
      firstDueOn: '2026-04-18',
    })
    input = moved(input, '2026-04-18', '06:00', '2026-04-17', false)
    input = edited(input, every(four))
    const after = edited(on(input, '2026-04-18'), every(['08:00', '20:00']), 'correct')
    const reading = readings(after)
    expect(reading.moteur).toEqual(reading.reference)
    expect(reading.moteur).toMatchObject({
      phase: 'upcoming',
      moment: ['2026-04-20 08:00'],
      ensuite: ['2026-04-20 08:00', '2026-04-20 20:00', '2026-04-22 08:00'],
    })
  })
})
