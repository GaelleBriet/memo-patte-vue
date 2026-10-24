import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import {
  cardDone,
  cardOtherDateDays,
  cardTarget,
  extraQuestion,
} from '../logic/treatment-card-other-date'
import { notifiedPlan } from '../logic/treatment-other-date'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { otherDateNote } from '../logic/treatment-shift-box'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import i18n, { applyLocale } from '@/core/i18n'
import { applied, play, treatmentView, type Due } from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

const t = i18n.global.t
const WEEK = { value: 1, unit: 'week' } as const
const BIRTH = '2020-03-01'

const milbemax = (firstDueOn: string, times = ['09:00']) =>
  period({ startsOn: firstDueOn, firstDueOn, frequency: WEEK, times })
const bravecto = period({
  startsOn: '2026-11-01',
  firstDueOn: '2026-11-01',
  frequency: { value: 3, unit: 'month' },
})

function cardOf(book: TreatmentWithPeriods, today: string) {
  const reading = treatmentReadingOf(book, today)
  return { reading, target: cardTarget(reading.view.currentDoses)! }
}

function noted(reading: TreatmentReading, due: Due, givenOn: string) {
  const result = play(reading.input, {
    kind: 'note',
    due,
    status: 'given',
    givenOn,
    shiftsFollowing: false,
  })
  if ('refusal' in result) throw new Error(result.refusal.reason)
  return treatmentView(applied(reading.input, result.changes))
}

afterEach(() => applyLocale('fr'))

