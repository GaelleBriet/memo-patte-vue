import { afterEach, describe, expect, it } from 'vitest'

import { plain } from './treatment-fixtures'
import {
  choiceGestures,
  choiceOf,
  choiceSummary,
  chooseDays,
  chooseDaysSubtitle,
  dayKey,
  toggledDay,
  withDays,
} from '../logic/treatment-choose-days'
import i18n, { applyLocale } from '@/core/i18n'
import { days } from '@/shared/__tests__/treatment-schedule-fixtures'
import type { Due } from '@/shared/domain/treatment-schedule'

const t = i18n.global.t
const WHEN = 'du 3 au 27 sept.'

function dues(
  from: string,
  to: string,
  times: (string | null)[] = [null],
  periodId = 'p-1',
): Due[] {
  return days(from, to).flatMap((dueOn) => times.map((dueTime) => ({ periodId, dueOn, dueTime })))
}

const SEPTEMBRE = dues('2026-09-03', '2026-09-27')
const MATIN_ET_SOIR = dues('2026-09-03', '2026-09-27', ['08:00', '20:00'])

function model(all: Due[], unchecked: Iterable<string> = []) {
  return plain(chooseDays(t, all, new Set(unchecked), WHEN))
}

function keys(all: Due[], ...dueOns: string[]): string[] {
  return all.filter(({ dueOn }) => dueOns.includes(dueOn)).map(dayKey)
}

afterEach(() => applyLocale('fr'))

describe('chooseDays — un calendrier par mois (TR-16)', () => {
  it('s’ouvre tout coché et annonce le total', () => {
    const { tabs, hasTabs, help, weekdays, submit, submitLabel } = model(SEPTEMBRE)

    expect(hasTabs).toBe(false)
    expect(tabs).toHaveLength(1)
    expect(help).toBe('Coche les prises données. Les cases décochées seront notées « oubliée ».')
    expect(weekdays).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
    expect(submit).toBe('Valider : 25 données, 0 oubliée')
    expect(submitLabel).toBe('Valider : 25 prises données et 0 oubliées, du 3 au 27 sept.')
    expect(tabs[0]?.months).toHaveLength(1)
  })

  it('pose chaque jour du mois sous son jour de semaine, les jours sans dose inertes', () => {
    const [month] = model(SEPTEMBRE, keys(SEPTEMBRE, '2026-09-05')).tabs[0]!.months

    expect(month).toMatchObject({ title: 'septembre 2026', count: '25 jours', blanks: 1 })
    expect(month?.cells).toHaveLength(30)
    expect(month?.cells[0]).toEqual({ day: 1, due: null })
    expect(month?.cells[2]).toMatchObject({
      day: 3,
      due: SEPTEMBRE[0],
      checked: true,
      label: '3 septembre, donnée',
    })
    expect(month?.cells[4]).toMatchObject({ day: 5, checked: false, label: '5 septembre, oubliée' })
    expect(month?.cells[27]).toEqual({ day: 28, due: null })
  })

  it('compte les oubliées dans le bouton', () => {
    const unchecked = keys(
      SEPTEMBRE,
      '2026-09-05',
      '2026-09-06',
      '2026-09-12',
      '2026-09-13',
      '2026-09-20',
    )

    expect(model(SEPTEMBRE, unchecked).submit).toBe('Valider : 20 données, 5 oubliées')
    expect(model(SEPTEMBRE, unchecked.slice(0, 1)).submit).toBe('Valider : 24 données, 1 oubliée')
    expect(model(SEPTEMBRE, SEPTEMBRE.map(dayKey)).submit).toBe('Valider : 0 donnée, 25 oubliées')
  })

  it('découpe par mois, chacun avec « Cocher / Décocher le mois »', () => {
    const all = dues('2026-08-20', '2026-09-27')
    const [august, september] = model(all, keys(all, '2026-08-21')).tabs[0]!.months

    expect(august).toMatchObject({
      title: 'août 2026',
      count: '12 jours',
      blanks: 5,
      toggle: { checks: true, text: 'Cocher le mois', label: 'Cocher août 2026' },
    })
    expect(september).toMatchObject({
      title: 'septembre 2026',
      count: '27 jours',
      toggle: { checks: false, text: 'Décocher le mois', label: 'Décocher septembre 2026' },
    })
    expect(august?.dues).toHaveLength(12)
  })

  it('ne propose pas de bouton par mois quand il n’y en a qu’un', () => {
    expect(model(SEPTEMBRE).tabs[0]?.months[0]?.toggle).toBeNull()
  })

  it('saute les mois sans dose', () => {
    const quarterly: Due[] = ['2026-01-10', '2026-04-10', '2026-07-10'].map((dueOn) => ({
      periodId: 'p-1',
      dueOn,
      dueTime: null,
    }))

    expect(model(quarterly).tabs[0]?.months.map(({ title }) => title)).toEqual([
      'janvier 2026',
      'avril 2026',
      'juillet 2026',
    ])
  })
})

