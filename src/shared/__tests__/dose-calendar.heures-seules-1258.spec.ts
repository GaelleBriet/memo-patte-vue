// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { naive } from '../../../scripts/dose-engine/v2-invariants-readings'
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

  it('graine 470000631 : le 27 mars garde les seules heures du report, 12 et 18 h (R7)', () => {
    expect(journee(milo(), '2026-03-27')).toEqual(['12:00 pending', '18:00 pending'])
  })

  it('graine 470000631 : une minute plus tard ne change pas le 27 mars (heures seules)', () => {
    const input = milo()
    expect(journee(minuteLater(input), '2026-03-27')).toEqual(journee(input, '2026-03-27'))
  })

  it('graine 470000631 : le modèle naïf lit la même chose, avant et après une minute de plus', () => {
    expect(naive(milo())).toBeNull()
    expect(naive(minuteLater(milo()))).toBeNull()
  })

  // Même chaîne, 18 h du 24 reportée au 27 avec la case ; « Modifier » : chaque semaine à 8, 14 et
  // 20 h (première échéance le 24) ; 8 h du 31 mars reportée au 2 avril avec la case ; « Modifier » :
  // tous les 2 jours à 6, 12, 18 et 23 h. Le 24, absent de la grille du réglage du report, reste fait
  // des seules doses arrivées, même devenu une journée de la grille en vigueur.
  it('18 h reportée : le 27 mars garde la seule heure du report, 18 h (R7)', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-22', THREE_DAYS, FOUR)],
      lines: [],
      today: '2026-03-22',
    }
    input = given(input, '2026-03-22', '23:00')
    input = moved(on(input, '2026-03-24'), '2026-03-22', '06:00', '2026-03-24', false)
    input = given(input, '2026-03-24', '06:00')
    input = moved(input, '2026-03-24', '18:00', '2026-03-27')
    input = edited(input, { frequency: WEEK, times: ['08:00', '14:00', '20:00'], endsOn: null })
    input = moved(input, '2026-03-31', '08:00', '2026-04-02')
    input = edited(input, { frequency: TWO_DAYS, times: FOUR, endsOn: null })
    expect(journee(input, '2026-03-27')).toEqual(['18:00 pending'])
    expect(naive(input)).toBeNull()
  })
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

  it('graine 500000298 : « sans heure » ne change pas le 2 avril, arrivée du report (heures seules)', () => {
    const input = luna()
    expect(journee(input, '2026-04-02')).toEqual([
      '06:00 pending',
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
  })
})

describe('Posologie seule après un report parti de l’arrivée d’un report avec la case (#1258)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 3, 11, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Luna, chaque jour à 8 et 20 h dès le 3 avril. Le 11 : « Modifier », chaque semaine à 6, 12, 18 et
  // 23 h, « Elles restent à renseigner » ; 23 h du 11 oubliée ; la dose de 6 h du 11 reportée au 18 avec
  // la case (le 18 reçoit 6, 12 et 18 h) ; « Modifier » aux mêmes réglages, « Prochaine dose » le 18 ;
  // 12 h du 18 reportée au 21 avec la case (le 21 reçoit 12 et 18 h).
  function luna(): TreatmentViewInput {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-03', { value: 1, unit: 'day' }, ['08:00', '20:00'])],
      lines: [],
      today: '2026-04-11',
    }
    const weekly = { frequency: WEEK, times: FOUR, endsOn: null }
    input = modified(input, weekly, 'keep')
    const due = (dueOn: string, dueTime: string) => ({
      settingId: input.settings.at(-1)!.id,
      dueOn,
      dueTime,
    })
    input = played(input, {
      kind: 'note',
      due: due('2026-04-11', '23:00'),
      status: 'missed',
      givenOn: '2026-04-11',
      shiftsFollowing: true,
    })
    input = played(input, {
      kind: 'move',
      due: due('2026-04-11', '06:00'),
      to: '2026-04-18',
      shiftsFollowing: true,
    })
    input = modified(input, { ...weekly, firstDueOn: '2026-04-18' }, 'keep')
    return played(input, {
      kind: 'move',
      due: due('2026-04-18', '12:00'),
      to: '2026-04-21',
      shiftsFollowing: true,
    })
  }

  it('graine 590000162 : le 21 avril reçoit 12 et 18 h, que le report emporte du 18', () => {
    expect(journee(luna(), '2026-04-21')).toEqual(['12:00 pending', '18:00 pending'])
  })

  // Le décalage du 11 au 18, écrit sous le réglage que celui du 18 continue, écarte aussi le 18 de ce
  // dernier : remplacé le jour même par une posologie seule, il ne cède pas le 18 avec ses quatre heures.
  it('graine 590000162 : une posologie seule ne change pas le 21 avril (R6)', () => {
    const input = luna()
    expect(
      journee(
        hoursOnly(input, (times) => [...times]),
        '2026-04-21',
      ),
    ).toEqual(journee(input, '2026-04-21'))
  })

  it('graine 590000162 : le modèle naïf lit la même chose après la posologie seule', () => {
    expect(naive(luna())).toBeNull()
    expect(naive(hoursOnly(luna(), (times) => [...times]))).toBeNull()
  })
})

