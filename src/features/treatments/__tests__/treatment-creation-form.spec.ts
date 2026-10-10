import { describe, expect, it } from 'vitest'

import { MILO, saisie, TODAY } from './treatment-form-fixtures'
import {
  creationPastDuesOf,
  pastDosesBasis,
  validateTreatmentCreation,
} from '../logic/treatment-creation-form'
import { emptyTreatmentFormValues } from '../logic/treatment-form-values'

describe('champ « Rappel » (RA-7, RA-8, RA-23)', () => {
  it('envoie le rappel saisi avec les réglages', () => {
    const result = validateTreatmentCreation(
      saisie({ reminderOffset: 60, reminderTime: '07:30' }),
      MILO,
      TODAY,
    )

    expect(result).toMatchObject({
      success: true,
      data: { reminderOffsetMinutes: 60, reminderTime: '07:30' },
    })
  })
})

describe('encart des doses passées (TR-3)', () => {
  const passee = saisie({ firstDoseOn: '2026-09-25', times: [], endsOn: '' })

  it('annonce les échéances passées de la saisie en cours', () => {
    expect(creationPastDuesOf(passee, TODAY).map(({ dueOn }) => dueOn)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
    expect(creationPastDuesOf(saisie(), TODAY)).toEqual([])
    expect(creationPastDuesOf({ ...passee, frequencyValue: '' }, TODAY)).toEqual([])
    expect(creationPastDuesOf({ ...passee, endsOn: '2026-09-26' }, TODAY)).toHaveLength(2)
  })

  it('joint à la création les doses renseignées, seulement quand l’encart est rempli', () => {
    const answered = validateTreatmentCreation(passee, MILO, TODAY, [
      { dueOn: '2026-09-25', dueTime: null, status: 'given' },
    ])

    expect(answered).toMatchObject({
      success: true,
      data: { pastDoses: [{ dueOn: '2026-09-25', dueTime: null, status: 'given' }] },
    })
    expect(validateTreatmentCreation(passee, MILO, TODAY)).not.toHaveProperty('data.pastDoses')
  })

  it('une réponse ne vaut que pour la première prise, la fréquence, les heures, la date de fin et les doses annoncées', () => {
    const dues = creationPastDuesOf(passee, TODAY)
    const basis = pastDosesBasis(passee, dues)

    expect(
      pastDosesBasis({ ...passee, name: 'Autre', type: 'medication', doseQuantity: '2' }, dues),
    ).toBe(basis)
    expect(pastDosesBasis({ ...passee, firstDoseOn: '2026-09-24' }, dues)).not.toBe(basis)
    expect(pastDosesBasis({ ...passee, frequencyValue: '2' }, dues)).not.toBe(basis)
    expect(pastDosesBasis({ ...passee, frequencyUnit: 'week' }, dues)).not.toBe(basis)
    expect(pastDosesBasis({ ...passee, times: ['08:00'] }, dues)).not.toBe(basis)
    expect(pastDosesBasis({ ...passee, endsOn: '2026-12-31' }, dues)).not.toBe(basis)
    expect(pastDosesBasis(passee, dues.slice(1))).not.toBe(basis)
  })
})

describe('validateTreatmentCreation (TR-1, TR-4, TR-6)', () => {
  it('rend la création à écrire : animal de la route, nom nettoyé, quantité lue', () => {
    expect(validateTreatmentCreation(saisie({ name: ' Panacur ' }), MILO, TODAY)).toEqual({
      success: true,
      data: {
        animalId: MILO,
        name: 'Panacur',
        type: 'deworming',
        firstDoseOn: '2026-09-29',
        frequency: { value: 1, unit: 'day' },
        times: ['20:00'],
        doseQuantity: 0.5,
        doseUnit: 'tablet',
        endsOn: '2026-10-10',
      },
    })
  })

  it('accepte une première prise passée, sans heure, sans posologie ni date de fin', () => {
    const result = validateTreatmentCreation(
      saisie({
        firstDoseOn: '2026-09-03',
        times: [],
        doseQuantity: '',
        doseUnit: null,
        endsOn: '',
      }),
      MILO,
      TODAY,
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        firstDoseOn: '2026-09-03',
        times: [],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
      },
    })
  })

  it('dit ce qui manque dans un formulaire vide, sans erreur sur les champs facultatifs', () => {
    expect(validateTreatmentCreation(emptyTreatmentFormValues(), MILO, TODAY)).toEqual({
      success: false,
      errors: {
        name: 'treatments.form.errors.name',
        type: 'treatments.form.errors.type',
        frequency: 'treatments.form.errors.frequency',
        firstDoseOn: 'treatments.form.errors.firstDoseOn',
      },
    })
  })

  it.each([
    [{ frequencyValue: '366' }, { frequency: 'treatments.form.errors.frequencyMax' }],
    [{ frequencyValue: '1,5' }, { frequency: 'treatments.form.errors.frequency' }],
    [{ name: 'a'.repeat(81) }, { name: 'treatments.form.errors.nameMax' }],
    [{ doseQuantity: 'un' }, { dosage: 'treatments.form.errors.dosageQuantity' }],
    [{ doseQuantity: '0' }, { dosage: 'treatments.form.errors.dosageQuantity' }],
    [{ doseQuantity: '' }, { dosage: 'treatments.form.errors.dosageIncomplete' }],
    [{ doseUnit: null }, { dosage: 'treatments.form.errors.dosageIncomplete' }],
    [{ endsOn: '2026-09-28' }, { endsOn: 'treatments.form.errors.endsOnBeforeFirstDose' }],
    [{ endsOn: '2026-02-30' }, { endsOn: 'treatments.form.errors.endsOn' }],
    [
      { firstDoseOn: '2200-01-01', endsOn: '' },
      { firstDoseOn: 'treatments.form.errors.firstDoseOn' },
    ],
  ] as const)('refuse %o', (change, errors) => {
    expect(validateTreatmentCreation(saisie(change), MILO, TODAY)).toEqual({
      success: false,
      errors,
    })
  })

  it('accepte une date de fin le jour de la première prise', () => {
    expect(validateTreatmentCreation(saisie({ endsOn: '2026-09-29' }), MILO, TODAY).success).toBe(
      true,
    )
  })
})
