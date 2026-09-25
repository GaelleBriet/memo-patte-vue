import { afterEach, describe, expect, it } from 'vitest'

import {
  chosenReminder,
  injectionDatesOn,
  injectionRows,
  vaccinationDetailTexts,
} from '../logic/vaccination-history'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-09-23'

function injection(
  id: string,
  injectedOn: string,
  nextDueDate: string | null,
): VaccinationInjection {
  return {
    id,
    vaccinationId: 'carre',
    animalId: 'boree',
    injectedOn,
    nextDueDate,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    deletedAt: null,
  }
}

afterEach(() => {
  applyLocale('fr')
})

describe('chosenReminder', () => {
  it('reconnaît un rappel à un an ou à trois ans pile', () => {
    expect(chosenReminder(injection('i', '2026-08-26', '2027-08-26'))).toEqual({ kind: 'oneYear' })
    expect(chosenReminder(injection('i', '2026-08-26', '2029-08-26'))).toEqual({
      kind: 'threeYears',
    })
  })

  it('garde la date d’un autre écart, et « pas de rappel » sans échéance', () => {
    expect(chosenReminder(injection('i', '2026-07-27', '2026-08-26'))).toEqual({
      kind: 'date',
      date: '2026-08-26',
    })
    expect(chosenReminder(injection('i', '2026-07-27', '2027-07-28'))).toEqual({
      kind: 'date',
      date: '2027-07-28',
    })
    expect(chosenReminder(injection('i', '2026-07-27', null))).toEqual({ kind: 'none' })
  })

  it('compte le 29 février comme un an pile vers le 28 février', () => {
    expect(chosenReminder(injection('i', '2028-02-29', '2029-02-28'))).toEqual({
      kind: 'oneYear',
    })
  })
})

describe('injectionDatesOn', () => {
  it('déplace un rappel à un an ou à trois ans avec l’injection', () => {
    expect(injectionDatesOn(injection('i', '2026-08-26', '2027-08-26'), '2026-08-20')).toEqual({
      injectedOn: '2026-08-20',
      nextDueDate: '2027-08-20',
    })
    expect(injectionDatesOn(injection('i', '2026-08-26', '2029-08-26'), '2026-08-20')).toEqual({
      injectedOn: '2026-08-20',
      nextDueDate: '2029-08-20',
    })
  })

  it('garde une autre date telle quelle, et l’absence de rappel', () => {
    expect(injectionDatesOn(injection('i', '2026-07-27', '2026-08-26'), '2026-07-25')).toEqual({
      injectedOn: '2026-07-25',
      nextDueDate: '2026-08-26',
    })
    expect(injectionDatesOn(injection('i', '2026-07-27', null), '2026-07-25')).toEqual({
      injectedOn: '2026-07-25',
      nextDueDate: null,
    })
  })
})

describe('injectionRows', () => {
  it('décrit chaque injection par sa date et le rappel choisi ce jour-là (F7)', () => {
    const rows = injectionRows(t, [
      injection('a', '2026-08-26', '2027-08-26'),
      injection('b', '2026-07-27', '2026-08-26'),
      injection('c', '2026-06-28', '2026-07-27'),
      injection('d', '2025-06-28', null),
      injection('e', '2023-06-28', '2026-06-28'),
    ])

    expect(rows).toEqual([
      {
        id: 'a',
        date: '26 août 2026',
        chosen: 'Rappel choisi : dans 1 an',
        optionsLabel: 'Options pour l’injection du 26 août 2026',
      },
      {
        id: 'b',
        date: '27 juil. 2026',
        chosen: 'Rappel choisi : autre date, 26 août 2026',
        optionsLabel: 'Options pour l’injection du 27 juillet 2026',
      },
      expect.objectContaining({ chosen: 'Rappel choisi : autre date, 27 juil. 2026' }),
      expect.objectContaining({ chosen: 'Rappel choisi : pas de rappel' }),
      expect.objectContaining({ chosen: 'Rappel choisi : dans 3 ans' }),
    ])
  })

  it('suit la langue courante', () => {
    applyLocale('en')

    expect(injectionRows(t, [injection('a', '2026-08-26', '2027-08-26')])).toEqual([
      {
        id: 'a',
        date: 'Aug 26, 2026',
        chosen: 'Reminder set: in 1 year',
        optionsLabel: 'Options for the injection on August 26, 2026',
      },
    ])
  })
})

describe('vaccinationDetailTexts', () => {
  it('annonce le prochain rappel, son délai et le nombre d’injections (F7)', () => {
    expect(
      vaccinationDetailTexts(
        t,
        { name: 'Carré', dueDate: '2027-08-26' },
        { animal: 'Boree', today: TODAY, injections: 3 },
      ),
    ).toEqual({
      subtitle: 'Vaccin · Boree',
      due: { date: '26 août 2027', delay: { text: 'dans 11 mois', overdue: false } },
      doneLabel: 'C’est fait : noter l’injection de Carré pour Boree',
      counter: '3',
    })
  })

  it('n’annonce aucun rappel quand le dernier choix est « Pas de rappel »', () => {
    expect(
      vaccinationDetailTexts(
        t,
        { name: 'Carré', dueDate: null },
        { animal: 'Boree', today: TODAY, injections: 1 },
      ).due,
    ).toBeNull()
  })
})
