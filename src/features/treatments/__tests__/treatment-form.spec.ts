import { describe, expect, it } from 'vitest'

import {
  canAddTime,
  doseQuantityTextFor,
  editionDraftOf,
  emptyTreatmentFormValues,
  parseDoseQuantity,
  rhythmOfValues,
  tabletShortcuts,
  treatmentFormValuesFrom,
  validateTreatmentCreation,
  validateTreatmentEdition,
  validateTreatmentResumption,
  withTime,
  withTimeChanged,
  withoutTime,
  type TreatmentFormValues,
} from '../logic/treatment-form'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'

const AT = '2026-07-01T08:00:00.000Z'
const MILO = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-09-28'

function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  return {
    id: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    startsOn: '2026-07-10',
    firstDueOn: '2026-07-10',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 3, unit: 'month' },
    times: [],
    doseQuantity: 1.5,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

const PRISE: NewTreatmentDose = {
  id: 'd-1',
  periodId: TREATMENT,
  treatmentId: TREATMENT,
  animalId: MILO,
  dueOn: '2026-07-10',
  dueTime: null,
  givenOn: '2026-07-10',
  status: 'given',
  nextDueDate: '2026-10-10',
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
}

function milbemax(
  periods: TreatmentPeriodRecord[] = [period()],
  doses: NewTreatmentDose[] = [PRISE],
): TreatmentWithHistory {
  return {
    id: TREATMENT,
    animalId: MILO,
    name: 'Milbemax',
    type: 'deworming',
    createdAt: AT,
    updatedAt: AT,
    periods,
    doses,
  }
}

function saisie(changes: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
  return {
    name: 'Panacur',
    type: 'deworming',
    frequencyValue: '1',
    frequencyUnit: 'day',
    firstDoseOn: '2026-09-29',
    nextDoseOn: '',
    times: ['20:00'],
    doseQuantity: '½',
    doseUnit: 'tablet',
    endsOn: '2026-10-10',
    ...changes,
  }
}

function edition(changes: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
  return {
    ...treatmentFormValuesFrom(milbemax(), period()),
    nextDoseOn: '2026-10-10',
    ...changes,
  }
}

