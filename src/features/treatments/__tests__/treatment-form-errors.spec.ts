import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { treatmentFormErrorsOf, treatmentFormResultOf } from '../logic/treatment-form-errors'

function issue(path: string, message = 'x', code: 'custom' | 'too_big' = 'custom') {
  return { code, path: [path], message, input: undefined } as z.core.$ZodIssue
}

describe('erreurs du formulaire de traitement', () => {
  it('range la quantité et l’unité sous la posologie', () => {
    expect(treatmentFormErrorsOf([issue('doseUnit', 'incomplete')])).toEqual({
      dosage: 'treatments.form.errors.dosageIncomplete',
    })
    expect(treatmentFormErrorsOf([issue('doseQuantity')])).toEqual({
      dosage: 'treatments.form.errors.dosageQuantity',
    })
  })

  it('traduit le motif d’une date refusée, puis le code de l’erreur', () => {
    expect(
      treatmentFormErrorsOf([
        issue('nextDoseOn', 'afterNextDose'),
        issue('endsOn', 'beforeFarAdvancedDose'),
        issue('name', 'x', 'too_big'),
      ]),
    ).toEqual({
      nextDoseOn: 'treatments.form.errors.nextDoseOnAfterNextDose',
      endsOn: 'treatments.form.errors.endsOnBeforeFarAdvancedDose',
      name: 'treatments.form.errors.nameMax',
    })
  })

  it('ignore une erreur hors des champs du formulaire', () => {
    expect(treatmentFormErrorsOf([issue('pastDues', 'required')])).toEqual({})
  })

  it('rend les données validées, ou les erreurs des champs', () => {
    const schema = z.object({ name: z.string().min(1) })

    expect(treatmentFormResultOf(schema.safeParse({ name: 'Milbemax' }))).toEqual({
      success: true,
      data: { name: 'Milbemax' },
    })
    expect(treatmentFormResultOf(schema.safeParse({ name: '' }))).toEqual({
      success: false,
      errors: { name: 'treatments.form.errors.name' },
    })
  })
})
