import { afterEach, describe, expect, it } from 'vitest'

import { plain } from './treatment-fixtures'
import {
  choiceGestures,
  choiceOf,
  choiceSummary,
  chooseDaysLayout,
  chooseDaysSubtitle,
  dayKey,
  dayLabel,
  missedAmong,
  monthToggle,
  setDays,
  submitTexts,
  tabMonths,
  tabTexts,
  toggleDay,
  type ChooseDaysTab,
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

function layout(all: Due[]) {
  return plain(chooseDaysLayout(t, all))
}

function tab(all: Due[], index = 0): ChooseDaysTab {
  return chooseDaysLayout(t, all).tabs[index]!
}

function months(all: Due[], index = 0) {
  return plain(tabMonths(t, tab(all, index)))
}

function label(all: Due[], tabIndex: number, cellIndex: number, checked: boolean): string {
  const cell = tabMonths(t, tab(all, tabIndex))[0]!.cells[cellIndex]!
  if (cell.due === null) throw new Error('Jour sans dose')
  return plain(dayLabel(t, cell.date, checked))
}

function keys(all: Due[], ...dueOns: string[]): Set<string> {
  return new Set(all.filter(({ dueOn }) => dueOns.includes(dueOn)).map(dayKey))
}

function submit(all: Due[], unchecked: Set<string>) {
  return plain(submitTexts(t, all.length, missedAmong(all, unchecked), WHEN))
}

afterEach(() => applyLocale('fr'))

describe('chooseDaysLayout — un calendrier par mois (TR-16)', () => {
  it('sans heures distinctes, n’a pas d’onglets', () => {
    const { tabs, hasTabs, help, weekdays } = layout(SEPTEMBRE)

    expect(hasTabs).toBe(false)
    expect(tabs).toHaveLength(1)
    expect(help).toBe('Coche les prises données. Les cases décochées seront notées « oubliée ».')
    expect(weekdays).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
  })

  it('pose chaque jour du mois sous son jour de semaine, les jours sans dose inertes', () => {
    const [month] = months(SEPTEMBRE)

    expect(month).toMatchObject({ title: 'septembre 2026', count: '25 jours', blanks: 1 })
    expect(month?.cells).toHaveLength(30)
    expect(month?.cells[0]).toEqual({ day: 1, due: null })
    expect(month?.cells[2]).toMatchObject({ day: 3, due: SEPTEMBRE[0], date: '3 septembre' })
    expect(month?.cells[27]).toEqual({ day: 28, due: null })
  })

  it('dit l’état de chaque jour au lecteur d’écran', () => {
    expect(label(SEPTEMBRE, 0, 4, true)).toBe('5 septembre, donnée')
    expect(label(SEPTEMBRE, 0, 4, false)).toBe('5 septembre, oubliée')
  })

  it('s’ouvre tout coché, et le bouton annonce le total', () => {
    expect(submit(SEPTEMBRE, new Set())).toEqual({
      submit: 'Valider : 25 données, 0 oubliée',
      submitLabel: 'Valider : 25 données, 0 oubliée, du 3 au 27 sept.',
    })
    expect(
      submit(
        SEPTEMBRE,
        keys(SEPTEMBRE, '2026-09-05', '2026-09-06', '2026-09-12', '2026-09-13', '2026-09-20'),
      ).submit,
    ).toBe('Valider : 20 données, 5 oubliées')
    expect(submit(SEPTEMBRE, keys(SEPTEMBRE, '2026-09-05')).submit).toBe(
      'Valider : 24 données, 1 oubliée',
    )
    expect(submit(SEPTEMBRE, new Set(SEPTEMBRE.map(dayKey))).submit).toBe(
      'Valider : 0 donnée, 25 oubliées',
    )
  })

  it('ouvert depuis l’arrêt, le bouton dit qu’il arrête aussi le traitement', () => {
    const missed = keys(
      SEPTEMBRE,
      '2026-09-05',
      '2026-09-06',
      '2026-09-12',
      '2026-09-13',
      '2026-09-20',
    )

    expect(plain(submitTexts(t, 25, missedAmong(SEPTEMBRE, missed), WHEN, true))).toEqual({
      submit: 'Valider et arrêter : 20 données, 5 oubliées',
      submitLabel: 'Valider et arrêter : 20 données, 5 oubliées, du 3 au 27 sept.',
    })
    applyLocale('en')
    expect(submitTexts(t, 25, 5, 'Sep 3 – Sep 27', true).submit).toBe(
      'Confirm and stop: 20 given, 5 missed',
    )
  })

  it('accorde le libellé lu par le lecteur d’écran au singulier', () => {
    const one = SEPTEMBRE.slice(0, 1)

    expect(submit(one, new Set()).submitLabel).toBe(
      'Valider : 1 donnée, 0 oubliée, du 3 au 27 sept.',
    )
    expect(submit(one, new Set(one.map(dayKey))).submitLabel).toBe(
      'Valider : 0 donnée, 1 oubliée, du 3 au 27 sept.',
    )
  })

  it('découpe par mois, chacun avec « Cocher / Décocher le mois »', () => {
    const all = dues('2026-08-20', '2026-09-27')
    const [august, september] = tabMonths(t, tab(all))
    const unchecked = keys(all, '2026-08-21')

    expect(plain(august)).toMatchObject({ title: 'août 2026', count: '12 jours', blanks: 5 })
    expect(august?.dues).toHaveLength(12)
    expect(plain(september)).toMatchObject({ title: 'septembre 2026', count: '27 jours' })
    expect(plain(monthToggle(t, august!, missedAmong(august!.dues, unchecked)))).toEqual({
      checks: true,
      text: 'Cocher le mois',
      label: 'Cocher août 2026',
    })
    expect(plain(monthToggle(t, september!, missedAmong(september!.dues, unchecked)))).toEqual({
      checks: false,
      text: 'Décocher le mois',
      label: 'Décocher septembre 2026',
    })
  })

  it('saute les mois sans dose', () => {
    const quarterly: Due[] = ['2026-01-10', '2026-04-10', '2026-07-10'].map((dueOn) => ({
      periodId: 'p-1',
      dueOn,
      dueTime: null,
    }))

    expect(months(quarterly).map(({ title }) => title)).toEqual([
      'janvier 2026',
      'avril 2026',
      'juillet 2026',
    ])
  })
})

describe('chooseDaysLayout — un calendrier par heure, en onglets (Q5)', () => {
  const texts = (all: Due[], index: number, unchecked = new Set<string>()) => {
    const { tabs, hasTabs } = chooseDaysLayout(t, all)
    const current = tabs[index]!
    return plain(tabTexts(t, current, missedAmong(current.dues, unchecked), hasTabs))
  }

  it('ouvre un onglet par heure, chacun tout coché', () => {
    const { tabs, hasTabs, help } = layout(MATIN_ET_SOIR)

    expect(hasTabs).toBe(true)
    expect(help).toBe(
      'Coche les prises données, heure par heure. Les cases décochées seront notées « oubliée ».',
    )
    expect(tabs.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: '08:00', title: '8 h' },
      { id: '20:00', title: '20 h' },
    ])
    expect(texts(MATIN_ET_SOIR, 0)).toMatchObject({
      state: 'tout coché',
      label: 'Prises de 8 h, toutes données',
    })
    expect(months(MATIN_ET_SOIR)[0]?.count).toBe('25 jours · 8 h')
    expect(submit(MATIN_ET_SOIR, new Set()).submit).toBe('Valider : 50 données, 0 oubliée')
  })

  it('compte les oubliées de chaque onglet, et le total des deux', () => {
    const morning = MATIN_ET_SOIR.filter(({ dueTime }) => dueTime === '08:00')
    const evening = MATIN_ET_SOIR.filter(({ dueTime }) => dueTime === '20:00')
    const unchecked = new Set([
      ...keys(morning, '2026-09-05', '2026-09-06'),
      ...keys(evening, '2026-09-10', '2026-09-11', '2026-09-12'),
    ])

    expect(texts(MATIN_ET_SOIR, 0, unchecked)).toMatchObject({
      state: '2 oubliées',
      label: 'Prises de 8 h, 2 oubliées',
    })
    expect(texts(MATIN_ET_SOIR, 1, unchecked).state).toBe('3 oubliées')
    expect(label(MATIN_ET_SOIR, 1, 4, true)).toBe('5 septembre à 20 h, donnée')
    expect(submit(MATIN_ET_SOIR, unchecked)).toEqual({
      submit: 'Valider : 45 données, 5 oubliées',
      submitLabel: 'Valider : 45 données, 5 oubliées, du 3 au 27 sept.',
    })
  })

  it('nomme « Tout cocher / Tout décocher » pour l’onglet', () => {
    expect(texts(MATIN_ET_SOIR, 1)).toMatchObject({
      checkAllLabel: 'Marquer les 25 prises de 20 h comme données',
      uncheckAllLabel: 'Marquer les 25 prises de 20 h comme oubliées',
    })
    expect(texts(SEPTEMBRE, 0)).toMatchObject({
      checkAllLabel: 'Marquer les 25 prises comme données',
      uncheckAllLabel: 'Marquer les 25 prises comme oubliées',
    })
  })

  it('range dans un onglet à part les doses d’une période sans heure, et le nomme sans « de »', () => {
    const all = [
      ...dues('2026-09-01', '2026-09-19', [null]),
      ...dues('2026-09-20', '2026-09-22', ['08:00', '20:00'], 'p-2'),
    ]

    expect(layout(all).tabs.map(({ title }) => title)).toEqual(['Sans heure', '8 h', '20 h'])
    expect(texts(all, 0)).toEqual({
      state: 'tout coché',
      label: 'Prises sans heure, toutes données',
      checkAllLabel: 'Marquer les 19 prises sans heure comme données',
      uncheckAllLabel: 'Marquer les 19 prises sans heure comme oubliées',
    })
    expect(months(all)[0]?.count).toBe('19 jours')

    applyLocale('en')

    expect(texts(all, 0)).toMatchObject({
      label: 'Doses with no time, all given',
      checkAllLabel: 'Mark the 19 doses with no time as given',
    })
  })
})

