// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  newSettings,
  removeLine,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { written } from '../domain/dose-calendar/gestures/changes'
import type { Line } from '../domain/dose-calendar/types'
import { edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { WEEK, keys, line, setting } from './dose-calendar.v2.aides'

// Milo, chaque lundi à 8 h depuis le 2 mars, rien de noté ; le 9 et le 16 répondus « pas à donner ».
function milo(extra: Line[] = [], today = '2026-03-18'): TreatmentViewInput {
  const weekly = setting('m1', '2026-03-02', WEEK, ['08:00'])
  return {
    settings: [weekly],
    lines: [
      line('m1', 'not-due', '2026-03-09', '08:00'),
      line('m1', 'not-due', '2026-03-16', '08:00'),
      ...extra,
    ],
    today,
  }
}

const shown = (input: TreatmentViewInput) =>
  treatmentView(input)
    .slots('2026-03-01', '2026-04-30')
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

describe('#873 : une ligne « pas à donner » retire sa dose de partout (décisions du 18 octobre 2026)', () => {
  it('la dose n’est nulle part : ni au calendrier, ni à renseigner, ni dose du moment ; la ligne couvre son échéance', () => {
    const input = milo()
    const view = treatmentView(input)
    expect(shown(input)).toEqual([
      '2026-03-02 08:00 pending',
      '2026-03-23 08:00 pending',
      '2026-03-30 08:00 pending',
      '2026-04-06 08:00 pending',
      '2026-04-13 08:00 pending',
      '2026-04-20 08:00 pending',
      '2026-04-27 08:00 pending',
    ])
    expect(keys(view.unloggedDoses)).toEqual([])
    expect(keys(view.currentDoses)).toEqual(['2026-03-02 08:00'])
    expect(view.history.map(({ effect }) => effect.kind)).toEqual(['covers', 'covers'])
    const { moteur, reference } = readings(input)
    expect(moteur).toEqual(reference)
  })

  it('« Supprimer » la ligne : la dose revient à renseigner', () => {
    const input = milo()
    const removal = removeLine(input, input.lines[1]!.id)
    if ('refusal' in removal) throw new Error(JSON.stringify(removal))
    const after = { ...input, lines: input.lines.filter(({ id }) => id !== input.lines[1]!.id) }
    expect(removal.changes).toEqual([{ action: 'delete', id: input.lines[1]!.id }])
    expect(keys(treatmentView(after).currentDoses)).toEqual(['2026-03-16 08:00'])
  })

  it('I1 : une prise l’emporte toujours sur la ligne « pas à donner » de sa dose, plus récente ou plus ancienne ; la ligne est sans effet', () => {
    const effects = (input: TreatmentViewInput) =>
      treatmentView(input)
        .history.filter(({ line: each }) => each.dueOn === '2026-03-16')
        .map(({ line: each, effect }) => `${each.status} ${effect.kind}`)
        .sort()
    for (const updatedAt of ['2027-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z']) {
      const given = { ...line('m1', 'given', '2026-03-16', '08:00'), updatedAt }
      const input = milo([given])
      expect(shown(input)).toContain('2026-03-16 08:00 given')
      expect(effects(input)).toEqual(['given covers', 'not-due idle'])
      expect(readings(input).moteur).toEqual(readings(input).reference)
    }
  })

  it('Q-a : « pas à donner » crée sa ligne, sans jamais réécrire la prise de la même dose', () => {
    const given = line('m1', 'given', '2026-03-16', '08:00')
    const notDue = {
      settingId: 'm1',
      dueOn: '2026-03-16',
      dueTime: '08:00',
      status: 'not-due' as const,
      givenOn: null,
      targetOn: null,
    }
    expect(written([given], notDue)).toEqual({ action: 'create', line: notDue })
    const prise = { ...notDue, status: 'given' as const, givenOn: '2026-03-16' }
    const onlyNotDue = line('m1', 'not-due', '2026-03-16', '08:00')
    expect(written([onlyNotDue], prise)).toEqual({ action: 'create', line: prise })
  })

  it('deux téléphones : B donne la dose du 16, A répond « pas à donner » en la listant ; après la synchro, dans les deux ordres, la prise du 16 compte', () => {
    const weekly = setting('m1', '2026-03-02', WEEK, ['08:00'])
    const onA: TreatmentViewInput = { settings: [weekly], lines: [], today: '2026-03-18' }
    const asked = newSettings(onA, { frequency: WEEK, times: ['09:00'], endsOn: null })
    if (!('question' in asked) || 'refusal' in asked.question.correct) {
      throw new Error(JSON.stringify(asked))
    }
    expect(keys(asked.question.fallen)).toContain('2026-03-16 08:00')
    const answer: Line[] = (asked.question.correct.lines ?? []).flatMap((change, index) =>
      change.action === 'create'
        ? [{ ...change.line, id: `a${index}`, updatedAt: '2026-03-18T10:00:00.000Z' }]
        : [],
    )
    const notDueOn16 = answer.find(({ dueOn }) => dueOn === '2026-03-16')!
    for (const updatedAt of ['2026-03-18T09:00:00.000Z', '2026-03-18T11:00:00.000Z']) {
      const fromB = { ...line('m1', 'given', '2026-03-16', '08:00'), updatedAt }
      for (const lines of [
        [...answer, fromB],
        [fromB, ...answer],
      ]) {
        const merged = { ...onA, lines }
        const view = treatmentView(merged)
        const effectOf = (id: string) =>
          view.history.find(({ line: each }) => each.id === id)?.effect.kind
        expect(effectOf(fromB.id)).toBe('covers')
        expect(effectOf(notDueOn16.id)).toBe('idle')
        expect(
          view.slots('2026-03-16', '2026-03-16').map(({ due, state }) => `${due.dueTime} ${state}`),
        ).toEqual(['08:00 given'])
        expect(readings(merged).moteur).toEqual(readings(merged).reference)
      }
    }
  })

  it('n’est pas une prise : le réglage reste sans prise, « Modifier » repose la question sur ce qui est tombé depuis', () => {
    const input = milo([], '2026-03-25')
    const asked = newSettings(input, { frequency: WEEK, times: ['09:00'], endsOn: null })
    expect('question' in asked && keys(asked.question.fallen)).toEqual([
      '2026-03-02 08:00',
      '2026-03-23 08:00',
    ])
  })

  it('une journée retirée en entier n’est pas la dernière journée passée : la dose du 2 reste la dose du moment', () => {
    const view = treatmentView(milo())
    expect(view.phase).toBe('overdue')
    expect(keys(view.currentDoses)).toEqual(['2026-03-02 08:00'])
  })

  it('#867 : un report de la dose du 16 plus récent que sa ligne « pas à donner » l’emporte, la ligne est sans effet ; plus ancien, il est battu', () => {
    const weekly = setting('m1', '2026-03-02', WEEK, ['08:00'])
    const notDue = {
      ...line('m1', 'not-due', '2026-03-16', '08:00'),
      updatedAt: '2026-03-17T09:00:00.000Z',
    }
    const report = {
      ...line('m1', 'postponed', '2026-03-16', '08:00', '2026-03-19'),
      updatedAt: '2026-03-17T10:00:00.000Z',
    }
    const newer = { settings: [weekly], lines: [notDue, report], today: '2026-03-18' }
    const effects = (input: TreatmentViewInput) =>
      treatmentView(input)
        .history.map(({ line: each, effect }) => `${each.status} ${effect.kind}`)
        .sort()
    expect(effects(newer)).toEqual(['not-due idle', 'postponed moves'])
    expect(shown(newer)).toContain('2026-03-19 08:00 pending')
    expect(readings(newer).moteur).toEqual(readings(newer).reference)
    const older = {
      ...newer,
      lines: [notDue, { ...report, updatedAt: '2026-03-17T08:00:00.000Z' }],
    }
    expect(effects(older)).toEqual(['not-due covers', 'postponed idle'])
    expect(shown(older).some((key) => key.startsWith('2026-03-19'))).toBe(false)
    expect(readings(older).moteur).toEqual(readings(older).reference)
  })

  it('avec une « Prochaine dose » choisie qui emmène un report, chaque dose listée garde sa ligne', () => {
    const TWO_DAYS = { value: 2, unit: 'day' } as const
    let luna: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-02-23', WEEK, ['08:00'], { createdAt: '2026-02-01T00:00:00.000Z' }),
      ],
      lines: [],
      today: '2026-02-23',
    }
    luna = given(luna, '2026-02-23', '08:00')
    luna = moved(on(luna, '2026-03-01'), '2026-03-02', '08:00', '2026-03-06', false)
    luna = edited(on(luna, '2026-03-03'), {
      frequency: TWO_DAYS,
      times: ['09:00'],
      endsOn: null,
      firstDueOn: '2026-03-04',
    })
    luna = on(luna, '2026-03-06')
    for (const firstDueOn of [undefined, '2026-03-07']) {
      const asked = newSettings(luna, {
        frequency: TWO_DAYS,
        times: ['10:00'],
        endsOn: null,
        firstDueOn,
      })
      if (!('question' in asked) || 'refusal' in asked.question.correct) {
        throw new Error(JSON.stringify(asked))
      }
      const listed = keys(asked.question.fallen)
      expect(listed).toContain('2026-03-04 09:00')
      const notDue = (asked.question.correct.lines ?? []).flatMap((change) =>
        change.action === 'create' && change.line.status === 'not-due' ? keys([change.line]) : [],
      )
      expect(notDue.sort()).toEqual([...listed].sort())
    }
  })
})
