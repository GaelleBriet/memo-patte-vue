import { describe, expect, it, vi } from 'vitest'

import {
  canAddTime,
  creationPastDuesOf,
  doseQuantityTextFor,
  editionDraftOf,
  emptyTreatmentFormValues,
  isTimeTaken,
  parseDoseQuantity,
  pastDosesBasis,
  reminderHelpText,
  reminderOffsetChoices,
  rhythmOfValues,
  suggestExactReminders,
  suggestsExactReminders,
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
import i18n from '@/core/i18n'
import type { NotificationPermissionStatus } from '@/core/notifications'
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
    referenceOn: '2026-07-10',
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
    shiftsFollowing: true,
    times: ['20:00'],
    doseQuantity: '½',
    doseUnit: 'tablet',
    endsOn: '2026-10-10',
    reminderOffset: null,
    reminderTime: null,
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

describe('champ « Rappel » (RA-7, RA-8, RA-23)', () => {
  it('propose les quatre moments avec les rappels précis actifs', () => {
    expect(reminderOffsetChoices('precise', null)).toEqual([0, 15, 30, 60])
  })

  it.each(['never-enabled', 'removed', 'unavailable', null] as const)(
    'sans rappels précis (%s), seulement « À l’heure » et « 1 h avant »',
    (status) => {
      expect(reminderOffsetChoices(status, null)).toEqual([0, 60])
      expect(reminderOffsetChoices(status, 0)).toEqual([0, 60])
    },
  )

  it('garde le choix déjà fait, à sa place, quand les rappels précis ne sont plus actifs (V2 ter)', () => {
    expect(reminderOffsetChoices('removed', 30)).toEqual([0, 30, 60])
    expect(reminderOffsetChoices('never-enabled', 15)).toEqual([0, 15, 60])
  })

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

  describe('suggestion des rappels précis (RA-23)', () => {
    const contexte = {
      exact: 'never-enabled',
      notifications: 'granted',
      alreadySuggested: false,
    } as const

    it('la propose quand le traitement reçoit sa première heure, notifications autorisées', () => {
      expect(suggestsExactReminders([], ['21:00'], contexte)).toBe(true)
    })

    it('ne la propose pas pour une heure de plus, ni pour une heure retirée', () => {
      expect(suggestsExactReminders(['08:00'], ['08:00', '20:00'], contexte)).toBe(false)
      expect(suggestsExactReminders(['08:00'], [], contexte)).toBe(false)
    })

    it('ne la propose qu’une fois', () => {
      expect(suggestsExactReminders([], ['21:00'], { ...contexte, alreadySuggested: true })).toBe(
        false,
      )
    })

    it.each([
      ['precise', 'granted'],
      ['removed', 'granted'],
      ['unavailable', 'granted'],
      [null, 'granted'],
      ['never-enabled', 'unasked'],
      ['never-enabled', 'disabled'],
      ['never-enabled', null],
    ] as const)(
      'ne la propose pas avec les rappels précis %s et les notifications %s',
      (exact, notifications) => {
        expect(suggestsExactReminders([], ['21:00'], { ...contexte, exact, notifications })).toBe(
          false,
        )
      },
    )
  })
})

describe('suggestExactReminders (RA-23)', () => {
  function dependances(overrides: Partial<Parameters<typeof suggestExactReminders>[2]> = {}) {
    return {
      exact: 'never-enabled' as const,
      alreadySuggested: vi.fn<() => boolean>(() => false),
      notifications: vi.fn<() => Promise<NotificationPermissionStatus>>(async () => 'granted'),
      markSuggested: vi.fn<() => void>(),
      ...overrides,
    }
  }

  it('propose la suggestion et la note comme faite, une fois les notifications relues', async () => {
    const deps = dependances()

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(true)
    expect(deps.notifications).toHaveBeenCalledOnce()
    expect(deps.markSuggested).toHaveBeenCalledOnce()
  })

  it('ne relit pas les notifications quand rien d’autre ne permet la suggestion', async () => {
    const deps = dependances({ exact: 'precise' })

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(false)
    expect(deps.notifications).not.toHaveBeenCalled()
    expect(deps.markSuggested).not.toHaveBeenCalled()
  })

  it('ne note rien quand les notifications ne sont pas autorisées', async () => {
    const deps = dependances({
      notifications: vi.fn<() => Promise<NotificationPermissionStatus>>(async () => 'unasked'),
    })

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(false)
    expect(deps.markSuggested).not.toHaveBeenCalled()
  })
})

describe('reminderHelpText (RA-8, V1 bis)', () => {
  const t = i18n.global.t

  it('demande l’heure du rappel sans heure de traitement', () => {
    expect(reminderHelpText(t, [])).toBe('Sans heure de traitement, choisis l’heure du rappel.')
  })

  it('ne dit rien pour une seule heure', () => {
    expect(reminderHelpText(t, ['21:00'])).toBeNull()
  })

  it('dit que le rappel vaut pour chaque heure', () => {
    expect(reminderHelpText(t, ['08:00', '20:00'])).toBe(
      'Pour chaque heure\u00a0: 8\u00a0h et 20\u00a0h.',
    )
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
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '08:00')).toEqual(['08:00', '20:00'])
    expect(withTimeChanged(['08:00', '20:00'], '20:00', '20:00')).toEqual(['08:00', '20:00'])
    expect(withTimeChanged(['08:00'], '08:00', '')).toEqual(['08:00'])
  })

  it('reconnaît une heure déjà prise par une autre puce', () => {
    expect(isTimeTaken(['08:00', '20:00'], '20:00')).toBe(true)
    expect(isTimeTaken(['08:00', '20:00'], '20:00', '20:00')).toBe(false)
    expect(isTimeTaken(['08:00', '20:00'], '09:00')).toBe(false)
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