describe('cocher et décocher', () => {
  it('décoche un jour, puis le recoche', () => {
    const [first] = SEPTEMBRE as [Due]
    const unchecked = new Set<string>()

    toggleDay(unchecked, first)
    expect([...unchecked]).toEqual([dayKey(first)])

    toggleDay(unchecked, first)
    expect([...unchecked]).toEqual([])
  })

  it('coche ou décoche un mois sans toucher aux autres', () => {
    const all = dues('2026-08-30', '2026-09-02')
    const august = all.slice(0, 2)
    const unchecked = new Set([dayKey(all[3]!)])

    setDays(unchecked, august, false)
    expect([...unchecked].sort()).toEqual(
      [all[0], all[1], all[3]].map((due) => dayKey(due!)).sort(),
    )

    setDays(unchecked, august, true)
    expect([...unchecked]).toEqual([dayKey(all[3]!)])
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
    const stray = new Set(['p-1 2026-08-01 '])

    expect(choiceOf(all, stray).missed).toEqual([])
    expect(missedAmong(all, stray)).toBe(0)
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

    expect(layout(MATIN_ET_SOIR).weekdays[0]).toBe('S')
    expect(months(MATIN_ET_SOIR)[0]).toMatchObject({ title: 'September 2026', blanks: 2 })
    expect(layout(MATIN_ET_SOIR).tabs.map(({ title }) => title)).toEqual(['8 am', '8 pm'])
    expect(submit(MATIN_ET_SOIR, keys(MATIN_ET_SOIR, '2026-09-05'))).toEqual({
      submit: 'Confirm: 48 given, 2 missed',
      submitLabel: 'Confirm: 48 given, 2 missed, du 3 au 27 sept.',
    })
  })
})
