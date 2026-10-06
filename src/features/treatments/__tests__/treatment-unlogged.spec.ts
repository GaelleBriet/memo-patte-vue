import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import { doseCard } from '../logic/treatment-card'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  pastDosesOf,
  pastDosesPrompt,
  pastDosesResult,
  promptChoice,
  unloggedBanner,
  unloggedWhen,
} from '../logic/treatment-unlogged'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-09-28'
const PANACUR = {
  ...treatment([period()], [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]),
  name: 'Panacur',
}
const HEBDO = period({ frequency: { value: 1, unit: 'week' } })

function banner(history: TreatmentWithHistory, today = TODAY) {
  return plain(unloggedBanner(t, history, treatmentScheduleOf(history, today), today))
}

afterEach(() => applyLocale('fr'))

describe('unloggedBanner (TR-15)', () => {
  it('annonce les doses non renseignées et leur plage, avec deux gestes à égalité', () => {
    expect(banner(PANACUR)).toMatchObject({
      title: '25 doses non renseignées',
      subtitle: 'du 3 au 27 sept.',
      note: 'Indique si elles ont été données.',
      when: 'du 3 au 27 sept.',
      actions: [
        {
          id: 'all-given',
          text: 'Toutes données',
          icon: 'ms:done_all',
          label: 'Noter les 25 doses comme données, du 3 au 27 sept.',
        },
        {
          id: 'choose-days',
          text: 'Choisir les jours',
          icon: 'ms:calendar_month',
          label: 'Choisir les jours où Panacur a été donné, du 3 au 27 sept.',
        },
      ],
    })
    expect(banner(PANACUR)?.dues).toHaveLength(25)
  })

  it('TR-37 : aucun bandeau pour un animal qu’on ne suit plus', () => {
    const schedule = treatmentScheduleOf(PANACUR, TODAY)

    expect(unloggedBanner(t, PANACUR, schedule, TODAY, { followed: false })).toBeNull()
  })

  it('cite les jours quand il y en a trois au plus', () => {
    const history = treatment([HEBDO], [dose('2026-09-01', '2026-09-08')])

    expect(banner(history)).toMatchObject({
      title: '2 doses non renseignées',
      subtitle: '8 et 15 sept.',
    })
  })

  it('propose « Donnée » et « Oubliée » pour une seule dose', () => {
    const history = treatment([period({ startsOn: '2026-09-27', firstDueOn: '2026-09-27' })])

    expect(banner(history)).toMatchObject({
      title: '1 dose non renseignée',
      subtitle: '27 sept.',
      note: 'Indique si elle a été donnée.',
      dues: [{ periodId: 'p-1', dueOn: '2026-09-27', dueTime: null }],
      actions: [
        {
          id: 'given',
          text: 'Donnée',
          icon: 'ms:check',
          label: 'Noter la dose du 27 sept. comme donnée',
        },
        {
          id: 'missed',
          text: 'Oubliée',
          icon: 'ms:close',
          label: 'Noter la dose du 27 sept. comme oubliée',
        },
      ],
    })
  })

  it('dit l’heure d’une seule dose à plusieurs heures', () => {
    const history = treatment(
      [period({ startsOn: '2026-09-27', firstDueOn: '2026-09-27', times: ['08:00', '20:00'] })],
      [dose('2026-09-27', '2026-09-27', { dueTime: '08:00' })],
    )

    expect(banner(history)).toMatchObject({
      subtitle: '27 sept. à 20 h',
      actions: [{ label: 'Noter la dose du 27 sept. à 20 h comme donnée' }, { id: 'missed' }],
    })
  })

  it('compte les doses, pas les jours, à plusieurs heures', () => {
    const history = treatment([period({ times: ['08:00', '20:00'] })])

    expect(banner(history, '2026-09-04')).toMatchObject({
      title: '6 doses non renseignées',
      subtitle: '1er, 2 et 3 sept.',
    })
  })

  it('écrit l’année quand la plage sort de l’année en cours', () => {
    const history = treatment([period({ startsOn: '2025-12-20', firstDueOn: '2025-12-20' })])

    expect(banner(history, '2026-01-05')?.when).toBe('du 20 déc. 2025 au 4 janv. 2026')
    expect(banner(history, '2025-12-22')?.when).toBe('20 et 21 déc.')
    expect(
      banner(
        { ...history, periods: [{ ...history.periods[0]!, endsOn: '2025-12-21' }] },
        '2026-01-05',
      )?.when,
    ).toBe('du 20 déc. 2025 au 21 déc. 2025')
  })

  it('n’existe pas sans dose non renseignée', () => {
    const history = treatment([period({ startsOn: TODAY, firstDueOn: TODAY })])

    expect(banner(history)).toBeNull()
  })

  it.each([
    ['arrêté', period({ stoppedOn: '2026-09-20' })],
    ['fini', period({ endsOn: '2026-09-10' })],
  ])('reste sur un traitement %s', (_, closed) => {
    const history = treatment([closed], [dose('2026-09-01', '2026-09-02')])

    expect(banner(history)?.dues.length).toBeGreaterThan(0)
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(banner(PANACUR)).toMatchObject({
      title: '25 doses not logged',
      subtitle: 'Sep 3 – Sep 27',
      note: 'Tell us whether they were given.',
    })
  })
})

