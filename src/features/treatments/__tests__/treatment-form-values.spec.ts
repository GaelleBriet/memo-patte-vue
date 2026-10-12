import { describe, expect, it } from 'vitest'

import { milbemax, period, saisie } from './treatment-form-fixtures'
import {
  emptyTreatmentFormValues,
  rhythmOfValues,
  treatmentFormValuesFrom,
} from '../logic/treatment-form-values'

describe('valeurs du formulaire', () => {
  it('part d’un formulaire vide, l’unité de fréquence au mois', () => {
    expect(emptyTreatmentFormValues()).toEqual({
      name: '',
      type: null,
      frequencyValue: '',
      frequencyUnit: 'month',
      firstDoseOn: '',
      nextDoseOn: '',
      shiftsFollowing: true,
      times: [],
      doseQuantity: '',
      doseUnit: null,
      endsOn: '',
      reminderOffset: null,
      reminderTime: null,
    })
  })

  it('reprend les réglages d’une période, la quantité d’un comprimé en fraction', () => {
    const reglages = period({ times: ['20:00', '08:00'], endsOn: '2026-10-10' })

    expect(treatmentFormValuesFrom(milbemax(), reglages)).toEqual({
      name: 'Milbemax',
      type: 'deworming',
      frequencyValue: '3',
      frequencyUnit: 'month',
      firstDoseOn: '',
      nextDoseOn: '',
      shiftsFollowing: true,
      times: ['08:00', '20:00'],
      doseQuantity: '1\u00a0½',
      doseUnit: 'tablet',
      endsOn: '2026-10-10',
      reminderOffset: null,
      reminderTime: null,
    })
  })

  it('reprend le rappel de la période, pour « Modifier » comme pour « Reprendre » (TR-32)', () => {
    const reglages = period({ times: ['21:00'], reminderOffsetMinutes: 30, reminderTime: '07:30' })

    expect(treatmentFormValuesFrom(milbemax(), reglages)).toMatchObject({
      reminderOffset: 30,
      reminderTime: '07:30',
    })
  })

  it('laisse la posologie vide quand la période n’en a pas', () => {
    const values = treatmentFormValuesFrom(
      milbemax(),
      period({ doseQuantity: null, doseUnit: null }),
    )

    expect(values).toMatchObject({ doseQuantity: '', doseUnit: null, endsOn: '' })
  })
})

describe('réglages saisis', () => {
  it('lit la fréquence, la quantité et la date de fin de la saisie', () => {
    expect(
      rhythmOfValues(saisie({ endsOn: ' 2026-10-10 ', reminderOffset: 60, reminderTime: '07:30' })),
    ).toEqual({
      frequency: { value: 1, unit: 'day' },
      times: ['20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      endsOn: '2026-10-10',
      reminderOffsetMinutes: 60,
      reminderTime: '07:30',
    })
  })

  it('ne rend rien tant que la fréquence n’est pas un nombre', () => {
    expect(rhythmOfValues(saisie({ frequencyValue: ' ' }))).toBeNull()
    expect(rhythmOfValues(saisie({ frequencyValue: 'deux' }))).toBeNull()
  })
})