describe('Heure ajoutée sur l’arrivée d’un report sans heure (#1258)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 3, 6, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Milo, tous les 3 jours à 6, 12, 18 et 23 h dès le 27 mars. Le 30 : sans heure, « Prochaine dose »
  // le 8, « Elles restent à renseigner » ; 12 h du 27 reportée au 8 avec la case. Le 1er avril : la dose
  // du 8 ramenée au 6 avec la case ; 12 h du 6 donnée (« Remplace »). Le 3 : la dose du 6 reportée au
  // 7 sans la case ; « Modifier » : toutes les 6 semaines. Le 6 : 18 h du 7 donnée avec la case (sans
  // cette prise, l'heure ajoutée ne change plus le 7).
  function milo(): TreatmentViewInput {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-27', THREE_DAYS, FOUR, { firstDueChosen: true })],
      lines: [],
      today: '2026-03-30',
    }
    const current = () => input.settings.at(-1)!.id
    input = modified(
      input,
      { frequency: THREE_DAYS, times: [], endsOn: null, firstDueOn: '2026-04-08' },
      'keep',
    )
    input = played(input, {
      kind: 'move',
      due: { settingId: 's1', dueOn: '2026-03-27', dueTime: '12:00' },
      to: '2026-04-08',
      shiftsFollowing: true,
    })
    input = played(on(input, '2026-04-01'), {
      kind: 'move',
      due: { settingId: current(), dueOn: '2026-04-08', dueTime: null },
      to: '2026-04-06',
      shiftsFollowing: true,
    })
    input = played(input, {
      kind: 'note',
      due: { settingId: current(), dueOn: '2026-04-06', dueTime: '12:00' },
      status: 'given',
      givenOn: '2026-04-01',
      shiftsFollowing: false,
      answer: 'replaces',
    })
    input = played(on(input, '2026-04-03'), {
      kind: 'move',
      due: { settingId: current(), dueOn: '2026-04-06', dueTime: null },
      to: '2026-04-07',
      shiftsFollowing: false,
    })
    input = modified(
      input,
      { frequency: { value: 6, unit: 'week' }, times: [], endsOn: null },
      'keep',
    )
    return played(on(input, '2026-04-06'), {
      kind: 'note',
      due: { settingId: 's1', dueOn: '2026-04-07', dueTime: '18:00' },
      status: 'given',
      givenOn: '2026-04-06',
      shiftsFollowing: true,
    })
  }

  it('graine 600000926 : le 7 avril montre 18 h donnée et 23 h à donner', () => {
    expect(journee(milo(), '2026-04-07')).toEqual(['18:00 given', '23:00 pending'])
  })

  // Le 6, absent de la grille du réglage du report (le 5, le 8), se juge fait des seules doses arrivées.
  it('graine 600000926 : une heure ajoutée ne change pas le 7 avril (heures seules)', () => {
    const input = milo()
    expect(
      journee(
        hoursOnly(input, () => ['06:00']),
        '2026-04-07',
      ),
    ).toEqual(journee(input, '2026-04-07'))
    expect(naive(input)).toBeNull()
    expect(naive(hoursOnly(input, () => ['06:00']))).toBeNull()
  })
})
