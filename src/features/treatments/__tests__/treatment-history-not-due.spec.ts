import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import { doseChange } from '../logic/treatment-dose-change'
import { treatmentHistory } from '../logic/treatment-history'
import { lineAction } from '../logic/treatment-line-actions'
import { doseActionTexts } from '../logic/treatment-gestures'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

const ANSWERED_AT = new Date(2026, 2, 20, 12).toISOString()
const LATER_AT = new Date(2026, 2, 21, 12).toISOString()
const TODAY = '2026-03-25'

function notDue(dueOn: string, overrides: Partial<TreatmentDose> = {}): TreatmentDose {
  return dose(dueOn, dueOn, {
    id: `pas à donner ${dueOn}`,
    givenOn: null,
    status: 'not-due',
    createdAt: ANSWERED_AT,
    updatedAt: ANSWERED_AT,
    ...overrides,
  })
}

const WEEKLY = period({
  frequency: { value: 1, unit: 'week' },
  startsOn: '2026-03-02',
  firstDueOn: '2026-03-02',
})

const MILO = treatment(
  [WEEKLY],
  [
    dose('2026-03-02', '2026-03-02'),
    notDue('2026-03-09'),
    notDue('2026-03-16'),
    dose('2026-03-16', '2026-03-16', {
      id: 'prise du 16',
      givenOn: '2026-03-17',
      createdAt: LATER_AT,
      updatedAt: LATER_AT,
    }),
  ],
)

function lines(book = MILO) {
  const [only] = plain(treatmentHistory(t, book, treatmentReadingOf(book, TODAY), TODAY)).periods
  return only!.lines
}

function removeTexts(line: TreatmentDose) {
  return doseActionTexts(
    t,
    { name: 'Métacam', animal: 'Milo', today: TODAY, severalTimes: false },
    { kind: 'remove', lineId: line.id },
    line,
  )
}

afterEach(() => applyLocale('fr'))