describe('« Fait à une autre date » depuis la carte vise la dose de la carte (TR-13, Q28)', () => {
  it('scénario 9 : Luna, Milbemax le 20 oct., carte du 20, le 19 : « 20 oct. — Donnée le 19 », bandeau 6 et 13 oct.', () => {
    const { reading, target } = cardOf(treatment([milbemax('2026-10-06')]), '2026-10-20')
    expect(target).toEqual({ dueOn: '2026-10-20', dueTime: '09:00' })
    const { due } = notifiedPlan(t, reading.view, target)
    expect(due).toEqual({ settingId: 'p-1', dueOn: '2026-10-20', dueTime: '09:00' })
    expect(extraQuestion(t, reading, due!, '2026-10-19', false, null, false)).toBeNull()
    const after = noted(reading, due!, '2026-10-19')
    expect(after.history.map(({ line }) => [line.status, line.dueOn, line.givenOn])).toEqual([
      ['given', '2026-10-20', '2026-10-19'],
    ])
    expect(after.unloggedDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-10-06', '2026-10-13'])
  })

  it('carte de la dose du jour et « Fait hier » : la dose du jour donnée en avance, jamais celle d’avant', () => {
    const book = treatment([milbemax('2026-10-10', [])], [dose('2026-10-10', '2026-10-17')])
    const { reading, target } = cardOf(book, '2026-10-24')
    const { due } = notifiedPlan(t, reading.view, target)
    expect(due?.dueOn).toBe('2026-10-24')
    const after = noted(reading, due!, '2026-10-23')
    expect(after.dueState({ dueOn: '2026-10-24', dueTime: null })).toBe('given')
    expect(after.unloggedDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-10-17'])
  })

  it('à plusieurs heures, la carte vise sa journée : l’heure se choisit parmi les siennes', () => {
    const { target } = cardOf(treatment([milbemax('2026-10-20', ['08:00', '20:00'])]), '2026-10-24')
    expect(target).toEqual({ dueOn: '2026-10-20', dueTime: null })
  })
})

describe('les jours de la feuille depuis la carte (Q28)', () => {
  it('du lendemain de l’échéance précédente à aujourd’hui, l’aide renvoie au bandeau', () => {
    const { reading, target } = cardOf(treatment([milbemax('2026-10-06')]), '2026-10-20')
    expect(cardOtherDateDays(reading, target, '2026-10-20', BIRTH)).toEqual({
      min: '2026-10-14',
      earlierHelp: true,
    })
  })

  it('avant la première échéance : aucun jour grisé par une échéance, la date de naissance seule', () => {
    const { reading, target } = cardOf(treatment([bravecto]), '2026-10-24')
    expect(cardOtherDateDays(reading, target, '2026-10-24', BIRTH)).toEqual({
      min: BIRTH,
      earlierHelp: false,
    })
  })

  it('Q29 : la dose du jour notée, carte « Prochaine dose · 31 oct. » : aujourd’hui reste choisissable', () => {
    const book = treatment(
      [milbemax('2026-10-17')],
      [
        dose('2026-10-17', '2026-10-24', { dueTime: '09:00' }),
        dose('2026-10-24', '2026-10-31', { dueTime: '09:00' }),
      ],
    )
    const { reading, target } = cardOf(book, '2026-10-24')
    expect(target).toEqual({ dueOn: '2026-10-31', dueTime: '09:00' })
    expect(cardOtherDateDays(reading, target, '2026-10-24', BIRTH)).toEqual({
      min: '2026-10-24',
      earlierHelp: true,
    })
    const { due } = notifiedPlan(t, reading.view, target)
    expect(due).toEqual({ settingId: 'p-1', dueOn: '2026-10-31', dueTime: '09:00' })
    expect(extraQuestion(t, reading, due!, '2026-10-24', false, null, false)).not.toBeNull()
  })
})

describe('« Cette prise » : « En plus » ou « Remplace celle du … » (R5, Q27)', () => {
  const { reading } = cardOf(treatment([bravecto]), '2026-10-24')
  const NOV_1: Due = { settingId: 'p-1', dueOn: '2026-11-01', dueTime: null }
  const texts = (answer: 'extra' | 'replaces' | null, shifts = false) => {
    const question = extraQuestion(t, reading, NOV_1, '2026-10-24', false, answer, shifts)!
    return {
      title: question.title,
      options: question.options.map(({ value, label }) => [value, plain(label)]),
      help: question.help === null ? null : plain(question.help),
    }
  }

  it('Luna, Bravecto, le 24 oct. : deux choix, aucun préselectionné, pas d’aide sans choix', () => {
    expect(texts(null)).toEqual({
      title: 'Cette prise',
      options: [
        ['extra', 'En plus'],
        ['replaces', 'Remplace celle du 1er nov.'],
      ],
      help: null,
    })
  })

  it('l’aide dit ce que chaque réponse écrit', () => {
    expect(texts('extra').help).toBe(
      'Prise en plus le samedi 24 oct. · la prochaine dose reste le 1er nov.',
    )
    expect(texts('replaces').help).toBe(
      'Donnée le 24 oct. pour la dose du 1er nov. · prochaine dose le 1er févr. 2027',
    )
    expect(texts('replaces', true).help).toBe(
      'Donnée le 24 oct. pour la dose du 1er nov. · prochaine dose le 24 janv. 2027',
    )
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')
    expect(texts('replaces')).toEqual({
      title: 'This dose',
      options: [
        ['extra', 'Extra dose'],
        ['replaces', 'Replaces the one due Nov 1'],
      ],
      help: 'Given on Oct 24 for the dose due Nov 1 · next dose due Feb 1, 2027',
    })
    expect(texts('extra').help).toBe('Extra dose on Saturday, Oct 24 · next dose still due Nov 1')
  })

  it('à plusieurs heures, l’échéance se nomme jour et heure', () => {
    const several = treatmentReadingOf(
      treatment([milbemax('2026-11-01', ['08:00', '20:00'])]),
      '2026-10-24',
    )
    const due: Due = { settingId: 'p-1', dueOn: '2026-11-01', dueTime: '08:00' }
    const question = extraQuestion(t, several, due, '2026-10-24', true, null, false)!
    expect(plain(question.options[1].label)).toBe('Remplace celle du 1er nov. à 8 h')
  })

  it('« Enregistrer » attend la réponse ; « Remplace » enregistre la dose de la carte', () => {
    const shown = { shown: false, help: null }
    expect(otherDateNote(NOV_1, '2026-10-24', shown, true, null)).toBeNull()
    expect(otherDateNote(NOV_1, '2026-10-24', shown, true, 'replaces')).toEqual({
      kind: 'note',
      due: NOV_1,
      status: 'given',
      givenOn: '2026-10-24',
      shiftsFollowing: false,
      answer: 'replaces',
    })
  })
})

describe('« C’est fait » de la carte quand la prise serait en plus (Q27, Q29)', () => {
  it('ouvre la feuille au lieu d’écrire', () => {
    const book = treatment(
      [milbemax('2026-10-17')],
      [
        dose('2026-10-17', '2026-10-24', { dueTime: '09:00' }),
        dose('2026-10-24', '2026-10-31', { dueTime: '09:00' }),
      ],
    )
    const reading = treatmentReadingOf(book, '2026-10-24')
    const [due] = reading.view.currentDoses
    expect(cardDone(reading, due!, '2026-10-24')).toEqual({ ask: true })
  })

  it('la dose du jour se note d’un tap, comme avant', () => {
    const reading = treatmentReadingOf(treatment([milbemax('2026-10-17')]), '2026-10-24')
    const due = reading.view.currentDoses.find(({ dueOn }) => dueOn === '2026-10-24')!
    expect(cardDone(reading, due, '2026-10-24')).toMatchObject({ confirm: false })
  })
})
