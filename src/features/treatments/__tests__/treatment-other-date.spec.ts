import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import { givenDueDays, hourChoices, otherDateTexts } from '../logic/treatment-other-date'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const MATIN_ET_SOIR = period({ times: ['20:00', '08:00'] })

afterEach(() => applyLocale('fr'))

describe('hourChoices — « À quelle heure ? » (planche A · V3 ter ter)', () => {
  it('propose chaque heure du jour, dans l’ordre, avec l’échéance qu’elle vise', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-27', '2026-09-28', { dueTime: '20:00' })],
    )
    const schedule = treatmentScheduleOf(book, '2026-09-28')

    expect(plain(hourChoices(t, schedule, MATIN_ET_SOIR, '2026-09-28'))).toEqual([
      {
        time: '08:00',
        label: '8 h',
        detail: 'Dose de 8 h · pas encore notée',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' },
      },
      {
        time: '20:00',
        label: '20 h',
        detail: 'Dose de 20 h · pas encore notée',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' },
      },
    ])
  })

  it('ne propose pas de noter une heure déjà donnée ce jour-là (TR-21)', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [
        dose('2026-09-27', '2026-09-27', { dueTime: '08:00' }),
        missed('2026-09-27', '2026-09-28', { dueTime: '20:00' }),
      ],
    )
    const schedule = treatmentScheduleOf(book, '2026-09-28')

    expect(plain(hourChoices(t, schedule, MATIN_ET_SOIR, '2026-09-27'))).toEqual([
      { time: '08:00', label: '8 h', detail: 'Dose de 8 h · déjà notée', due: null },
      {
        time: '20:00',
        label: '20 h',
        detail: 'Dose de 20 h · notée oubliée',
        due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' },
      },
    ])
  })

  it('vise une dose non renseignée d’un jour passé', () => {
    const book = treatment([MATIN_ET_SOIR])
    const schedule = treatmentScheduleOf(book, '2026-09-03')

    expect(hourChoices(t, schedule, MATIN_ET_SOIR, '2026-09-01').map(({ due }) => due)).toEqual([
      { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
      { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' },
    ])
  })
})

describe('givenDueDays', () => {
  it('rend les jours dont l’échéance est déjà donnée : une autre prise ne s’y note pas', () => {
    const book = treatment(
      [period()],
      [
        dose('2026-09-01', '2026-09-02'),
        missed('2026-09-02', '2026-09-03'),
        dose('2026-09-03', '2026-09-04', { givenOn: '2026-09-04' }),
      ],
    )

    expect(givenDueDays(treatmentScheduleOf(book, '2026-09-04'))).toEqual([
      '2026-09-01',
      '2026-09-03',
    ])
  })
})

describe('otherDateTexts', () => {
  const NAMED = { name: 'Métacam', animal: 'Luna', today: '2026-09-28' }

  it('annonce le jour choisi sur le bouton, ou « Suivant » à plusieurs heures', () => {
    expect(otherDateTexts(t, NAMED, '2026-09-26', false).submit).toBe('Noter la prise du 26 sept.')
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