describe('une dose non renseignée n’est jamais un retard (TR-14)', () => {
  it('la carte reste « Dose du jour », sans retard, avec 25 doses non renseignées', () => {
    const schedule = treatmentScheduleOf(PANACUR, TODAY)
    const card = doseCard(t, PANACUR, schedule, { animal: 'Milo', today: TODAY })

    expect(schedule.phase).toBe('today')
    expect(card.entries.map(({ overdue }) => overdue)).toEqual([false])
    expect(schedule.unloggedDoses).toHaveLength(25)
  })

  it('en retard, la carte ne compte que la dose du moment', () => {
    const history = treatment([HEBDO], [dose('2026-09-01', '2026-09-08')])
    const schedule = treatmentScheduleOf(history, '2026-09-24')
    const card = doseCard(t, history, schedule, { animal: 'Milo', today: '2026-09-24' })

    expect(card.entries).toHaveLength(1)
    expect(card.entries[0]).toMatchObject({ overdue: true, due: { dueOn: '2026-09-22' } })
    expect(schedule.unloggedDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-09-08', '2026-09-15'])
  })
})

describe('unloggedWhen', () => {
  it('rend une chaîne vide sans dose', () => {
    expect(unloggedWhen(t, [], TODAY)).toBe('')
  })
})

describe('promptChoice', () => {
  const dues = [
    { periodId: 'p-1', dueOn: '2026-09-03', dueTime: null },
    { periodId: 'p-1', dueOn: '2026-09-04', dueTime: null },
  ]

  it('répond pour toutes les doses d’un coup', () => {
    expect(promptChoice('all-given', dues)).toEqual({ given: dues, missed: [] })
    expect(promptChoice('given', dues.slice(0, 1))).toEqual({ given: [dues[0]], missed: [] })
    expect(promptChoice('missed', dues.slice(0, 1))).toEqual({ given: [], missed: [dues[0]] })
  })
})

describe('pastDosesPrompt — l’encart du formulaire de création (TR-3)', () => {
  const draft = (dueOn: string, dueTime: string | null = null) => ({
    periodId: 'draft',
    dueOn,
    dueTime,
  })
  const SEPTEMBRE = Array.from({ length: 25 }, (_, index) =>
    draft(`2026-09-${String(index + 3).padStart(2, '0')}`),
  )
  const prompt = (dues: ReturnType<typeof draft>[], severalTimes = false) =>
    plain(pastDosesPrompt(t, dues, TODAY, severalTimes))

  it('annonce les échéances passées et pose la question', () => {
    expect(prompt(SEPTEMBRE)).toMatchObject({
      title: '25 doses prévues depuis le 3 sept.',
      subtitle: 'Ont-elles été données ?',
      note: 'Facultatif. Tu pourras aussi le faire depuis la fiche.',
      when: 'du 3 au 27 sept.',
      actions: [
        { id: 'all-given', label: 'Noter les 25 doses comme données, du 3 au 27 sept.' },
        {
          id: 'choose-days',
          label: 'Choisir les jours où la dose a été donnée, du 3 au 27 sept.',
        },
      ],
    })
  })

  it('propose « Donnée » et « Oubliée » pour une seule dose', () => {
    expect(prompt([draft('2026-09-27')])).toMatchObject({
      title: '1 dose prévue le 27 sept.',
      subtitle: 'A-t-elle été donnée ?',
      note: 'Facultatif. Tu pourras aussi le faire depuis la fiche.',
      actions: [{ id: 'given' }, { id: 'missed' }],
    })
    expect(prompt([draft('2026-09-27', '20:00')], true)?.title).toBe(
      '1 dose prévue le 27 sept. à 20 h',
    )
  })

  it('n’existe pas sans échéance passée', () => {
    expect(prompt([])).toBeNull()
  })

  it('résume la réponse, « Modifier » à côté', () => {
    const [first, second, ...rest] = SEPTEMBRE

    expect(plain(pastDosesResult(t, { given: SEPTEMBRE, missed: [] }))).toEqual({
      text: '25 données',
      edit: 'Modifier',
      editLabel: 'Modifier les jours choisis',
    })
    expect(plain(pastDosesResult(t, { given: rest, missed: [first!, second!] })).text).toBe(
      '23 données, 2 oubliées',
    )
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(prompt(SEPTEMBRE)).toMatchObject({
      title: '25 doses scheduled since Sep 3',
      subtitle: 'Were they given?',
    })
    expect(
      pastDosesResult(t, { given: SEPTEMBRE.slice(5), missed: SEPTEMBRE.slice(0, 5) }),
    ).toEqual({ text: '20 given, 5 missed', edit: 'Change', editLabel: 'Change the chosen days' })
  })

  it('rend à la création les doses de la réponse, sans leur période de brouillon', () => {
    expect(
      pastDosesOf({ given: [draft('2026-09-03')], missed: [draft('2026-09-04', '08:00')] }),
    ).toEqual([
      { dueOn: '2026-09-03', dueTime: null, status: 'given' },
      { dueOn: '2026-09-04', dueTime: '08:00', status: 'missed' },
    ])
  })
})