describe('valeurs du formulaire', () => {
  it('part d’un formulaire vide, l’unité de fréquence au mois', () => {
    expect(emptyTreatmentFormValues()).toEqual({
      name: '',
      type: null,
      frequencyValue: '',
      frequencyUnit: 'month',
      firstDoseOn: '',
      nextDoseOn: '',
      times: [],
      doseQuantity: '',
      doseUnit: null,
      endsOn: '',
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
      times: ['08:00', '20:00'],
      doseQuantity: '1\u00a0½',
      doseUnit: 'tablet',
      endsOn: '2026-10-10',
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

describe('quantité de la posologie (TR-4)', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['2', 2],
    ['0,5', 0.5],
    ['0.3', 0.3],
    ['½', 0.5],
    ['¼', 0.25],
    ['1 ½', 1.5],
    ['1\u00a0¾', 1.75],
  ])('lit « %s »', (text, quantity) => {
    expect(parseDoseQuantity(text)).toBe(quantity)
  })

  it.each(['un', '1/2', '-1', '1,', '½ 1'])('ne lit pas « %s »', (text) => {
    expect(parseDoseQuantity(text)).toBeNaN()
  })

  it('récrit la quantité pour l’unité choisie : fraction pour un comprimé, décimale sinon', () => {
    expect(doseQuantityTextFor('0,5', 'tablet')).toBe('½')
    expect(doseQuantityTextFor('½', 'ml')).toBe('0,5')
    expect(doseQuantityTextFor('1.5', 'tablet')).toBe('1\u00a0½')
    expect(doseQuantityTextFor('0,3', 'tablet')).toBe('0,3')
  })

  it('garde une saisie illisible, vide ou sans unité telle quelle', () => {
    expect(doseQuantityTextFor('un', 'tablet')).toBe('un')
    expect(doseQuantityTextFor('', 'tablet')).toBe('')
    expect(doseQuantityTextFor('0,5', null)).toBe('0,5')
  })

  it('propose les raccourcis « ¼ ½ ¾ 1 1 ½ » des comprimés', () => {
    expect(tabletShortcuts()).toEqual([
      { value: 0.25, label: '¼' },
      { value: 0.5, label: '½' },
      { value: 0.75, label: '¾' },
      { value: 1, label: '1' },
      { value: 1.5, label: '1\u00a0½' },
    ])
  })
})

describe('heures du traitement (TR-5)', () => {
  it('ajoute une heure dans l’ordre de la journée', () => {
    expect(withTime(['20:00'], '08:00')).toEqual(['08:00', '20:00'])
  })

  it('ignore une heure déjà présente ou illisible', () => {
    expect(withTime(['08:00'], '08:00')).toEqual(['08:00'])
    expect(withTime(['08:00'], '')).toEqual(['08:00'])
  })

  it('retire une heure et en change une autre', () => {
    expect(withoutTime(['08:00', '20:00'], '08:00')).toEqual(['20:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '07:30')).toEqual(['07:30', '08:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '08:00')).toEqual(['08:00'])
    expect(withTimeChanged(['08:00'], '08:00', '')).toEqual(['08:00'])
  })

  it('s’arrête à 24 heures par jour', () => {
    const toutes = Array.from(
      { length: MAX_TIMES_PER_DAY },
      (_, hour) => `${String(hour).padStart(2, '0')}:00`,
    )

    expect(canAddTime(toutes.slice(1))).toBe(true)
    expect(canAddTime(toutes)).toBe(false)
    expect(withTime(toutes, '00:30')).toEqual(toutes)
  })
})

describe('validateTreatmentCreation (TR-1, TR-4, TR-6)', () => {
  it('rend la création à écrire : animal de la route, nom nettoyé, quantité lue', () => {
    expect(validateTreatmentCreation(saisie({ name: ' Panacur ' }), MILO)).toEqual({
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
    expect(validateTreatmentCreation(emptyTreatmentFormValues(), MILO)).toEqual({
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
    expect(validateTreatmentCreation(saisie(change), MILO)).toEqual({ success: false, errors })
  })

  it('accepte une date de fin le jour de la première prise', () => {
    expect(validateTreatmentCreation(saisie({ endsOn: '2026-09-29' }), MILO).success).toBe(true)
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
    expect(validateTreatmentEdition(edition({ nextDoseOn: '' }), milbemax(), TODAY)).toEqual({
      success: false,
      errors: { nextDoseOn: 'treatments.form.errors.nextDoseOn' },
    })
  })

  it('n’envoie aucune prochaine dose pour un traitement fini', () => {
    const fini = milbemax([period({ endsOn: '2026-08-01' })])

    expect(
      validateTreatmentEdition(edition({ endsOn: '2026-08-01', nextDoseOn: '' }), fini, TODAY),
    ).toMatchObject({ success: true, data: { nextDoseOn: null } })
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
    expect(validateTreatmentEdition(edition(change), milbemax(), TODAY)).toEqual({
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
    ).toEqual({
      success: false,
      errors: { endsOn: 'treatments.form.errors.endsOnBeforeLastDose' },
    })
  })

  it('suit la saisie en cours : nouvelle période dès que la fréquence change, correction sinon', () => {
    expect(editionDraftOf(edition(), milbemax(), TODAY).change).toBe('correct')
    expect(editionDraftOf(edition({ frequencyValue: '1' }), milbemax(), TODAY)).toMatchObject({
      change: 'open',
      nextDose: { proposedOn: TODAY },
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
      errors: { firstDoseOn: 'treatments.form.errors.firstDoseOnBeforePreviousPeriod' },
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
