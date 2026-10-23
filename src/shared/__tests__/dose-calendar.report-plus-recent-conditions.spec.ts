// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveDose,
  newSettings,
  settingsApplied,
  treatmentView,
  type Frequency,
  type Line,
  type LineChange,
  type Setting,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { rewrittenOn } from './dose-calendar.reglage-corrige.aides'
import { keys } from './dose-calendar.v2.aides'

// #882 : après la première échéance, la réécriture plus récente n'emporte que la journée qu'elle a
// elle-même ôtée ; chaque condition a son carnet (relecture de la PR #934).

const WEEK: Frequency = { value: 1, unit: 'week' }

function luna(extra: Partial<Setting> = {}): Setting {
  return {
    id: 's1',
    startsOn: '2026-04-03',
    firstDueOn: '2026-04-10',
    gridOriginOn: '2026-04-10',
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    endsOn: null,
    stoppedOn: null,
    frequency: WEEK,
    times: ['08:00'],
    createdAt: '2026-04-03T08:00:00.000Z',
    ...extra,
  }
}

const postponed = (id: string, settingId: string, dueOn: string, targetOn: string, at: string) =>
  ({
    id,
    settingId,
    dueOn,
    dueTime: '08:00',
    status: 'postponed',
    givenOn: null,
    targetOn,
    decidedAt: at,
  }) as Line

function written(
  input: TreatmentViewInput,
  changes: readonly LineChange[],
  at: string,
): TreatmentViewInput {
  let lines = [...input.lines]
  changes.forEach((change, index) => {
    if (change.action === 'delete') lines = lines.filter(({ id }) => id !== change.id)
    else lines = [...lines, { ...change.line, id: `${at}-${index}`, decidedAt: at }]
  })
  return { ...input, lines }
}

function modified(
  input: TreatmentViewInput,
  request: SettingsRequest,
  at: string,
  id: string,
): TreatmentViewInput {
  const answer = newSettings(input, request)
  if ('refusal' in answer) throw new Error(JSON.stringify(answer))
  const plan = 'plan' in answer ? answer.plan : answer.question.keep
  if ('refusal' in plan) throw new Error(JSON.stringify(plan))
  if (plan.action === 'rewrite') {
    const { settings } = settingsApplied({ ...input, lines: [] }, { ...plan, lines: [] })
    const dated = settings.map((s, index) =>
      s.id === plan.id ? rewrittenOn(input.settings[index]!, s, at) : s,
    )
    return { ...input, settings: dated }
  }
  const created = { ...plan.setting, id, stoppedOn: null, createdAt: at }
  return written({ ...input, settings: [...input.settings, created] }, plan.lines ?? [], at)
}

const readings = (input: TreatmentViewInput) => ({
  moteur: keys(treatmentView(input).upcoming({ limit: 4 })),
  reference: referenceReading({ ...input, until: '2026-12-31' }).upcoming.slice(0, 4),
})

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

