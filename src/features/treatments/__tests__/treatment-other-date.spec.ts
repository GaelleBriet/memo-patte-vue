import { afterEach, describe, expect, it } from 'vitest'

import { dose, extra, missed, period, plain, shifted, treatment } from './treatment-fixtures'
import { givenDays, momentDue, notifiedDue, otherDateTexts } from '../logic/treatment-other-date'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const MATIN_ET_SOIR = period({ times: ['20:00', '08:00'] })

afterEach(() => applyLocale('fr'))

describe('givenDays', () => {
  it('rend les jours dont toutes les échéances sont données', () => {
    const book = treatment(
      [period()],
      [
        dose('2026-09-01', '2026-09-02'),
        missed('2026-09-02', '2026-09-03'),
        dose('2026-09-03', '2026-09-04', { givenOn: '2026-09-04' }),
      ],
    )

    expect(givenDays(treatmentReadingOf(book, '2026-09-04').view)).toEqual([
      '2026-09-01',
      '2026-09-03',
    ])
  })

  it('rend aussi le jour d’une prise en plus, même sans échéance ce jour-là', () => {
    const hebdo = period({
      frequency: { value: 1, unit: 'week' },
      startsOn: '2026-10-16',
      firstDueOn: '2026-10-16',
    })
    const book = treatment([hebdo], [extra('2026-10-09', '2026-10-16')])

    expect(givenDays(treatmentReadingOf(book, '2026-10-10').view)).toEqual(['2026-10-09'])
  })

  it('garde un jour d’une ancienne période à plusieurs heures dont une seule est donnée', () => {
    const book = treatment(
      [
        period({ times: ['08:00', '20:00'] }),
        period({
          id: 'p-2',
          startsOn: '2026-09-03',
          firstDueOn: '2026-09-03',
          times: ['09:00'],
          createdAt: '2026-09-03T08:00:00.000Z',
        }),
      ],
      [
        dose('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        dose('2026-09-02', '2026-09-02', { dueTime: '08:00' }),
        dose('2026-09-02', '2026-09-03', { dueTime: '20:00' }),
      ],
    )

    expect(givenDays(treatmentReadingOf(book, '2026-09-04').view)).toEqual(['2026-09-02'])
  })
})

describe('momentDue — ce que notent la feuille « À faire » et une notification', () => {
  const due = (book: TreatmentWithPeriods, today: string, givenOn = today) =>
    momentDue(treatmentReadingOf(book, today), givenOn, today)

  it('à plusieurs heures, la première heure du jour encore sans prise', () => {
    const book = treatment([MATIN_ET_SOIR])

    expect(due(book, '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
    })
    expect(
      due(
        treatment([MATIN_ET_SOIR], [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })]),
        '2026-09-01',
      ),
    ).toEqual({ due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' } })
  })

  it('aujourd’hui, ne vise que des échéances sans prise : une oubliée ne repasse jamais en donnée', () => {
    const matinOublie = treatment(
      [MATIN_ET_SOIR],
      [missed('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )
    const soirDonne = treatment(
      [MATIN_ET_SOIR],
      [
        missed('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        dose('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )
    const toutOublie = treatment(
      [MATIN_ET_SOIR],
      [
        missed('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        missed('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )

    expect(due(matinOublie, '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' },
    })
    expect(due(soirDonne, '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
    expect(due(toutOublie, '2026-09-01')).toEqual({ dayNoted: true })
  })

  it('un autre jour, choisi dans la feuille, un oubli repasse en donnée (TR-22)', () => {
    const oublie = treatment([period()], [missed('2026-09-01', '2026-09-02')])

    expect(due(oublie, '2026-09-03', '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: null },
    })
  })

  it('la dose en retard, pas le jour de la prise', () => {
    const hebdo = treatment([
      period({
        frequency: { value: 1, unit: 'week' },
        startsOn: '2026-09-25',
        firstDueOn: '2026-09-25',
      }),
    ])

    expect(due(hebdo, '2026-10-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-25', dueTime: null },
    })
  })

  it('dit « déjà notée » quand tout le jour est donné, sans viser la dose suivante', () => {
    const book = treatment([period()], [dose('2026-09-01', '2026-09-02')])

    expect(due(book, '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
    expect(due(book, '2026-09-02', '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
  })

  it('une autre date vise la première échéance sans prise de ce jour, sinon la règle sans heure', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-01', '2026-09-02', { dueTime: '20:00' })],
    )

    expect(due(book, '2026-09-03', '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
    })
  })

  it('ne note pas la dose suivante en avance quand une prise a déjà été donnée aujourd’hui', () => {
    const hebdo = treatment(
      [
        period({
          frequency: { value: 1, unit: 'week' },
          startsOn: '2026-09-25',
          firstDueOn: '2026-09-25',
        }),
      ],
      [
        dose('2026-09-25', '2026-10-08', { givenOn: '2026-10-01' }),
        shifted('2026-09-25', '2026-10-01'),
      ],
    )

    expect(due(hebdo, '2026-10-01')).toEqual({ alreadyGivenOn: '2026-10-01' })
    expect(due(hebdo, '2026-10-02')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-10-08', dueTime: null },
    })
  })

  it('après une prise en plus du jour, dit « déjà notée » au lieu de noter la dose suivante', () => {
    const hebdo = treatment(
      [
        period({
          frequency: { value: 1, unit: 'week' },
          startsOn: '2026-10-16',
          firstDueOn: '2026-10-16',
        }),
      ],
      [extra('2026-10-09', '2026-10-16')],
    )

    expect(due(hebdo, '2026-10-09')).toEqual({ alreadyGivenOn: '2026-10-09' })
  })

  it('ne vise rien pour un traitement fini', () => {
    const fini = treatment([period({ stoppedOn: '2026-09-01' })])

    expect(due(fini, '2026-09-05')).toBeNull()
  })
})

describe('notifiedDue — ce que note « C’est fait » d’une notification, garde par garde', () => {
  const HEBDO = period({ frequency: { value: 1, unit: 'week' } })
  const target = (book: TreatmentWithPeriods, today: string, notifiedDueOn: string) =>
    notifiedDue(treatmentReadingOf(book, today), notifiedDueOn, today)

  it('1. toutes les échéances du jour notifié sont notées, une donnée : « déjà notée », à sa date', () => {
    const enAvance = treatment(
      [
        period({
          frequency: { value: 1, unit: 'month' },
          startsOn: '2026-09-05',
          firstDueOn: '2026-09-05',
        }),
      ],
      [
        dose('2026-09-05', '2026-10-05'),
        dose('2026-10-05', '2026-11-02', { givenOn: '2026-10-02' }),
      ],
    )

    expect(target(enAvance, '2026-10-02', '2026-10-05')).toEqual({ alreadyGivenOn: '2026-10-02' })
  })

  it('2. toutes notées, aucune donnée : les doses du jour sont déjà notées', () => {
    const oubliee = treatment([HEBDO], [missed('2026-09-01', '2026-09-08')])

    expect(target(oubliee, '2026-09-02', '2026-09-01')).toEqual({ dayNoted: true })
  })

  it('3. journée entamée à plusieurs heures : à la personne de choisir (Q32)', () => {
    const entamee = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )

    expect(target(entamee, '2026-09-01', '2026-09-01')).toBe('ask')
  })

  it('4. échéance notifiée sans prise qui n’est pas la dose du moment : à la personne de choisir (P1)', () => {
    const quotidien = treatment([period()])

    expect(target(quotidien, '2026-09-05', '2026-09-03')).toBe('ask')
  })

  it('5. échéance notifiée qui est la dose du moment, du jour ou en retard : notée', () => {
    expect(target(treatment([MATIN_ET_SOIR]), '2026-09-01', '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
    })
    expect(target(treatment([HEBDO]), '2026-09-04', '2026-09-01')).toEqual({
      due: { settingId: 'p-1', dueOn: '2026-09-01', dueTime: null },
    })
  })

  it('6. plus rien à noter : rien', () => {
    const fini = treatment([period({ stoppedOn: '2026-09-01' })])

    expect(target(fini, '2026-09-05', '2026-09-03')).toBeNull()
  })
})

describe('otherDateTexts', () => {
  const NAMED = { name: 'Métacam', animal: 'Luna', today: '2026-09-28' }

  it('annonce le jour choisi sur le bouton, ou « Suivant » à plusieurs heures', () => {
    expect(plain(otherDateTexts(t, NAMED, '2026-09-26', false)).submit).toBe(
      'Noter la prise du 26 sept.',
    )
    expect(otherDateTexts(t, NAMED, '2026-09-28', false).submit).toBe(
      'Noter la prise d’aujourd’hui',
    )
    expect(otherDateTexts(t, NAMED, '2026-09-26', true).submit).toBe('Suivant')
  })

  it('rappelle le traitement, l’animal et le jour', () => {
    expect(plain(otherDateTexts(t, NAMED, '2026-09-26', true))).toMatchObject({
      daySubtitle: 'Métacam · Luna',
      hourTitle: 'À quelle heure ?',
      hourSubtitle: 'Métacam · Luna · 26 sept.',
    })
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(otherDateTexts(t, NAMED, '2026-09-26', true)).toMatchObject({
      submit: 'Next',
      hourTitle: 'At what time?',
    })
  })
})