describe('chooseDays — un calendrier par heure, en onglets (Q5)', () => {
  it('ouvre un onglet par heure, chacun tout coché', () => {
    const { tabs, hasTabs, help, submit } = model(MATIN_ET_SOIR)

    expect(hasTabs).toBe(true)
    expect(help).toBe(
      'Coche les prises données, heure par heure. Les cases décochées seront notées « oubliée ».',
    )
    expect(tabs.map(({ id, title, state, label }) => ({ id, title, state, label }))).toEqual([
      { id: '08:00', title: '8 h', state: 'tout coché', label: 'Prises de 8 h, toutes données' },
      { id: '20:00', title: '20 h', state: 'tout coché', label: 'Prises de 20 h, toutes données' },
    ])
    expect(tabs[0]?.months[0]?.count).toBe('25 jours · 8 h')
    expect(submit).toBe('Valider : 50 données, 0 oubliée')
  })

  it('compte les oubliées de chaque onglet, et le total des deux', () => {
    const morning = MATIN_ET_SOIR.filter(({ dueTime }) => dueTime === '08:00')
    const evening = MATIN_ET_SOIR.filter(({ dueTime }) => dueTime === '20:00')
    const unchecked = [
      ...keys(morning, '2026-09-05', '2026-09-06'),
      ...keys(evening, '2026-09-10', '2026-09-11', '2026-09-12'),
    ]

    const { tabs, submit, submitLabel } = model(MATIN_ET_SOIR, unchecked)

    expect(tabs.map(({ state }) => state)).toEqual(['2 oubliées', '3 oubliées'])
    expect(tabs[0]?.label).toBe('Prises de 8 h, 2 oubliées')
    expect(tabs[0]?.months[0]?.cells[4]).toMatchObject({ label: '5 septembre à 8 h, oubliée' })
    expect(tabs[1]?.months[0]?.cells[4]).toMatchObject({ label: '5 septembre à 20 h, donnée' })
    expect(submit).toBe('Valider : 45 données, 5 oubliées')
    expect(submitLabel).toBe('Valider : 45 prises données et 5 oubliées, du 3 au 27 sept.')
  })

  it('nomme « Tout cocher / Tout décocher » pour l’onglet', () => {
    const { tabs } = model(MATIN_ET_SOIR)

    expect(tabs[1]).toMatchObject({
      checkAllLabel: 'Marquer les 25 prises de 20 h comme données',
      uncheckAllLabel: 'Marquer les 25 prises de 20 h comme oubliées',
    })
    expect(model(SEPTEMBRE).tabs[0]).toMatchObject({
      checkAllLabel: 'Marquer les 25 prises comme données',
      uncheckAllLabel: 'Marquer les 25 prises comme oubliées',
    })
  })

  it('range dans un onglet à part les doses d’une période sans heure', () => {
    const all = [
      ...dues('2026-09-01', '2026-09-03', [null]),
      ...dues('2026-09-04', '2026-09-06', ['08:00', '20:00'], 'p-2'),
    ]

    expect(model(all).tabs.map(({ title }) => title)).toEqual(['Sans heure', '8 h', '20 h'])
  })
})

describe('cocher et décocher', () => {
  it('décoche un jour, puis le recoche', () => {
    const [first] = SEPTEMBRE as [Due]

    const once = toggledDay(new Set(), first)
    const twice = toggledDay(once, first)

    expect([...once]).toEqual([dayKey(first)])
    expect([...twice]).toEqual([])
  })

  it('coche ou décoche un mois sans toucher aux autres', () => {
    const all = dues('2026-08-30', '2026-09-02')
    const august = all.slice(0, 2)

    const unchecked = withDays(new Set([dayKey(all[3]!)]), august, false)

    expect([...unchecked].sort()).toEqual(
      [all[0], all[1], all[3]].map((due) => dayKey(due!)).sort(),
    )
    expect([...withDays(unchecked, august, true)]).toEqual([dayKey(all[3]!)])
  })
})

describe('choiceOf — ce que le choix écrit', () => {
  it('sépare les données des oubliées, et note une donnée au jour de son échéance', () => {
    const all = dues('2026-09-03', '2026-09-05')
    const choice = choiceOf(all, new Set([dayKey(all[1]!)]))

    expect(choice).toEqual({ given: [all[0], all[2]], missed: [all[1]] })
    expect(choiceGestures(choice)).toEqual([
      { kind: 'given', due: all[0], givenOn: '2026-09-03' },
      { kind: 'given', due: all[2], givenOn: '2026-09-05' },
      { kind: 'missed', due: all[1] },
    ])
  })

  it('ignore une case décochée qui n’est plus dans la liste', () => {
    const all = dues('2026-09-03', '2026-09-04')

    expect(choiceOf(all, new Set(['p-1 2026-08-01 '])).missed).toEqual([])
  })
})

describe('choiceSummary — le résumé d’un choix (TR-3)', () => {
  it('ne cite que ce qui a été choisi', () => {
    const summary = (given: number, missed: number) => plain(choiceSummary(t, given, missed))

    expect(summary(25, 0)).toBe('25 données')
    expect(summary(20, 5)).toBe('20 données, 5 oubliées')
    expect(summary(1, 0)).toBe('1 donnée')
    expect(summary(0, 1)).toBe('1 oubliée')
  })
})

describe('chooseDaysSubtitle', () => {
  it('nomme le traitement, l’animal et les jours, sans ce qui manque', () => {
    expect(chooseDaysSubtitle('Métacam', 'Luna', WHEN)).toBe('Métacam · Luna · du 3 au 27 sept.')
    expect(chooseDaysSubtitle('  ', 'Milo', WHEN)).toBe('Milo · du 3 au 27 sept.')
    expect(chooseDaysSubtitle(null, null, WHEN)).toBe('du 3 au 27 sept.')
  })
})

describe('en anglais', () => {
  it('commence la semaine le dimanche et suit le glossaire', () => {
    applyLocale('en')

    const { tabs, weekdays, submit } = model(MATIN_ET_SOIR, keys(MATIN_ET_SOIR, '2026-09-05'))

    expect(weekdays[0]).toBe('S')
    expect(tabs[0]?.months[0]).toMatchObject({ title: 'September 2026', blanks: 2 })
    expect(tabs.map(({ title }) => title)).toEqual(['8 am', '8 pm'])
    expect(submit).toBe('Confirm: 48 given, 2 missed')
  })
})
