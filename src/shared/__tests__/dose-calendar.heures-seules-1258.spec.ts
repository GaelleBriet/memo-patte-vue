// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { settingsWritten } from '../../../scripts/dose-engine/v2-walk-settings'
import {
  newSettings,
  play,
  settingsApplied,
  treatmentView,
  withReportFacts,
  type Frequency,
  type Gesture,
  type Line,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { edited, given, moved, on } from './dose-calendar.reglage-corrige.aides'
import { setting, WEEK } from './dose-calendar.v2.aides'

const TWO_DAYS: Frequency = { value: 2, unit: 'day' }
const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
const FOUR = ['06:00', '12:00', '18:00', '23:00']

const journee = (input: TreatmentViewInput, day: string) =>
  treatmentView(input)
    .slots(day, day)
    .map(({ due, state }) => `${due.dueTime ?? 'sans heure'} ${state}`)

function hoursOnly(input: TreatmentViewInput, change: (times: readonly string[]) => string[]) {
  const { frequency, times, endsOn } = treatmentView(input).currentSetting!
  const result = newSettings(input, { frequency, times: change(times), endsOn })
  if ('refusal' in result) throw new Error(JSON.stringify(result.refusal))
  return settingsApplied(input, 'plan' in result ? result.plan : result.question.keep)
}

const minuteLater = (input: TreatmentViewInput) =>
  hoursOnly(input, (times) => times.map((time) => time.replace(/0$/, '1')))

let stamp = 0
const nextStamp = () => new Date(Date.UTC(2026, 1, 1, 0, 0, ++stamp)).toISOString()

// Comme le repository : chaque ligne écrite reçoit un identifiant et un horodatage plus récent.
function played(input: TreatmentViewInput, gesture: Gesture): TreatmentViewInput {
  const result = play(input, gesture)
  if ('refusal' in result) throw new Error(JSON.stringify(result.refusal))
  let lines: Line[] = [...input.lines]
  for (const change of result.changes) {
    if (change.action === 'delete') {
      lines = lines.filter(({ id }) => id !== change.id)
      continue
    }
    const decidedAt = nextStamp()
    const { line } = withReportFacts(lines, input.settings, change)
    lines =
      change.action === 'rewrite'
        ? lines.map((each) => (each.id === change.id ? { ...line, id: each.id, decidedAt } : each))
        : [...lines, { ...line, id: `l-${decidedAt}`, decidedAt }]
  }
  return { ...input, lines }
}

function modified(input: TreatmentViewInput, request: SettingsRequest, answer: 'keep' | 'correct') {
  const result = newSettings(input, request)
  if ('refusal' in result) throw new Error(JSON.stringify(result.refusal))
  const plan = 'plan' in result ? result.plan : result.question[answer]
  if ('refusal' in plan) throw new Error(JSON.stringify(plan.refusal))
  return settingsWritten({ input, random: () => 0, log: [], stamp: nextStamp }, plan)
}

const noteOf = (input: TreatmentViewInput, dueOn: string, dueTime: string) =>
  input.lines.find(
    (line) => line.status === 'given' && line.dueOn === dueOn && line.dueTime === dueTime,
  )!.id

describe('Heures seules après deux « Modifier » le jour d’un report parti d’une arrivée (#1258)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 24, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Milo, tous les 3 jours à 6, 12, 18 et 23 h dès le 22 mars ; 23 h du 22 donnée le 22. Le 24 : la
  // dose de 6 h du 22 reportée au 24 sans la case (le 24 reçoit 6, 12 et 18 h), 6 h du 24 donnée, 12 h
  // du 24 reportée au 27 avec la case (le 27 reçoit 12 et 18 h) ; « Modifier » : chaque semaine à 8, 14
  // et 20 h ; 14 h du 3 avril reportée au 8 avec la case ; « Modifier » : tous les 2 jours à 6, 12, 18
  // et 23 h.
  function beforeSecondModify(): TreatmentViewInput {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-22', THREE_DAYS, FOUR)],
      lines: [],
      today: '2026-03-22',
    }
    input = given(input, '2026-03-22', '23:00')
    input = moved(on(input, '2026-03-24'), '2026-03-22', '06:00', '2026-03-24', false)
    input = given(input, '2026-03-24', '06:00')
    input = moved(input, '2026-03-24', '12:00', '2026-03-27')
    input = edited(input, { frequency: WEEK, times: ['08:00', '14:00', '20:00'], endsOn: null })
    return moved(input, '2026-04-03', '14:00', '2026-04-08')
  }

  const milo = () =>
    edited(beforeSecondModify(), { frequency: TWO_DAYS, times: FOUR, endsOn: null })

  it('graine 470000631 : avant le second « Modifier », le 27 mars montre 12 et 18 h', () => {
    expect(journee(beforeSecondModify(), '2026-03-27')).toEqual(['12:00 pending', '18:00 pending'])
  })

  // Trou connu #1258 : le 27 reçoit aussi 23 h, que le report n'emportait pas.
  it.fails(
    'graine 470000631 : le 27 mars garde les seules heures du report, 12 et 18 h (R7)',
    () => {
      expect(journee(milo(), '2026-03-27')).toEqual(['12:00 pending', '18:00 pending'])
    },
  )

  it.fails(
    'graine 470000631 : une minute plus tard ne change pas le 27 mars (heures seules)',
    () => {
      const input = milo()
      expect(journee(minuteLater(input), '2026-03-27')).toEqual(journee(input, '2026-03-27'))
    },
  )
})

