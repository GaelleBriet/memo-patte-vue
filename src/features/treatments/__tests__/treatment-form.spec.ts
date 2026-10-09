import { describe, expect, it } from 'vitest'

import { edition, milbemax, MILO, period, PRISE, saisie, TODAY } from './treatment-form-fixtures'
import {
  creationPastDuesOf,
  editionDraftOf,
  pastDosesBasis,
  loadedFormValues,
  validateTreatmentCreation,
  validateTreatmentEdition,
  validateTreatmentResumption,
} from '../logic/treatment-form'
import {
  emptyTreatmentFormValues,
  rhythmOfValues,
  treatmentFormValuesFrom,
} from '../logic/treatment-form-values'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'

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

describe('loadedFormValues', () => {
  it('« Modifier » part des réglages en cours et de la prochaine dose proposée', () => {
    expect(loadedFormValues('edit', milbemax(), TODAY)).toEqual({
      status: 'ready',
      values: {
        ...treatmentFormValuesFrom(milbemax(), period()),
        nextDoseOn: '2026-10-10',
      },
    })
  })

  it('« Reprendre » part des réglages de la dernière période, sans date de fin', () => {
    const arrete = milbemax([period({ stoppedOn: '2026-08-01', endsOn: '2026-08-10' })])

    const opened = loadedFormValues('resume', arrete, TODAY)

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

      expect(loadedFormValues('resume', milbemax(), on)).toEqual({ status: 'not-resumable' })
    },
  )
})
