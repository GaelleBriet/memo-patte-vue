import { afterEach, describe, expect, it } from 'vitest'

import {
  doseDatesExcept,
  doseDatesOn,
  doseGestureTexts,
  doseHistory,
  finishedTreatmentRows,
  treatmentDeleteTexts,
  treatmentDetailTexts,
} from '../logic/treatment-history'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-09-23'

function dose(givenOn: string, overrides: Partial<TreatmentDose> = {}): TreatmentDose {
  return {
    id: `prise-${givenOn}`,
    treatmentId: 'bravecto',
    animalId: 'boree',
    givenOn,
    nextDueDate: '2026-09-28',
    frequency: { value: 1, unit: 'month' },
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const BRAVECTO: Treatment = {
  id: 'bravecto',
  animalId: 'boree',
  name: 'Bravecto',
  type: 'deworming',
  frequency: { value: 1, unit: 'month' },
  lastDoseDate: '2026-08-28',
  nextDueDate: '2026-09-28',
  stoppedOn: null,
  createdAt: '2026-05-30T09:00:00.000Z',
  updatedAt: '2026-05-30T09:00:00.000Z',
  deletedAt: null,
}

/** Prises mensuelles, la plus récente d'abord, comme le repository les rend. */
function monthly(count: number, from = '2026-08-28'): TreatmentDose[] {
  const [year, month, day] = from.split('-').map(Number) as [number, number, number]
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 - index, day)
    const iso = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    return dose(iso)
  })
}

afterEach(() => {
  applyLocale('fr')
})

describe('doseHistory', () => {
  it('met la dernière prise à part tant que le traitement est en cours (F8)', () => {
    const doses = monthly(4)

    expect(doseHistory(doses, { ongoing: true })).toEqual({
      head: doses[0],
      others: { kind: 'list', doses: doses.slice(1) },
    })
  })

  it('liste toutes les prises d’un traitement arrêté (F9 ter)', () => {
    const doses = monthly(2)

    expect(doseHistory(doses, { ongoing: false })).toEqual({
      head: null,
      others: { kind: 'list', doses },
    })
  })

  it('garde une liste simple jusqu’à 12 prises', () => {
    expect(doseHistory(monthly(12), { ongoing: true }).others.kind).toBe('list')
  })

  it('au-delà de 12 prises, regroupe les autres par année, la plus récente d’abord', () => {
    const doses = monthly(20)

    const { head, others } = doseHistory(doses, { ongoing: true })

    expect(head).toBe(doses[0])
    expect(others).toEqual({
      kind: 'years',
      groups: [
        { year: '2026', doses: doses.slice(1, 8) },
        { year: '2025', doses: doses.slice(8, 20) },
      ],
    })
  })
})

describe('doseDatesOn', () => {
  it('recalcule la prochaine dose depuis la nouvelle date, avec la fréquence de la prise', () => {
    const prise = dose('2026-08-28', { frequency: { value: 15, unit: 'day' } })

    expect(doseDatesOn(prise, '2026-08-25')).toEqual({
      givenOn: '2026-08-25',
      nextDueDate: '2026-09-09',
      frequency: { value: 15, unit: 'day' },
    })
  })
})