describe('Heures seules après « Changer la date » avec la case sur une dose d’avant un report (#1258)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 3, 1, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Luna, chaque jour à 8 et 20 h dès le 26 mars. Le 28 : « Modifier », tous les 3 jours à 6, 12, 18
  // et 23 h, « Elles n'étaient pas à donner » ; 12 h du 28 oubliée, 23 h et 6 h données ; la dose de 6 h
  // du 31 reportée au 10 avril avec la case. Le 1er avril : la prise de 6 h du 28 datée du 31 ; la dose
  // du 10 avril ramenée au 2 sans la case ; « Modifier » : tous les 3 jours à 8, 14 et 20 h ; 18 h du
  // 28 donnée ; la prise de 6 h du 28 redatée au 29 avec la case.
  function luna(): TreatmentViewInput {
    const s1 = 's1'
    let input: TreatmentViewInput = {
      settings: [setting(s1, '2026-03-26', { value: 1, unit: 'day' }, ['08:00', '20:00'])],
      lines: [],
      today: '2026-03-28',
    }
    const due = (dueOn: string, dueTime: string) => ({ settingId: s1, dueOn, dueTime })
    input = modified(input, { frequency: THREE_DAYS, times: FOUR, endsOn: null }, 'correct')
    for (const [time, status] of [
      ['12:00', 'missed'],
      ['23:00', 'given'],
      ['06:00', 'given'],
    ] as const) {
      const gesture = { status, givenOn: '2026-03-28', shiftsFollowing: time !== '23:00' }
      input = played(input, { kind: 'note', due: due('2026-03-28', time), ...gesture })
    }
    input = played(input, {
      kind: 'move',
      due: due('2026-03-31', '06:00'),
      to: '2026-04-10',
      shiftsFollowing: true,
    })
    input = on(input, '2026-04-01')
    const sixAm = noteOf(input, '2026-03-28', '06:00')
    input = played(input, {
      kind: 'redate',
      lineId: sixAm,
      givenOn: '2026-03-31',
      shiftsFollowing: false,
    })
    input = played(input, {
      kind: 'move',
      due: due('2026-04-10', '06:00'),
      to: '2026-04-02',
      shiftsFollowing: false,
    })
    input = modified(
      input,
      { frequency: THREE_DAYS, times: ['08:00', '14:00', '20:00'], endsOn: null },
      'keep',
    )
    input = played(input, {
      kind: 'note',
      due: due('2026-03-28', '18:00'),
      status: 'given',
      givenOn: '2026-03-28',
      shiftsFollowing: true,
    })
    return played(input, {
      kind: 'redate',
      lineId: sixAm,
      givenOn: '2026-03-29',
      shiftsFollowing: true,
    })
  }

  // Trou connu #1258 : après « sans heure », le 2 avril ne montre plus que 8 h.
  it.fails(
    'graine 500000298 : « sans heure » ne change pas le 2 avril, arrivée du report (heures seules)',
    () => {
      const input = luna()
      expect(journee(input, '2026-04-02')).toEqual([
        '12:00 pending',
        '18:00 pending',
        '23:00 pending',
      ])
      expect(
        journee(
          hoursOnly(input, () => []),
          '2026-04-02',
        ),
      ).toEqual(journee(input, '2026-04-02'))
    },
  )
})