describe('historique : lignes « pas à donner » (#952)', () => {
  it('les montre sous leur échéance, la sans effet grisée, en français', () => {
    expect(lines().map(({ title }) => title)).toEqual([
      '16 mars 2026',
      '16 mars 2026',
      '9 mars 2026',
      '2 mars 2026',
    ])
    expect(lines().map(({ kind }) => kind)).toEqual(['given', 'idle', 'not-due', 'given'])
    expect(lines().map((line) => 'detail' in line && line.detail)).toEqual([
      'Donnée le 17 mars 2026',
      'Pas à donner · répondu le 20 mars 2026 · sans effet',
      'Pas à donner · répondu le 20 mars 2026',
      null,
    ])
  })

  it('les montre en anglais', () => {
    applyLocale('en')

    expect(lines().map((line) => 'detail' in line && line.detail)).toEqual([
      'Given on Mar 17, 2026',
      'Not meant to be given · answered Mar 20, 2026 · no longer applies',
      'Not meant to be given · answered Mar 20, 2026',
      null,
    ])
  })

  it('ajoute l’heure quand le traitement a plusieurs prises par jour', () => {
    const twice = period({
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      startsOn: '2026-03-09',
      firstDueOn: '2026-03-09',
    })
    const book = treatment([twice], [notDue('2026-03-09', { dueTime: '20:00' })])

    expect(lines(book).find(({ kind }) => kind === 'not-due')?.title).toBe(
      t('treatments.history.dueAt', { date: '9 mars 2026', time: '20 h' }),
    )
  })

  it('ne sépare jamais une ligne « pas à donner » des autres lignes de sa date quand le reste est replié', () => {
    const twice = period({
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      startsOn: '2026-03-01',
      firstDueOn: '2026-03-01',
    })
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']
    const book = treatment(
      [twice],
      [
        ...days.flatMap((day) => [dose(day, day, { dueTime: '08:00' })]),
        ...days
          .filter((day) => day !== '2026-03-03')
          .map((day) => dose(day, day, { dueTime: '20:00' })),
        notDue('2026-03-03', { dueTime: '20:00' }),
      ],
    )
    const [only] = plain(treatmentHistory(t, book, treatmentReadingOf(book, TODAY), TODAY)).periods
    const shown = only!.lines.slice(0, only!.visibleLines)
    const last = shown.at(-1)!

    expect(only!.toggle).not.toBeNull()
    expect(only!.lines[only!.visibleLines]?.dose.dueOn).not.toBe(last.dose.dueOn)
  })

  it('laisse repliée la réponse « pas à donner » d’une date que touche le groupe d’oublis, troisième ligne (question posée)', () => {
    const twice = period({
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      startsOn: '2026-03-01',
      firstDueOn: '2026-03-01',
    })
    const at = (day: string, time: string) => ({ dueTime: time, id: `${day} ${time}` })
    const book = treatment(
      [twice],
      [
        ...['01', '02', '03'].flatMap((d) =>
          ['08:00', '20:00'].map((time) => dose(`2026-03-${d}`, `2026-03-${d}`, at(d, time))),
        ),
        notDue('2026-03-04', at('04', '08:00')),
        missed('2026-03-04', '2026-03-04', at('04', '20:00')),
        missed('2026-03-05', '2026-03-05', at('05', '08:00')),
        missed('2026-03-05', '2026-03-05', at('05', '20:00')),
        dose('2026-03-06', '2026-03-06', at('06', '08:00')),
        dose('2026-03-06', '2026-03-06', at('06', '20:00')),
      ],
    )
    const [only] = plain(treatmentHistory(t, book, treatmentReadingOf(book, TODAY), TODAY)).periods

    const shown = only!.lines.slice(0, only!.visibleLines)
    const folded = only!.lines.slice(only!.visibleLines)

    expect(shown.map(({ kind }) => kind)).toEqual(['given', 'given', 'missed'])
    expect(folded.map(({ kind }) => kind)).toContain('not-due')
  })

  it('range une prise avant la réponse « pas à donner » de la même échéance', () => {
    expect(
      lines()
        .map(({ kind }) => kind)
        .slice(0, 2),
    ).toEqual(['given', 'idle'])
  })

  it('nomme le bouton « Annuler » avec la date en toutes lettres', () => {
    const answered = notDue('2026-12-28', { createdAt: new Date(2025, 11, 31, 12).toISOString() })

    expect(plain(removeTexts(answered).undo)).toBe(
      'Annuler la suppression de la réponse du 31 décembre 2025',
    )
  })

  it('propose Supprimer, et seulement lui', () => {
    const [, idle, active] = lines()

    expect(active!.actions).toEqual(['remove'])
    expect(idle!.actions).toEqual(['remove'])
  })

  it('Supprimer écrit la suppression de la ligne seule', () => {
    const [, , active] = lines()

    expect(lineAction(active!.dose, 'remove', TODAY)).toEqual({
      kind: 'remove',
      lineId: active!.dose.id,
    })
  })

  it('dit « Réponse du … supprimée » avec son Annuler', () => {
    const [, , active] = lines()

    expect(plain(removeTexts(active!.dose).done({ shiftKept: false } as never))).toBe(
      'Réponse du 20 mars supprimée',
    )
    expect(plain(removeTexts(active!.dose).undo)).toBe(
      'Annuler la suppression de la réponse du 20 mars 2026',
    )
    applyLocale('en')
    expect(plain(removeTexts(active!.dose).done({ shiftKept: false } as never))).toBe(
      'Answer on Mar 20 deleted',
    )
  })

  it('le geste supprime la ligne seule, sans toucher aux autres', () => {
    const [, , active] = lines()
    const change = doseChange(
      MILO,
      treatmentReadingOf(MILO, TODAY),
      { kind: 'remove', lineId: active!.dose.id },
      () => 'new',
    )

    expect(change.writes).toMatchObject([{ action: 'delete', id: active!.dose.id }])
  })
})