describe('treatmentDetailTexts', () => {
  it('décrit un traitement en cours et ses prises (F8)', () => {
    const doses = monthly(4)

    expect(
      treatmentDetailTexts(t, BRAVECTO, { animal: 'Boree', today: TODAY, doses }),
    ).toMatchObject({
      subtitle: 'Vermifuge · Boree',
      frequency: 'Tous les mois',
      due: { date: '28 sept. 2026', delay: { text: 'dans 5 jours', overdue: false } },
      doneLabel: 'C’est fait : noter la prise de Bravecto pour Boree',
      counter: '4 depuis mai 2026',
      headDetail: 'A fixé la dose du 28 sept.',
      showPrevious: 'Voir les 3 prises précédentes',
      stopped: null,
    })
  })

  it('dit « la prise précédente » quand il n’y en a qu’une', () => {
    expect(
      treatmentDetailTexts(t, BRAVECTO, { animal: 'Boree', today: TODAY, doses: monthly(2) })
        .showPrevious,
    ).toBe('Voir la prise précédente')
  })

  it('décrit un traitement arrêté sans rappel ni prochaine dose (F9 ter)', () => {
    const milbemax = {
      ...BRAVECTO,
      name: 'Milbemax',
      frequency: { value: 15, unit: 'day' },
      stoppedOn: '2026-05-26',
    } as const

    expect(
      treatmentDetailTexts(t, milbemax, {
        animal: 'Boree',
        today: TODAY,
        doses: [dose('2026-05-21'), dose('2026-05-07')],
      }),
    ).toMatchObject({
      due: null,
      counter: '2',
      stopped: {
        notice: 'Arrêté le 26 mai 2026. Aucun rappel.',
        wasFrequency: 'Était tous les 15 jours',
      },
    })
  })

  it('libelle une année de prises et le menu d’une prise', () => {
    const texts = treatmentDetailTexts(t, BRAVECTO, {
      animal: 'Boree',
      today: TODAY,
      doses: monthly(2),
    })

    expect(texts.year({ year: '2025', doses: monthly(12) })).toBe('2025 · 12 prises')
    expect(texts.year({ year: '2024', doses: monthly(1) })).toBe('2024 · 1 prise')
    expect(texts.dose(dose('2026-07-28'))).toEqual({
      date: '28 juil. 2026',
      optionsLabel: 'Options pour la prise du 28 juillet 2026',
    })
  })

  it('suit la langue courante', () => {
    applyLocale('en')

    expect(
      treatmentDetailTexts(t, BRAVECTO, { animal: 'Boree', today: TODAY, doses: monthly(4) }),
    ).toMatchObject({
      subtitle: 'Dewormer · Boree',
      counter: '4 since May 2026',
      headDetail: 'Set the next dose for Sep 28',
    })
  })
})

describe('finishedTreatmentRows', () => {
  it('annonce la date d’arrêt et le nombre de prises de chaque traitement terminé (F9)', () => {
    const milbemax = { ...BRAVECTO, id: 'milbemax', name: 'Milbemax', stoppedOn: '2026-05-26' }
    const drontal = { ...BRAVECTO, id: 'drontal', name: 'Drontal', stoppedOn: '2025-11-02' }

    expect(finishedTreatmentRows(t, [milbemax, drontal], { milbemax: 2, drontal: 1 })).toEqual([
      { id: 'milbemax', name: 'Milbemax', detail: 'Arrêté le 26 mai 2026 · 2 prises' },
      { id: 'drontal', name: 'Drontal', detail: 'Arrêté le 2 nov. 2025 · 1 prise' },
    ])
  })
})

describe('doseDatesExcept', () => {
  it('rend les jours des autres prises', () => {
    expect(doseDatesExcept(monthly(3), 'prise-2026-08-28')).toEqual(['2026-07-28', '2026-06-28'])
  })
})

describe('doseGestureTexts', () => {
  it('annonce la suppression et le déplacement d’une prise (F8)', () => {
    const texts = doseGestureTexts(t, '2026-07-28', TODAY)

    expect(texts.changeDateSubtitle).toBe('Prise du 28 juil. 2026')
    expect(texts.removed).toBe('Prise du 28 juil. supprimée')
    expect(texts.undoRemove).toBe('Annuler la suppression de la prise du 28 juillet 2026')
    expect(texts.moved('2026-07-30')).toBe('Prise déplacée au 30 juil.')
    expect(texts.undoMove).toBe('Annuler le changement de date de la prise')
  })
})

describe('treatmentDeleteTexts', () => {
  it('confirme la suppression du traitement, avec ses prises et ses rappels', () => {
    expect(treatmentDeleteTexts(t, 'Bravecto', { onlyDose: false })).toEqual({
      title: 'Supprimer Bravecto\u00a0?',
      text: 'Ses prises et ses rappels seront supprimés du carnet. Cette action est définitive.',
      cancel: 'Annuler',
      confirm: 'Supprimer',
      deleted: 'Traitement Bravecto supprimé',
      failed: 'Bravecto n’a pas pu être supprimé. Réessaie.',
    })
  })

  it('dit en anglais que c’est sa seule prise', () => {
    applyLocale('en')

    expect(treatmentDeleteTexts(t, 'Bravecto', { onlyDose: true })).toMatchObject({
      text: 'This is its only dose: the Bravecto treatment will be deleted, along with its reminders. This can’t be undone.',
      deleted: 'Bravecto treatment deleted',
    })
  })

  it('explique que supprimer la seule prise supprime le traitement', () => {
    expect(treatmentDeleteTexts(t, 'Bravecto', { onlyDose: true }).text).toBe(
      'C’est sa seule prise\u00a0: le traitement Bravecto sera supprimé, avec ses rappels. Cette action est définitive.',
    )
  })
})
