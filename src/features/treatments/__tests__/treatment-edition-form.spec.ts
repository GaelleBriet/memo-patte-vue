import { describe, expect, it } from 'vitest'

import { edition, milbemax, period, PRISE, TODAY } from './treatment-form-fixtures'
import {
  editedFormValues,
  editionDraftOf,
  validateTreatmentEdition,
} from '../logic/treatment-edition-form'
import { rhythmOfValues, treatmentFormValuesFrom } from '../logic/treatment-form-values'

describe('validateTreatmentEdition (TR-6, TR-9, TR-28)', () => {
  it('rend la modification à écrire, la prochaine dose telle que saisie', () => {
    expect(validateTreatmentEdition(edition({ name: 'Milbemax chat' }), milbemax(), TODAY)).toEqual(
      {
        success: true,
        data: {
          name: 'Milbemax chat',
          type: 'deworming',
          frequency: { value: 3, unit: 'month' },
          times: [],
          doseQuantity: 1.5,
          doseUnit: 'tablet',
          endsOn: null,
          nextDoseOn: '2026-10-10',
        },
      },
    )
  })

  it('exige la prochaine dose quand elle est proposée', () => {
    expect(validateTreatmentEdition(edition({ nextDoseOn: '' }), milbemax(), TODAY)).toMatchObject({
      success: false,
      errors: { nextDoseOn: 'treatments.form.errors.nextDoseOn' },
    })
  })

  it('n’envoie aucune prochaine dose pour un traitement fini, verrouillé sur son nom et son type', () => {
    const fini = milbemax([period({ endsOn: '2026-08-01' })])
    const values = edition({ endsOn: '2026-08-01', nextDoseOn: '' })

    expect(editionDraftOf(values, fini, TODAY)).toMatchObject({ change: 'locked', nextDose: null })
    expect(validateTreatmentEdition(values, fini, TODAY)).toMatchObject({
      success: true,
      data: { nextDoseOn: null },
    })
  })

  it('donne à l’aide la date saisie dans « Prochaine dose »', () => {
    const sansPrise = milbemax(
      [
        period({
          startsOn: '2026-09-20',
          firstDueOn: '2026-09-20',
          frequency: { value: 1, unit: 'day' },
        }),
      ],
      [],
    )

    expect(
      editionDraftOf(
        edition({ frequencyValue: '1', frequencyUnit: 'day', nextDoseOn: '2026-10-01' }),
        sansPrise,
        TODAY,
      ).nextDose?.help,
    ).toEqual({ kind: 'dropped', count: 8 })
  })

  it.each([
    [{ nextDoseOn: '2026-09-27' }, { nextDoseOn: 'treatments.form.errors.nextDoseOnTooEarly' }],
    [
      { nextDoseOn: '2026-10-20', endsOn: '2026-10-15' },
      { nextDoseOn: 'treatments.form.errors.nextDoseOnAfterEnd' },
    ],
    [{ endsOn: '2026-07-09' }, { endsOn: 'treatments.form.errors.endsOnBeforeFirstDose' }],
    [
      { frequencyValue: '1', endsOn: '2026-09-01', nextDoseOn: TODAY },
      { endsOn: 'treatments.form.errors.endsOnBeforeNextDose' },
    ],
  ] as const)('refuse %o', (change, errors) => {
    expect(validateTreatmentEdition(edition(change), milbemax(), TODAY)).toMatchObject({
      success: false,
      errors,
    })
  })

  it('refuse une date de fin avant la dernière prise notée', () => {
    const deuxPrises = milbemax(
      [period()],
      [
        PRISE,
        {
          ...PRISE,
          id: 'd-2',
          dueOn: '2026-10-10',
          givenOn: '2026-10-10',
          nextDueDate: '2027-01-10',
        },
      ],
    )

    expect(
      validateTreatmentEdition(
        edition({ endsOn: '2026-10-09', nextDoseOn: '2027-01-10' }),
        deuxPrises,
        '2026-10-20',
      ),
    ).toMatchObject({
      success: false,
      errors: { endsOn: 'treatments.form.errors.endsOnBeforeLastDose' },
    })
  })

  it('dit quand il ne reste qu’à poser la question des échéances tombées, et prend la réponse', () => {
    const sansPrise = milbemax(
      [
        period({
          startsOn: '2026-09-22',
          firstDueOn: '2026-09-23',
          frequency: { value: 2, unit: 'day' },
        }),
      ],
      [],
    )
    const values = {
      ...treatmentFormValuesFrom(sansPrise, sansPrise.periods[0]!),
      frequencyValue: '3',
    }
    const saisi = {
      ...values,
      nextDoseOn: editionDraftOf(values, sansPrise, TODAY).nextDose!.proposedOn,
    }

    expect(validateTreatmentEdition(saisi, sansPrise, TODAY)).toEqual({
      success: false,
      errors: {},
      needsPastDuesChoice: true,
    })
    expect(validateTreatmentEdition(saisi, sansPrise, TODAY, 'keep')).toMatchObject({
      success: true,
      data: { pastDues: 'keep', nextDoseOn: TODAY },
    })
    expect(validateTreatmentEdition({ ...saisi, name: '' }, sansPrise, TODAY)).toMatchObject({
      success: false,
      needsPastDuesChoice: false,
    })
  })

  it('suit la saisie en cours : nouvelle période dès que la fréquence change, correction sinon', () => {
    expect(editionDraftOf(edition(), milbemax(), TODAY).change).toBe('correct')
    expect(editionDraftOf(edition({ frequencyValue: '1' }), milbemax(), TODAY)).toMatchObject({
      change: 'open',
      nextDose: { proposedOn: TODAY, help: { kind: 'calculated-passed', on: '2026-08-10' } },
    })
  })

  it('garde les réglages enregistrés tant que la saisie n’est pas valide', () => {
    expect(rhythmOfValues(edition({ frequencyValue: '' }))).toBeNull()
    expect(editionDraftOf(edition({ frequencyValue: '' }), milbemax(), TODAY)).toMatchObject({
      change: 'correct',
      nextDose: { proposedOn: '2026-10-10' },
    })
  })
})

describe('valeurs à l’ouverture de « Modifier »', () => {
  it('« Modifier » part des réglages en cours et de la prochaine dose proposée', () => {
    expect(editedFormValues(milbemax(), TODAY)).toEqual({
      ...treatmentFormValuesFrom(milbemax(), period()),
      nextDoseOn: '2026-10-10',
    })
  })
})
