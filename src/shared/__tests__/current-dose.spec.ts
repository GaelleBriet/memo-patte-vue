import { afterEach, describe, expect, it } from 'vitest'

import { currentDoseText, dueTodayText } from '../domain/current-dose'
import type { Due } from '../domain/treatment-schedule'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const NBSP = ' '
const TODAY = '2026-09-28'

function due(dueOn: string, dueTime: string | null = null): Due {
  return { periodId: 'p-1', dueOn, dueTime }
}

afterEach(() => applyLocale('fr'))

describe('currentDoseText', () => {
  it('annonce la dose du jour, avec son heure quand elle en a une', () => {
    expect(currentDoseText(t, { phase: 'today', due: due(TODAY), today: TODAY })).toEqual({
      label: 'Dose du jour',
      value: '28 sept.',
    })
    expect(currentDoseText(t, { phase: 'today', due: due(TODAY, '20:00'), today: TODAY })).toEqual({
      label: 'Dose du jour',
      value: `28 sept. à 20${NBSP}h`,
    })
  })

  it('annonce la prochaine dose, « demain » la veille', () => {
    expect(currentDoseText(t, { phase: 'upcoming', due: due('2026-09-29'), today: TODAY })).toEqual(
      { label: 'Prochaine dose', value: 'demain, 29 sept.' },
    )
    expect(currentDoseText(t, { phase: 'upcoming', due: due('2026-10-14'), today: TODAY })).toEqual(
      { label: 'Prochaine dose', value: '14 oct.' },
    )
    expect(
      currentDoseText(t, { phase: 'upcoming', due: due('2026-10-05', '20:00'), today: TODAY })
        .value,
    ).toBe(`5 oct. à 20${NBSP}h`)
    expect(
      currentDoseText(t, { phase: 'upcoming', due: due('2027-01-05'), today: TODAY }).value,
    ).toBe('5 janv. 2027')
  })

  it('dit depuis quand une dose est en retard, sans la présenter comme la prochaine', () => {
    expect(currentDoseText(t, { phase: 'overdue', due: due('2026-09-22'), today: TODAY })).toEqual({
      label: null,
      value: 'en retard depuis le 22 sept.',
    })
  })

  it('dit la fin d’un traitement arrêté, avec sa date d’arrêt', () => {
    expect(
      currentDoseText(t, { phase: 'stopped', due: null, today: TODAY, stoppedOn: '2026-09-28' }),
    ).toEqual({ label: 'Fin du traitement', value: 'Arrêté le 28 sept.' })
  })

  it('dit la fin d’un traitement arrivé à sa date de fin', () => {
    expect(currentDoseText(t, { phase: 'ended', due: null, today: TODAY })).toEqual({
      label: 'Fin du traitement',
      value: null,
    })
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(currentDoseText(t, { phase: 'today', due: due(TODAY, '20:00'), today: TODAY })).toEqual({
      label: 'Today’s dose',
      value: `Sep 28 at 8${NBSP}pm`,
    })
    expect(currentDoseText(t, { phase: 'upcoming', due: due('2026-09-29'), today: TODAY })).toEqual(
      { label: 'Next dose', value: 'tomorrow, Sep 29' },
    )
    expect(
      currentDoseText(t, { phase: 'overdue', due: due('2026-09-22'), today: TODAY }).value,
    ).toBe('overdue since Sep 22')
    expect(
      currentDoseText(t, { phase: 'stopped', due: null, today: TODAY, stoppedOn: '2026-09-28' }),
    ).toEqual({ label: 'Treatment end', value: 'Stopped on Sep 28' })
  })
})

describe('dueTodayText', () => {
  it('garde l’heure d’une échéance du jour, même passée', () => {
    expect(dueTodayText(t, due(TODAY, '08:00'))).toBe(`Aujourd’hui · 8${NBSP}h`)
    expect(dueTodayText(t, due(TODAY))).toBe('Aujourd’hui')
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(dueTodayText(t, due(TODAY, '20:00'))).toBe(`Today · 8${NBSP}pm`)
    expect(dueTodayText(t, due(TODAY))).toBe('Today')
  })
})
