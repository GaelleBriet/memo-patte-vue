import { afterEach, describe, expect, it } from 'vitest'

import {
  chosenReminder,
  injectionDatesExcept,
  injectionDatesOn,
  injectionGestureTexts,
  injectionRows,
  vaccinationDeleteTexts,
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
      doneLabel: 'C’est fait : noter l’injection de Carré pour Boree et choisir le prochain rappel',
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

describe('injectionDatesExcept', () => {
  it('rend les jours des autres injections', () => {
    const injections = [injection('a', '2026-08-26', null), injection('b', '2026-07-27', null)]

    expect(injectionDatesExcept(injections, 'a')).toEqual(['2026-07-27'])
  })
})

describe('injectionGestureTexts', () => {
  it('annonce la suppression et le déplacement d’une injection (F7)', () => {
    const texts = injectionGestureTexts(t, '2026-07-27', TODAY)

    expect(texts.changeDateSubtitle).toBe('Injection du 27 juil. 2026')
    expect(texts.removed).toBe('Injection du 27 juil. supprimée')
    expect(texts.undoRemove).toBe('Annuler la suppression de l’injection du 27 juillet 2026')
    expect(texts.moved('2026-07-25')).toBe('Injection déplacée au 25 juil.')
    expect(texts.undoMove).toBe('Annuler le changement de date de l’injection')
  })

  it('écrit l’année d’une injection d’une autre année', () => {
    expect(injectionGestureTexts(t, '2025-07-27', TODAY).removed).toBe(
      'Injection du 27 juil. 2025 supprimée',
    )
  })
})

describe('vaccinationDeleteTexts', () => {
  it('confirme la suppression du vaccin, avec ses injections et ses rappels', () => {
    expect(vaccinationDeleteTexts(t, 'Carré', { onlyInjection: false })).toEqual({
      title: 'Supprimer Carré\u00a0?',
      text: 'Ses injections et ses rappels seront supprimés du carnet. Cette action est définitive.',
      cancel: 'Annuler',
      confirm: 'Supprimer',
      deleted: 'Vaccin Carré supprimé',
      failed: 'Carré n’a pas pu être supprimé. Réessaie.',
    })
  })

  it('dit en anglais que c’est sa seule injection, et invite à choisir le rappel', () => {
    applyLocale('en')

    expect(vaccinationDeleteTexts(t, 'Carré', { onlyInjection: true })).toMatchObject({
      text: 'This is its only injection: the Carré vaccine will be deleted, along with its reminders. This can’t be undone.',
      deleted: 'Carré vaccine deleted',
    })
    expect(
      vaccinationDetailTexts(
        t,
        { name: 'Carré', dueDate: null },
        { animal: 'Boree', today: TODAY, injections: 1 },
      ).doneLabel,
    ).toBe('Done: log the Carré injection for Boree and choose the next reminder')
  })

  it('explique que supprimer la seule injection supprime le vaccin', () => {
    expect(vaccinationDeleteTexts(t, 'Carré', { onlyInjection: true }).text).toBe(
      'C’est sa seule injection\u00a0: le vaccin Carré sera supprimé, avec ses rappels. Cette action est définitive.',
    )
  })
})
