import { describe, expect, it } from 'vitest'

import { milbemax, period, saisie, TODAY } from './treatment-form-fixtures'
import {
  canSubmitResumption,
  resumedFormValues,
  validateTreatmentResumption,
} from '../logic/treatment-resumption-form'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'

describe('validateTreatmentResumption (TR-32)', () => {
  const ARRETE = milbemax([period({ stoppedOn: '2026-08-01' })])

  it('rend la reprise à écrire, sans nom ni type', () => {
    expect(
      validateTreatmentResumption(saisie({ firstDoseOn: '2026-10-01' }), ARRETE, TODAY),
    ).toEqual({
      success: true,
      data: {
        firstDoseOn: '2026-10-01',
        frequency: { value: 1, unit: 'day' },
        times: ['20:00'],
        doseQuantity: 0.5,
        doseUnit: 'tablet',
        endsOn: '2026-10-10',
      },
    })
  })

  it('exige la première prise', () => {
    expect(validateTreatmentResumption(saisie({ firstDoseOn: '' }), ARRETE, TODAY)).toEqual({
      success: false,
      errors: { firstDoseOn: 'treatments.form.errors.firstDoseOn' },
    })
  })

  it('refuse une première prise avant la fin de la dernière période', () => {
    expect(
      validateTreatmentResumption(saisie({ firstDoseOn: '2026-07-31' }), ARRETE, TODAY),
    ).toEqual({
      success: false,
      errors: { firstDoseOn: 'treatments.form.errors.firstDoseOnTooEarly' },
    })
  })

  it('refuse une date de fin avant la première prise', () => {
    expect(
      validateTreatmentResumption(
        saisie({ firstDoseOn: '2026-10-01', endsOn: '2026-09-30' }),
        ARRETE,
        TODAY,
      ),
    ).toEqual({
      success: false,
      errors: { endsOn: 'treatments.form.errors.endsOnBeforeFirstDose' },
    })
  })
})

describe('valeurs à l’ouverture de « Reprendre »', () => {
  it('« Reprendre » part des réglages de la dernière période, sans date de fin', () => {
    const arrete = milbemax([period({ stoppedOn: '2026-08-01', endsOn: '2026-08-10' })])

    const opened = resumedFormValues(arrete, TODAY)

    expect(opened.status).toBe('ready')
    expect(opened).toMatchObject({ values: { name: 'Milbemax', firstDoseOn: '', endsOn: '' } })
  })

  it.each([
    ['upcoming', TODAY],
    ['today', '2026-10-10'],
    ['overdue', '2026-10-12'],
  ] as const)(
    'un traitement en cours (%s) n’a rien à reprendre, sans être introuvable',
    (phase, on) => {
      expect(treatmentScheduleOf(milbemax(), on).phase).toBe(phase)

      expect(resumedFormValues(milbemax(), on)).toEqual({ status: 'not-resumable' })
    },
  )
})

describe('envoi de « Reprendre »', () => {
  it('attend la première prise', () => {
    expect(canSubmitResumption({ firstDoseOn: '' })).toBe(false)
    expect(canSubmitResumption({ firstDoseOn: '2026-10-01' })).toBe(true)
  })
})
