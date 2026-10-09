import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import { plainStopPrompt, stopDues, stopPrompt, stoppedText } from '../logic/treatment-stop'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

function prompt(book: TreatmentWithHistory, today: string) {
  return plain(stopPrompt(t, book, treatmentScheduleOf(book, today), today))
}

/** Planche A · V6 : quotidien, dernière prise le 2 sept., ouvert le 28. */
const PANACUR = {
  ...treatment([period()], [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]),
  name: 'Panacur',
}
const HEBDO = treatment(
  [
    period({
      frequency: { value: 1, unit: 'week' },
      startsOn: '2026-09-07',
      firstDueOn: '2026-09-07',
    }),
  ],
  [dose('2026-09-07', '2026-09-14')],
)

afterEach(() => applyLocale('fr'))

describe('stopPrompt — des doses à renseigner (planche A · V6)', () => {
  it('annonce les doses, la dose du jour non notée et les quatre gestes', () => {
    const { title, text, todayNote, dues, actions, stopOnly, cancel } = prompt(
      PANACUR,
      '2026-09-28',
    )

    expect(title).toBe('Arrêter Panacur ?')
    expect(text).toBe(
      '25 doses, du 3 au 27 sept., ne sont pas renseignées. Tu peux les noter avant d’arrêter.',
    )
    expect(todayNote).toBe(
      'La dose d’aujourd’hui n’est pas notée : si tu l’as donnée, touche « C’est fait » avant d’arrêter.',
    )
    expect(dues).toHaveLength(25)
    expect(actions.map(({ id, text: label }) => [id, label])).toEqual([
      ['all-given', 'Toutes données'],
      ['choose-days', 'Choisir les jours'],
    ])
    expect(actions.map(({ label }) => label)).toEqual([
      'Noter les 25 doses comme données, du 3 au 27 sept., puis arrêter Panacur',
      'Choisir les jours où Panacur a été donné, puis arrêter',
    ])
    expect(stopOnly).toEqual({
      text: 'Arrêter sans renseigner',
      label: 'Arrêter Panacur sans renseigner les 25 doses',
    })
    expect(cancel).toEqual({ text: 'Annuler', label: 'Annuler, garder Panacur' })
  })

  it('compte la dose en retard avec les doses non renseignées, sans dose du jour', () => {
    const { text, todayNote, dues } = prompt(HEBDO, '2026-09-23')

    expect(dues.map(({ dueOn }) => dueOn)).toEqual(['2026-09-14', '2026-09-21'])
    expect(text).toBe(
      '2 doses, 14 et 21 sept., ne sont pas renseignées. Tu peux les noter avant d’arrêter.',
    )
    expect(todayNote).toBeNull()
  })

  it('pour une seule dose, propose « Donnée » et « Oubliée »', () => {
    const { text, actions, stopOnly } = prompt(HEBDO, '2026-09-15')

    expect(text).toBe('La dose du 14 sept. n’est pas renseignée. Tu peux la noter avant d’arrêter.')
    expect(actions.map(({ id, text: label, label: aria }) => [id, label, aria])).toEqual([
      ['given', 'Donnée', 'Noter la dose du 14 sept. comme donnée, puis arrêter Métacam'],
      ['missed', 'Oubliée', 'Noter la dose du 14 sept. comme oubliée, puis arrêter Métacam'],
    ])
    expect(stopOnly.label).toBe('Arrêter Métacam sans renseigner la dose')
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    const { text, todayNote, stopOnly } = prompt(PANACUR, '2026-09-28')

    expect(text).toBe('25 doses, Sep 3 – Sep 27, are not logged. You can log them before stopping.')
    expect(todayNote).toBe('Today’s dose isn’t logged: if you gave it, tap “Done” before stopping.')
    expect(stopOnly.text).toBe('Stop without logging')
  })
})

describe('stopPrompt — rien à renseigner (planche A · V6 bis)', () => {
  it('confirme simplement, au nom du traitement', () => {
    const { text, todayNote, dues, actions, stopOnly } = prompt(HEBDO, '2026-09-10')

    expect(dues).toEqual([])
    expect(actions).toEqual([])
    expect(text).toBe('Plus aucun rappel pour Métacam. Ses prises restent dans le carnet.')
    expect(todayNote).toBeNull()
    expect(stopOnly).toEqual({ text: 'Arrêter', label: 'Arrêter le traitement Métacam' })
  })

  it('signale quand même la dose du jour non notée', () => {
    const { dues, todayNote } = prompt(HEBDO, '2026-09-14')

    expect(dues).toEqual([])
    expect(todayNote).toContain('La dose d’aujourd’hui n’est pas notée')
  })
})

describe('plainStopPrompt — traitement illisible', () => {
  it('confirme simplement, sans dose ni note du jour', () => {
    const { title, text, todayNote, dues, when, actions, stopOnly } = plain(
      plainStopPrompt(t, 'Bravecto'),
    )

    expect(title).toBe('Arrêter Bravecto ?')
    expect(text).toBe('Plus aucun rappel pour Bravecto. Ses prises restent dans le carnet.')
    expect(todayNote).toBeNull()
    expect(dues).toEqual([])
    expect(when).toBe('')
    expect(actions).toEqual([])
    expect(stopOnly).toEqual({ text: 'Arrêter', label: 'Arrêter le traitement Bravecto' })
  })
})

describe('stopDues', () => {
  it('ne compte jamais la dose du jour ni la prochaine', () => {
    expect(stopDues(treatmentScheduleOf(HEBDO, '2026-09-14'))).toEqual([])
    expect(stopDues(treatmentScheduleOf(HEBDO, '2026-09-10'))).toEqual([])
  })
})

describe('stoppedText (TR-31)', () => {
  it('dit où retrouver le traitement quand il ne reste rien à renseigner', () => {
    expect(stoppedText(t, 'Panacur', true)).toBe(
      'Panacur arrêté, à retrouver dans Traitements terminés.',
    )
    expect(stoppedText(t, 'Panacur', false)).toBe('Panacur arrêté')
  })
})