describe('#882 : la journée de départ doit être lue sous le réglage réécrit ou un réglage qui garde sa grille', () => {
  // Luna, chaque semaine à 8 h, première dose le 10 avril ; le 8, A reporte la dose du 17 au 19 puis
  // change de rythme ; B, plus récent, choisit « Prochaine dose » le 9 (ou le 11).
  it.each([
    [
      'toutes les 2 semaines',
      { value: 2, unit: 'week' },
      '2026-04-09',
      ['2026-04-08 08:00', '2026-04-19 08:00', '2026-04-22 08:00', '2026-05-06 08:00'],
    ],
    [
      'chaque mois',
      { value: 1, unit: 'month' },
      '2026-04-11',
      ['2026-04-08 08:00', '2026-04-19 08:00', '2026-05-08 08:00', '2026-06-08 08:00'],
    ],
  ] as [string, Frequency, string, string[]][])(
    'A passe à %s : le réglage de A porte le 17, le report tient',
    (_, frequency, chosen, expected) => {
      const base: TreatmentViewInput = { settings: [luna()], lines: [], today: '2026-04-08' }
      const moved = moveDose(base, {
        due: { settingId: 's1', dueOn: '2026-04-17', dueTime: '08:00' },
        to: '2026-04-19',
        shiftsFollowing: false,
      })
      if ('refusal' in moved) throw new Error(JSON.stringify(moved))
      let phoneA = written(base, moved.changes, '2026-04-08T09:00:00.000Z')
      const request = { frequency, times: ['08:00'], endsOn: null }
      phoneA = modified(phoneA, request, '2026-04-08T09:30:00.000Z', 'sA')
      const phoneB = modified(
        base,
        { frequency: WEEK, times: ['08:00'], endsOn: null, firstDueOn: chosen },
        '2026-04-08T18:00:00.000Z',
        'sB',
      )
      const merged = {
        ...base,
        settings: [...phoneB.settings, ...phoneA.settings.filter(({ id }) => id !== 's1')],
        lines: phoneA.lines,
      }
      expect(readings(merged)).toEqual({ moteur: expected, reference: expected })
    },
  )
})

describe('#882 : une journée ôtée par une autre ligne, pas par la réécriture, garde la lecture d’avant', () => {
  it('la journée est sur la grille propre du réglage réécrit (un décalage l’a ôtée) : le report tient', () => {
    const shift = {
      ...postponed('d1', 's1', '2026-04-10', '2026-04-12', '2026-04-04T08:00:00.000Z'),
      status: 'shift',
    } as Line
    const report = postponed('r1', 's1', '2026-04-17', '2026-04-18', '2026-04-04T09:00:00.000Z')
    const input: TreatmentViewInput = {
      settings: [luna({ times: ['08:00'], updatedAt: '2026-04-05T08:00:00.000Z' })],
      lines: [shift, report],
      today: '2026-04-08',
    }
    expect(effectOf(input, 'r1')).toMatchObject({ kind: 'moves', arrival: '2026-04-18' })
    expect(readings(input).reference).toEqual(readings(input).moteur)
  })

  it('le réglage réécrit reprend la grille de son prédécesseur sans la changer : le report tient', () => {
    const s2: Setting = {
      ...luna({ id: 's2', startsOn: '2026-04-12', firstDueOn: '2026-04-17', gridOriginOn: null }),
      firstDueChosen: false,
      createdAt: '2026-04-04T08:00:00.000Z',
      updatedAt: '2026-04-06T08:00:00.000Z',
    }
    const report = postponed('r1', 's2', '2026-04-19', '2026-04-20', '2026-04-05T08:00:00.000Z')
    const input: TreatmentViewInput = {
      settings: [luna(), s2],
      lines: [report],
      today: '2026-04-12',
    }
    expect(effectOf(input, 'r1')).toMatchObject({ kind: 'moves', arrival: '2026-04-20' })
    expect(readings(input).reference).toEqual(readings(input).moteur)
  })
})

describe('#883 : une ligne écrite au même instant que le réglage ne le contredit pas', () => {
  it('report et réécriture du même instant : la lecture d’avant, le report tient', () => {
    const QUARTER: Frequency = { value: 3, unit: 'month' }
    const AT = '2026-03-03T09:00:00.000Z'
    const s1 = luna({
      startsOn: '2026-03-03',
      firstDueOn: '2026-03-05',
      gridOriginOn: '2026-03-05',
      frequency: QUARTER,
      times: ['08:01', '14:01', '20:01'],
      createdAt: '2026-03-01T08:00:00.000Z',
      updatedAt: AT,
    })
    const report = postponed('r1', 's1', '2026-03-05', '2026-03-06', AT)
    const input: TreatmentViewInput = { settings: [s1], lines: [report], today: '2026-03-03' }
    expect(effectOf(input, 'r1')).toMatchObject({ kind: 'moves', arrival: '2026-03-06' })
    expect(readings(input).reference).toEqual(readings(input).moteur)
  })
})
