import { formatISO, parseISO, subDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  creationPastDues,
  creationPlan,
  treatmentCreationSchemaFor,
} from '../logic/treatment-creation'
import { pastDuesAskedAgain, treatmentEditionSchemaFor } from '../logic/treatment-edition-checks'
import { editionDraft } from '../logic/treatment-edition-draft'
import { editionPlan } from '../logic/treatment-edition-plan'
import {
  resumptionDraft,
  resumptionPlan,
  treatmentResumptionSchemaFor,
} from '../logic/treatment-resumption'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
const viewOf = (withPeriods: Pick<TreatmentWithPeriods, 'periods' | 'doses'>, today: string) =>
  treatmentReadingOf(withPeriods, today).view
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { legacyFactsOf } from '@/shared/domain/dose-calendar'

const AT = '2026-07-01T08:00:00.000Z'
const MILO = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'
const NEW_PERIOD = '33333333-3333-4333-8333-333333333333'
const NEW_DOSE = '44444444-4444-4444-8444-444444444444'
const NEW_SHIFT = '55555555-5555-4555-8555-555555555555'
let n = 0
const IDS = { periodId: NEW_PERIOD, newId: () => (++n % 2 ? NEW_DOSE : NEW_SHIFT) }

function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  const record = {
    id: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    startsOn: '2026-07-10',
    firstDueOn: '2026-07-10',
    gridOriginOn: overrides.firstDueOn ?? '2026-07-10',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 3, unit: 'month' },
    times: [],
    doseQuantity: 1,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  } satisfies Partial<TreatmentPeriodRecord>
  return {
    ...legacyFactsOf(record.gridOriginOn),
    settingsWrittenAt: record.createdAt,
    gridWrittenAt: record.createdAt,
    gridBefore: null,
    ...record,
  }
}

function dose(overrides: Partial<TreatmentDose> = {}): TreatmentDose {
  return {
    previousTargetOn: null,
    previousTargetTime: null,
    dueRank: null,
    id: 'd-1',
    periodId: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    dueOn: '2026-07-10',
    dueTime: null,
    givenOn: '2026-07-10',
    status: 'given',
    targetOn: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

function treatment(
  periods: TreatmentPeriodRecord[],
  doses: TreatmentDose[] = [],
): TreatmentWithPeriods {
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

function saisie(
  withPeriods: TreatmentWithPeriods,
  changes: Partial<TreatmentEditionInput> = {},
): TreatmentEditionInput {
  const current = withPeriods.periods.at(-1)!
  return {
    name: withPeriods.name,
    type: withPeriods.type,
    frequency: current.frequency,
    times: current.times,
    doseQuantity: current.doseQuantity,
    doseUnit: current.doseUnit,
    endsOn: current.endsOn,
    nextDoseOn: null,
    ...changes,
  }
}

function champsRefuses(
  withPeriods: TreatmentWithPeriods,
  input: TreatmentEditionInput,
  today: string,
): string[] {
  const result = treatmentEditionSchemaFor(withPeriods, today).safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`)
}

describe('creationPlan', () => {
  it('fait naître le traitement avec sa période, à la première prise, sans aucune prise (TR-3)', () => {
    const plan = creationPlan(
      {
        animalId: MILO,
        name: '  Panacur ',
        type: 'deworming',
        firstDoseOn: '2026-09-29',
        frequency: { value: 1, unit: 'day' },
        times: ['20:00', '08:00'],
        doseQuantity: 0.5,
        doseUnit: 'tablet',
        endsOn: '2026-10-10',
      },
      TREATMENT,
      '2026-09-28',
    )

    expect(plan).toEqual({
      id: TREATMENT,
      animalId: MILO,
      name: 'Panacur',
      type: 'deworming',
      settings: {
        startsOn: '2026-09-29',
        firstDueOn: '2026-09-29',
        endsOn: '2026-10-10',
        frequency: { value: 1, unit: 'day' },
        times: ['08:00', '20:00'],
        doseQuantity: 0.5,
        doseUnit: 'tablet',
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
      doses: [],
    })
  })

  it('accepte une première prise passée, sans fin, heure ni posologie', () => {
    const plan = creationPlan(
      {
        animalId: MILO,
        name: 'Advantix',
        type: 'antiparasitic',
        firstDoseOn: '2026-09-03',
        frequency: { value: 1, unit: 'month' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
      },
      TREATMENT,
      '2026-09-28',
    )

    expect(plan.settings).toMatchObject({ startsOn: '2026-09-03', firstDueOn: '2026-09-03' })
  })

  it('refuse une date de fin avant la première prise (TR-6)', () => {
    expect(() =>
      creationPlan(
        {
          animalId: MILO,
          name: 'Panacur',
          type: 'deworming',
          firstDoseOn: '2026-09-29',
          frequency: { value: 1, unit: 'day' },
          times: [],
          doseQuantity: null,
          doseUnit: null,
          endsOn: '2026-09-28',
        },
        TREATMENT,
        '2026-09-28',
      ),
    ).toThrow(ZodError)
  })
})

function createdSchedule(plan: ReturnType<typeof creationPlan>, today: string) {
  const at = `${today}T12:00:00.000Z`
  return viewOf(
    {
      periods: [period({ ...plan.settings, id: plan.id, createdAt: at, updatedAt: at })],
      doses: (plan.doses ?? []).map(({ id, dose: fields }) => ({
        ...dose(),
        ...fields,
        id,
        createdAt: at,
        updatedAt: at,
      })),
    },
    today,
  )
}

describe('creationPlan — doses passées renseignées dans l’encart (TR-3)', () => {
  const PANACUR: TreatmentCreationInput = {
    animalId: MILO,
    name: 'Panacur',
    type: 'deworming',
    firstDoseOn: '2026-09-25',
    frequency: { value: 1, unit: 'day' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    endsOn: null,
  }
  const ids = () => {
    let next = 0
    return () => `dose-${(next += 1)}`
  }

  it('annonce les échéances passées que la fiche dirait non renseignées', () => {
    expect(creationPastDues(PANACUR, '2026-09-28')).toEqual([
      { settingId: 'réglage-écrit', dueOn: '2026-09-25', dueTime: null },
      { settingId: 'réglage-écrit', dueOn: '2026-09-26', dueTime: null },
      { settingId: 'réglage-écrit', dueOn: '2026-09-27', dueTime: null },
    ])
    expect(creationPastDues({ ...PANACUR, times: ['20:00', '08:00'] }, '2026-09-26')).toEqual([
      { settingId: 'réglage-écrit', dueOn: '2026-09-25', dueTime: '08:00' },
      { settingId: 'réglage-écrit', dueOn: '2026-09-25', dueTime: '20:00' },
    ])
    expect(creationPastDues({ ...PANACUR, endsOn: '2026-09-26' }, '2026-09-28')).toHaveLength(2)
  })

  it('n’annonce rien pour une première prise du jour ou future', () => {
    expect(creationPastDues({ ...PANACUR, firstDoseOn: '2026-09-28' }, '2026-09-28')).toEqual([])
    expect(creationPastDues({ ...PANACUR, firstDoseOn: '2026-09-29' }, '2026-09-28')).toEqual([])
  })

  it('annonce aussi la dose du moment déjà passée, jamais celle du jour (Q42)', () => {
    const duesOn = (calendar: Partial<TreatmentCreationInput>, today = '2026-09-28') =>
      creationPastDues({ ...PANACUR, ...calendar }, today).map(({ dueOn, dueTime }) =>
        `${dueOn} ${dueTime ?? ''}`.trim(),
      )

    expect(duesOn({ firstDoseOn: '2026-09-07', frequency: { value: 1, unit: 'month' } })).toEqual([
      '2026-09-07',
    ])
    expect(duesOn({ firstDoseOn: '2026-09-25', frequency: { value: 1, unit: 'week' } })).toEqual([
      '2026-09-25',
    ])
    expect(duesOn({ firstDoseOn: '2026-09-14', frequency: { value: 1, unit: 'week' } })).toEqual([
      '2026-09-14',
      '2026-09-21',
    ])
    expect(
      duesOn({
        firstDoseOn: '2026-09-24',
        frequency: { value: 2, unit: 'day' },
        times: ['08:00', '20:00'],
      }),
    ).toEqual(['2026-09-24 08:00', '2026-09-24 20:00', '2026-09-26 08:00', '2026-09-26 20:00'])
    expect(duesOn({ firstDoseOn: '2026-09-21', frequency: { value: 1, unit: 'week' } })).toEqual([
      '2026-09-21',
    ])
    expect(duesOn({ firstDoseOn: '2026-09-28', frequency: { value: 1, unit: 'week' } })).toEqual([])
  })

  it('note la dose du moment en retard, donnée le jour prévu ou oubliée, sans décaler la suite', () => {
    const MENSUEL: TreatmentCreationInput = {
      ...PANACUR,
      firstDoseOn: '2026-09-07',
      frequency: { value: 1, unit: 'month' },
    }

    for (const status of ['given', 'missed'] as const) {
      const plan = creationPlan(
        { ...MENSUEL, pastDoses: [{ dueOn: '2026-09-07', dueTime: null, status }] },
        TREATMENT,
        '2026-09-28',
        ids(),
      )
      const schedule = createdSchedule(plan, '2026-09-28')

      expect(plan.doses?.[0]?.dose).toMatchObject({
        status,
        givenOn: status === 'given' ? '2026-09-07' : null,
        targetOn: null,
      })
      expect(schedule.phase).toBe('upcoming')
      expect(schedule.unloggedDoses).toEqual([])
      expect(schedule.upcoming({ limit: 3 }).map(({ dueOn }) => dueOn)).toEqual([
        '2026-10-07',
        '2026-11-07',
        '2026-12-07',
      ])
    }
  })

  it('range les doses passées écrites dans la période créée, de même identifiant que le traitement', () => {
    const plan = creationPlan(
      {
        ...PANACUR,
        pastDoses: [
          { dueOn: '2026-09-25', dueTime: null, status: 'given' },
          { dueOn: '2026-09-26', dueTime: null, status: 'missed' },
        ],
      },
      TREATMENT,
      '2026-09-28',
      ids(),
    )

    expect(plan.doses?.map(({ dose }) => dose.periodId)).toEqual([TREATMENT, TREATMENT])
  })

  describe('le nombre annoncé est ce que la fiche aurait à noter du passé (matrice)', () => {
    const TODAY = '2026-10-31'
    const firsts = ['2026-10-31', '2026-10-30', '2026-10-29', '2026-10-01', '2026-08-31']
    const frequencies = [
      { value: 1, unit: 'day' },
      { value: 2, unit: 'day' },
      { value: 1, unit: 'week' },
      { value: 1, unit: 'month' },
    ] as const
    const hours = [[], ['08:00'], ['08:00', '20:00'], ['08:00', '14:00', '20:00']]
    const ends = [null, '2026-10-29', '2026-10-31', '2026-11-15']
    const cases = firsts.flatMap((firstDoseOn) =>
      frequencies.flatMap((frequency) =>
        hours.flatMap((times) =>
          ends
            .filter((endsOn) => endsOn === null || endsOn >= firstDoseOn)
            .map((endsOn) => ({ ...PANACUR, firstDoseOn, frequency, times, endsOn })),
        ),
      ),
    )

    it('couvre la matrice', () => {
      expect(cases.length).toBeGreaterThan(280)
    })

    const slots = (dues: { dueOn: string; dueTime: string | null }[]) =>
      dues.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`.trim())

    it('annonce les non renseignées et les doses du moment passées du traitement créé sans réponse', () => {
      const faulty = cases.filter((input) => {
        const untouched = createdSchedule(creationPlan(input, TREATMENT, TODAY, ids()), TODAY)
        const expected = [
          ...untouched.unloggedDoses,
          ...untouched.currentDoses.filter(({ dueOn }) => dueOn < TODAY),
        ]
        return slots(creationPastDues(input, TODAY)).join() !== slots(expected).join()
      })

      expect(faulty).toEqual([])
    }, 30000)

    it('rempli en entier, la fiche n’a ni bandeau ni dose en retard, et la suite ne bouge pas', () => {
      const faulty = cases.filter((input) => {
        const untouched = createdSchedule(creationPlan(input, TREATMENT, TODAY, ids()), TODAY)
        const pastDoses = creationPastDues(input, TODAY).map(({ dueOn, dueTime }, index) => ({
          dueOn,
          dueTime,
          status: index % 3 === 1 ? ('missed' as const) : ('given' as const),
        }))
        const filled = createdSchedule(
          creationPlan({ ...input, pastDoses }, TREATMENT, TODAY, ids()),
          TODAY,
        )
        const sameSuite =
          slots(filled.upcoming({ limit: 6 })).join() ===
          slots(untouched.upcoming({ limit: 6 }).filter(({ dueOn }) => dueOn >= TODAY)).join()
        return !(
          filled.unloggedDoses.length === 0 &&
          filled.phase !== 'overdue' &&
          filled.history.length === pastDoses.length &&
          sameSuite
        )
      })

      expect(faulty).toEqual([])
    }, 30000)
  })

  it('n’annonce rien tant que la saisie ne fait pas un calendrier', () => {
    expect(creationPastDues({ ...PANACUR, firstDoseOn: '' }, '2026-09-28')).toEqual([])
    expect(
      creationPastDues({ ...PANACUR, frequency: { value: Number.NaN, unit: 'day' } }, '2026-09-28'),
    ).toEqual([])
    expect(
      creationPastDues(
        { ...PANACUR, firstDoseOn: '1950-01-01', times: ['08:00', '20:00'] },
        '2026-09-28',
      ),
    ).toEqual([])
  })

  it('écrit les prises choisies avec le traitement, sur sa période, sans déplacer la dose du jour', () => {
    const plan = creationPlan(
      {
        ...PANACUR,
        pastDoses: [
          { dueOn: '2026-09-25', dueTime: null, status: 'given' },
          { dueOn: '2026-09-26', dueTime: null, status: 'missed' },
        ],
      },
      TREATMENT,
      '2026-09-28',
      ids(),
    )

    expect(plan.doses).toEqual([
      {
        id: 'dose-1',
        dose: {
          periodId: TREATMENT,
          dueOn: '2026-09-25',
          dueTime: null,
          givenOn: '2026-09-25',
          status: 'given',
          targetOn: null,
          previousTargetOn: null,
          previousTargetTime: null,
          dueRank: null,
        },
      },
      {
        id: 'dose-2',
        dose: {
          periodId: TREATMENT,
          dueOn: '2026-09-26',
          dueTime: null,
          givenOn: null,
          status: 'missed',
          targetOn: null,
          previousTargetOn: null,
          previousTargetTime: null,
          dueRank: null,
        },
      },
    ])
  })

  it('sans réponse, ne note rien', () => {
    expect(creationPlan(PANACUR, TREATMENT, '2026-09-28', ids()).doses).toEqual([])
  })

  it('refuse une dose qui n’est pas une échéance passée du traitement', () => {
    expect(() =>
      creationPlan(
        { ...PANACUR, pastDoses: [{ dueOn: '2026-09-28', dueTime: null, status: 'given' }] },
        TREATMENT,
        '2026-09-28',
        ids(),
      ),
    ).toThrow(RangeError)
    expect(() =>
      creationPlan(
        {
          ...PANACUR,
          pastDoses: [
            { dueOn: '2026-09-25', dueTime: null, status: 'given' },
            { dueOn: '2026-09-25', dueTime: null, status: 'missed' },
          ],
        },
        TREATMENT,
        '2026-09-28',
        ids(),
      ),
    ).toThrow(RangeError)
  })
})

describe('plan que le moteur ne saurait pas relire', () => {
  const TODAY = '2026-09-28'
  const DEUX_FOIS_PAR_JOUR = {
    animalId: MILO,
    name: 'Métacam',
    type: 'medication',
    frequency: { value: 1, unit: 'day' },
    times: ['08:00', '20:00'],
    doseQuantity: null,
    doseUnit: null,
    endsOn: null,
  } as const
  const ilYA = (days: number) =>
    formatISO(subDays(parseISO(TODAY), days), { representation: 'date' })

  function refusCreation(firstDoseOn: string): string[] {
    const result = treatmentCreationSchemaFor(TODAY).safeParse({
      ...DEUX_FOIS_PAR_JOUR,
      times: [...DEUX_FOIS_PAR_JOUR.times],
      firstDoseOn,
    })
    return result.success
      ? []
      : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`)
  }

  it('refuse à la création une première prise trop ancienne pour le rythme, sans plan', () => {
    expect(refusCreation('1950-01-01')).toEqual(['firstDoseOn:tooOld'])
    expect(() =>
      creationPlan(
        { ...DEUX_FOIS_PAR_JOUR, times: [...DEUX_FOIS_PAR_JOUR.times], firstDoseOn: '1950-01-01' },
        TREATMENT,
        TODAY,
      ),
    ).toThrow(ZodError)
  })

  it('accepte la première prise la plus ancienne que le moteur sait encore relire, refuse la veille', () => {
    expect(refusCreation(ilYA(24_998))).toEqual([])
    expect(refusCreation(ilYA(24_999))).toEqual(['firstDoseOn:tooOld'])
  })

  it('accepte une première prise de 1950 à un rythme qui tient', () => {
    const result = treatmentCreationSchemaFor(TODAY).safeParse({
      ...DEUX_FOIS_PAR_JOUR,
      times: [],
      frequency: { value: 1, unit: 'week' },
      firstDoseOn: '1950-01-01',
    })

    expect(result.success).toBe(true)
  })

  it('refuse de même une reprise dont la première prise est trop ancienne', () => {
    const withPeriods = treatment([
      period({ startsOn: '1940-01-01', firstDueOn: '1940-01-01', stoppedOn: '1940-02-01' }),
    ])
    const result = treatmentResumptionSchemaFor(withPeriods, TODAY).safeParse({
      firstDoseOn: '1950-01-01',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
    })

    expect(
      result.error?.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`),
    ).toEqual(['firstDoseOn:tooOld'])
  })

  it('accepte la reprise la plus ancienne que le moteur sait encore relire, refuse la veille', () => {
    const withPeriods = treatment(
      [period({ startsOn: '1940-01-01', firstDueOn: '1940-01-01', stoppedOn: '1940-02-01' })],
      [dose({ dueOn: '1940-01-10', givenOn: '1940-01-10' })],
    )
    const refusReprise = (firstDoseOn: string) => {
      const result = treatmentResumptionSchemaFor(withPeriods, TODAY).safeParse({
        firstDoseOn,
        frequency: { value: 1, unit: 'day' },
        times: ['08:00', '20:00'],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
      })
      return result.success
        ? []
        : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`)
    }

    expect(refusReprise(ilYA(24_996))).toEqual([])
    expect(refusReprise(ilYA(24_997))).toEqual(['firstDoseOn:tooOld'])
  })

  it('refuse une modification qui rendrait le calendrier illisible : heures ajoutées sur un très long historique', () => {
    const ancien = period({
      startsOn: '1950-01-01',
      firstDueOn: '1950-01-01',
      frequency: { value: 1, unit: 'day' },
    })
    const withPeriods = treatment([ancien])

    expect(() => treatmentReadingOf(withPeriods, TODAY)).not.toThrow()
    expect(() =>
      treatmentReadingOf(
        { ...withPeriods, periods: [{ ...ancien, times: ['08:00', '20:00'] }] },
        TODAY,
      ),
    ).toThrow(RangeError)
  })
})

describe('moment du rappel (RA-7, RA-8)', () => {
  it('écrit à la création le rappel choisi', () => {
    const plan = creationPlan(
      {
        animalId: MILO,
        name: 'Advocate',
        type: 'antiparasitic',
        firstDoseOn: '2026-10-05',
        frequency: { value: 1, unit: 'month' },
        times: ['21:00'],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
        reminderOffsetMinutes: 60,
        reminderTime: null,
      },
      TREATMENT,
      '2026-09-28',
    )

    expect(plan.settings).toMatchObject({ reminderOffsetMinutes: 60, reminderTime: null })
  })

  it('corrige la période en cours quand seul le rappel change, même avec des prises (B3)', () => {
    const withPeriods = treatment(
      [period({ times: ['21:00'], reminderOffsetMinutes: 0 })],
      [dose()],
    )
    const input = saisie(withPeriods, { reminderOffsetMinutes: 30, reminderTime: null })

    expect(editionDraft(withPeriods, input, '2026-09-28').change).toBe('edit')
    expect(editionPlan(withPeriods, input, '2026-09-28', IDS)).toEqual({
      treatment: { name: 'Milbemax', type: 'deworming' },
      period: {
        action: 'correct',
        id: TREATMENT,
        gridOriginOn: '2026-07-10',
        firstDueChosen: true,
        fallenDosesAnswer: 'unasked',
        settings: {
          startsOn: '2026-07-10',
          firstDueOn: '2026-07-10',
          endsOn: null,
          frequency: { value: 3, unit: 'month' },
          times: ['21:00'],
          doseQuantity: 1,
          doseUnit: 'tablet',
          reminderOffsetMinutes: 30,
          reminderTime: null,
        },
      },
      doses: [],
    })
  })

  it('corrige de même l’heure du rappel d’un traitement sans heure', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { reminderTime: '07:30' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { reminderTime: '07:30' } })
    expect(plan.doses).toEqual([])
  })

  it('ouvre la nouvelle période avec le rappel saisi quand un autre réglage change aussi', () => {
    const withPeriods = treatment([period({ times: ['21:00'] })], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { doseQuantity: 0.5, reminderOffsetMinutes: 60 }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'open',
      settings: { doseQuantity: 0.5, reminderOffsetMinutes: 60 },
    })
  })

  it('garde le rappel de la période quand la saisie n’en dit rien', () => {
    const withPeriods = treatment(
      [period({ times: ['21:00'], reminderOffsetMinutes: 15, reminderTime: '08:00' })],
      [dose()],
    )

    expect(editionPlan(withPeriods, saisie(withPeriods), '2026-09-28', IDS).period).toBeNull()
    expect(
      editionPlan(withPeriods, saisie(withPeriods, { doseQuantity: 2 }), '2026-09-28', IDS).period,
    ).toMatchObject({ settings: { reminderOffsetMinutes: 15, reminderTime: '08:00' } })
  })
})

describe('editionPlan — nom et type (TR-27)', () => {
  it('corrige le nom et le type sans toucher à la période ni aux prises', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { name: 'Milbemax chat', type: 'medication' }),
      '2026-09-28',
      IDS,
    )

    expect(plan).toEqual({
      treatment: { name: 'Milbemax chat', type: 'medication' },
      period: null,
      doses: [],
    })
  })
})

describe('editionPlan — fréquence, heures, posologie (TR-28)', () => {
  it('corrige les réglages tant qu’aucune prise n’est notée dans la période', () => {
    const withPeriods = treatment([period({ firstDueOn: '2026-10-10', startsOn: '2026-10-10' })])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, {
        frequency: { value: 2, unit: 'week' },
        times: ['20:00', '08:00'],
        doseQuantity: 0.5,
      }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toEqual({
      action: 'correct',
      id: TREATMENT,
      gridOriginOn: '2026-10-10',
      firstDueChosen: false,
      fallenDosesAnswer: 'unasked',
      settings: {
        startsOn: '2026-10-10',
        firstDueOn: '2026-10-10',
        endsOn: null,
        frequency: { value: 2, unit: 'week' },
        times: ['08:00', '20:00'],
        doseQuantity: 0.5,
        doseUnit: 'tablet',
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    expect(plan.doses).toEqual([])
  })

  it('ouvre une nouvelle période aujourd’hui dès qu’une prise est notée, la première dose jamais avant aujourd’hui (Q7)', () => {
    const hebdo = period({
      startsOn: '2026-09-01',
      firstDueOn: '2026-09-01',
      frequency: { value: 1, unit: 'week' },
      doseUnit: 'pipette',
    })
    const withPeriods = treatment([hebdo], [dose({ dueOn: '2026-09-08', givenOn: '2026-09-08' })])
    const input = saisie(withPeriods, { frequency: { value: 15, unit: 'day' } })

    expect(editionDraft(withPeriods, input, '2026-09-29')).toMatchObject({
      change: 'edit',
      nextDose: {
        change: 'first-due',
        proposedOn: '2026-09-29',
        earliest: '2026-09-29',
        latest: null,
        help: { kind: 'calculated-passed', on: '2026-09-23' },
      },
    })
    expect(editionPlan(withPeriods, input, '2026-09-29', IDS).period).toEqual({
      action: 'open',
      id: NEW_PERIOD,
      gridBefore: expect.objectContaining({ frequency: { value: 1, unit: 'week' }, endsOn: null }),
      gridOriginOn: '2026-09-29',
      firstDueChosen: false,
      fallenDosesAnswer: 'unasked',
      settings: {
        startsOn: '2026-09-29',
        firstDueOn: '2026-09-29',
        endsOn: null,
        frequency: { value: 15, unit: 'day' },
        times: [],
        doseQuantity: 1,
        doseUnit: 'pipette',
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
  })

  it('ouvre la nouvelle période à la première dose choisie dans « Prochaine dose »', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { doseQuantity: 0.5, nextDoseOn: '2026-10-20' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'open',
      firstDueChosen: true,
      fallenDosesAnswer: 'unasked',
      settings: { startsOn: '2026-09-28', firstDueOn: '2026-10-20', doseQuantity: 0.5 },
    })
    expect(plan.doses).toEqual([])
  })

  it('ouvre une nouvelle période pour des heures changées, même sans changer la fréquence', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(
      editionPlan(withPeriods, saisie(withPeriods, { times: ['09:00'] }), '2026-09-28', IDS).period,
    ).toMatchObject({ action: 'open' })
  })

  it('refuse une première dose de la nouvelle période avant aujourd’hui ou après la date de fin', () => {
    const withPeriods = treatment([period()], [dose()])
    const changed = { frequency: { value: 1, unit: 'month' } } as const

    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { ...changed, nextDoseOn: '2026-09-27' }),
        '2026-09-28',
      ),
    ).toEqual(['nextDoseOn:tooEarly'])
    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { ...changed, endsOn: '2026-10-15', nextDoseOn: '2026-10-16' }),
        '2026-09-28',
      ),
    ).toEqual(['nextDoseOn:noDoseBeforeEnd'])
  })

  it('refuse une date de fin restée avant la première dose de la nouvelle période', () => {
    const withPeriods = treatment([period({ endsOn: '2026-10-15' })], [dose()])

    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 6, unit: 'month' } }),
        '2026-09-28',
      ),
    ).toEqual(['nextDoseOn:noDoseBeforeEnd'])
  })

  it('corrige la date de fin seule sans ouvrir de période, même avec des prises', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { endsOn: '2026-12-31' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'correct',
      settings: { startsOn: '2026-07-10', firstDueOn: '2026-07-10', endsOn: '2026-12-31' },
    })
  })

  it('refuse une date de fin avant la dernière prise notée, égale acceptée (TR-6)', () => {
    const withPeriods = treatment(
      [period()],
      [dose(), dose({ id: 'd-2', dueOn: '2026-10-10', givenOn: '2026-10-12' })],
    )
    const refus = (endsOn: string) =>
      champsRefuses(withPeriods, saisie(withPeriods, { endsOn }), '2026-10-20')

    expect(refus('2026-10-09')).toEqual(['endsOn:beforeLastDose'])
    expect(refus('2026-10-10')).toEqual([])
    expect(refus('2026-07-09')).toEqual(['endsOn:beforeFirstDose'])
  })

  it('ne corrige que le nom et le type d’un traitement arrêté', () => {
    const withPeriods = treatment([period({ stoppedOn: '2026-08-01' })], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { name: 'Milbemax chat', frequency: { value: 1, unit: 'day' } }),
      '2026-09-28',
      IDS,
    )

    expect(editionDraft(withPeriods, null, '2026-09-28')).toMatchObject({
      change: 'locked',
      nextDose: null,
    })
    expect(plan).toEqual({
      treatment: { name: 'Milbemax chat', type: 'deworming' },
      period: null,
      doses: [],
    })
  })
})

describe('editionPlan — période ouverte par « Modifier », encore sans prise (TR-7)', () => {
  const HEBDO = period({
    startsOn: '2026-09-25',
    firstDueOn: '2026-09-25',
    frequency: { value: 1, unit: 'week' },
  })
  const PRISE_DU_2 = dose({ dueOn: '2026-10-02', givenOn: '2026-10-02' })
  const QUINZAINE = period({
    id: NEW_PERIOD,
    startsOn: '2026-10-02',
    firstDueOn: '2026-10-17',
    frequency: { value: 15, unit: 'day' },
    createdAt: '2026-10-02T09:00:00.000Z',
  })

  it('repropose la première échéance quand la fréquence est corrigée : dernière prise plus la nouvelle fréquence', () => {
    const withPeriods = treatment([HEBDO, QUINZAINE], [PRISE_DU_2])
    const input = saisie(withPeriods, { frequency: { value: 2, unit: 'day' } })

    expect(editionDraft(withPeriods, input, '2026-10-02')).toMatchObject({
      change: 'edit',
      nextDose: {
        change: 'first-due',
        proposedOn: '2026-10-04',
        earliest: '2026-10-02',
        help: { kind: 'calculated', on: '2026-10-04' },
      },
    })
    expect(editionPlan(withPeriods, input, '2026-10-02', IDS)).toMatchObject({
      period: {
        action: 'correct',
        settings: {
          startsOn: '2026-10-02',
          firstDueOn: '2026-10-04',
          frequency: { value: 2, unit: 'day' },
        },
      },
      doses: [],
    })
  })

  function hebdoCorrigeeLe5() {
    const quotidien = period({
      startsOn: '2026-09-30',
      firstDueOn: '2026-09-30',
      frequency: { value: 1, unit: 'day' },
    })
    const hebdo = period({
      id: NEW_PERIOD,
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-09',
      frequency: { value: 1, unit: 'week' },
      createdAt: '2026-10-02T09:00:00.000Z',
    })
    const prises = ['2026-09-30', '2026-10-01', '2026-10-02'].map((day) =>
      dose({ id: day, dueOn: day, givenOn: day }),
    )
    const withPeriods = treatment([quotidien, hebdo], prises)
    const input = saisie(withPeriods, { frequency: { value: 2, unit: 'week' } })
    return { quotidien, hebdo, withPeriods, input }
  }

  it('corrigée un autre jour que son ouverture, garde son début : aucune dose non renseignée nouvelle', () => {
    const { quotidien, hebdo, withPeriods, input } = hebdoCorrigeeLe5()

    expect(editionDraft(withPeriods, input, '2026-10-05').nextDose).toMatchObject({
      earliest: '2026-10-05',
    })
    const plan = editionPlan(withPeriods, input, '2026-10-05', IDS)
    expect(plan.period).toMatchObject({ action: 'correct', settings: { startsOn: '2026-10-02' } })
    const after = viewOf(
      {
        ...withPeriods,
        periods: [quotidien, { ...hebdo, ...(plan.period as { settings: object }).settings }],
      },
      '2026-10-05',
    )
    expect(after.unloggedDoses).toEqual([])
  })

  it.each(['2026-10-02', '2026-10-03', '2026-10-05'])(
    '#799 : corrigée le %s en « toutes les 2 semaines », le 16 est proposé, calculé d’après la dernière prise',
    (today) => {
      const { withPeriods, input } = hebdoCorrigeeLe5()

      expect(editionDraft(withPeriods, input, today).nextDose).toMatchObject({
        proposedOn: '2026-10-16',
        help: { kind: 'calculated', on: '2026-10-16' },
      })
    },
  )

  it('garde la première échéance choisie dans « Prochaine dose » avec la fréquence corrigée', () => {
    const withPeriods = treatment([HEBDO, QUINZAINE], [PRISE_DU_2])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { frequency: { value: 2, unit: 'day' }, nextDoseOn: '2026-10-06' }),
      '2026-10-02',
      IDS,
    )

    expect(plan.period).toMatchObject({ settings: { firstDueOn: '2026-10-06' } })
  })

  it('garde la première échéance quand seule la posologie ou la date de fin change', () => {
    const withPeriods = treatment([HEBDO, QUINZAINE], [PRISE_DU_2])
    const input = saisie(withPeriods, { doseQuantity: 2, endsOn: '2026-12-31' })

    expect(editionDraft(withPeriods, input, '2026-10-02').nextDose).toMatchObject({
      proposedOn: '2026-10-17',
      help: { kind: 'scheduled', on: '2026-10-17' },
    })
    expect(editionPlan(withPeriods, input, '2026-10-02', IDS).period).toMatchObject({
      settings: { firstDueOn: '2026-10-17', doseQuantity: 2 },
    })
  })

  it('refuse une date de fin avant la première échéance reproposée', () => {
    const withPeriods = treatment([HEBDO, QUINZAINE], [PRISE_DU_2])

    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 1, unit: 'month' }, endsOn: '2026-10-20' }),
        '2026-10-02',
      ),
    ).toEqual(['nextDoseOn:noDoseBeforeEnd'])
  })

  it('à plusieurs heures, repropose d’après les prises du jour (Q24)', () => {
    const matinEtSoir = period({
      startsOn: '2026-09-25',
      firstDueOn: '2026-09-25',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const neufHeures = period({
      ...matinEtSoir,
      id: NEW_PERIOD,
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-02',
      times: ['09:00', '21:00'],
      createdAt: '2026-10-02T09:00:00.000Z',
    })
    const withPeriods = treatment(
      [matinEtSoir, neufHeures],
      [
        dose({
          dueOn: '2026-10-02',
          dueTime: '08:00',
          givenOn: '2026-10-02',
        }),
      ],
    )

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { times: ['09:00', '14:00', '21:00'] }),
        '2026-10-02',
      ).nextDose,
    ).toMatchObject({ proposedOn: '2026-10-02' })
    expect(
      editionDraft(withPeriods, saisie(withPeriods, { times: ['09:00'] }), '2026-10-02').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-03' })
  })

  it('ne repropose rien pour une période ouverte par « Reprendre » : sa première prise a été saisie', () => {
    const arretee = { ...HEBDO, stoppedOn: '2026-10-02' }
    const finie = { ...HEBDO, endsOn: '2026-10-01' }
    const input = (withPeriods: TreatmentWithPeriods) =>
      saisie(withPeriods, { frequency: { value: 2, unit: 'day' } })

    for (const precedente of [arretee, finie]) {
      const withPeriods = treatment([precedente, QUINZAINE], [])

      expect(editionDraft(withPeriods, input(withPeriods), '2026-10-02').nextDose).toMatchObject({
        proposedOn: '2026-10-17',
      })
    }
  })
})

describe('editionPlan — correction d’une période qui n’a plus qu’un décalage (TR-28)', () => {
  const vendredi = period({
    startsOn: '2026-10-16',
    firstDueOn: '2026-10-16',
    frequency: { value: 1, unit: 'week' },
  })
  const decalage = dose({
    id: 'decalage',
    dueOn: '2026-10-16',
    givenOn: null,
    status: 'shift',
    targetOn: '2026-10-19',
  })
  const withPeriods = treatment([vendredi], [decalage])

  it.each([
    ['la posologie seule', { doseQuantity: 0.5 }],
    ['la date de fin seule', { endsOn: '2026-12-31' }],
  ])('corrigée sur %s, la grille ne change pas : le décalage reste', (_, changes) => {
    const plan = editionPlan(withPeriods, saisie(withPeriods, changes), '2026-10-12', IDS)

    expect(plan.period).toMatchObject({ action: 'correct', settings: changes })
    expect(plan.doses).toEqual([])
    const corrected = treatment([{ ...vendredi, ...changes }], [decalage])
    expect(
      viewOf(corrected, '2026-10-12')
        .upcoming({ limit: 3 })
        .map(({ dueOn }) => dueOn),
    ).toEqual(['2026-10-16', '2026-10-26', '2026-11-02'])
  })

  it.each([
    ['2026-10-25', ['2026-10-25', '2026-11-01', '2026-11-08']],
    ['2026-10-14', ['2026-10-14', '2026-10-21', '2026-10-28']],
  ])(
    'corrigée au %s, la grille repart de la date choisie : le décalage est supprimé',
    (on, dues) => {
      const plan = editionPlan(
        withPeriods,
        saisie(withPeriods, { nextDoseOn: on }),
        '2026-10-12',
        IDS,
      )

      expect(plan.period).toMatchObject({ action: 'correct', settings: { firstDueOn: on } })
      expect(plan.doses).toEqual([])
      const corrected = treatment(
        [
          {
            ...vendredi,
            startsOn: on < vendredi.startsOn ? on : vendredi.startsOn,
            firstDueOn: on,
            gridOriginOn: on,
          },
        ],
        [],
      )
      expect(
        viewOf(corrected, '2026-10-12')
          .upcoming({ limit: 3 })
          .map(({ dueOn }) => dueOn),
      ).toEqual(dues)
    },
  )
})

describe('editionPlan — période qui n’a que des prises en plus (TR-28)', () => {
  const vendredi = period({
    startsOn: '2026-10-16',
    firstDueOn: '2026-10-16',
    frequency: { value: 1, unit: 'week' },
  })
  const enPlus = dose({
    id: 'en-plus',
    dueOn: '2026-10-09',
    givenOn: '2026-10-09',
    status: 'extra',
  })
  const withPeriods = treatment([vendredi], [enPlus])

  it('se corrige comme une période sans prise, et garde sa prise en plus', () => {
    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { nextDoseOn: '2026-10-23' }),
      '2026-10-12',
      IDS,
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { firstDueOn: '2026-10-23' } })
    expect(plan.doses).toEqual([])
  })

  it('avec un décalage resté seul, seul le décalage part', () => {
    const decalage = dose({
      id: 'decalage',
      dueOn: '2026-10-16',
      givenOn: null,
      status: 'shift',
      targetOn: '2026-10-19',
    })
    const both = treatment([vendredi], [enPlus, decalage])

    const plan = editionPlan(both, saisie(both, { nextDoseOn: '2026-10-23' }), '2026-10-12', IDS)

    expect(plan.doses).toEqual([])
  })
})

describe('editionPlan — « Prochaine dose » (TR-7, TR-9)', () => {
  it('propose la prochaine dose calculée d’après la dernière prise, avec les bornes du moteur', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(editionDraft(withPeriods, null, '2026-09-28').nextDose).toEqual({
      change: 'move',
      proposedOn: '2026-10-10',
      earliest: '2026-09-28',
      latest: null,
      refusal: null,
      help: { kind: 'calculated', on: '2026-10-10' },
      shift: null,
      shiftInitial: true,
    })
  })

  it('reporte la dose par une ligne « Reportée », sans période nouvelle (Q17)', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { nextDoseOn: '2026-10-14' }),
      '2026-09-28',
      IDS,
    )

    expect(plan).toEqual({
      treatment: { name: 'Milbemax', type: 'deworming' },
      period: null,
      doses: [
        {
          action: 'create',
          id: NEW_DOSE,
          dose: {
            periodId: TREATMENT,
            dueOn: '2026-10-10',
            dueTime: null,
            givenOn: null,
            status: 'postponed',
            targetOn: '2026-10-14',
            previousTargetOn: null,
            previousTargetTime: null,
            dueRank: 1,
          },
        },
        {
          action: 'create',
          id: NEW_SHIFT,
          dose: {
            periodId: TREATMENT,
            dueOn: '2026-10-10',
            dueTime: null,
            givenOn: null,
            status: 'shift',
            targetOn: '2026-10-14',
            previousTargetOn: null,
            previousTargetTime: null,
            dueRank: null,
          },
        },
      ],
    })
  })

  it('avance la dose par la même ligne, d’après son échéance d’origine', () => {
    const withPeriods = treatment([period()], [dose()])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { nextDoseOn: '2026-10-08' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-10', targetOn: '2026-10-08' } },
      { action: 'create', dose: { status: 'shift', targetOn: '2026-10-08' } },
    ])
  })

  const REPORT = dose({
    id: 'd-2',
    dueOn: '2026-10-10',
    givenOn: null,
    status: 'postponed',
    targetOn: '2026-10-14',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  })
  const REPORT_SHIFT = { ...REPORT, id: 'd-2s', status: 'shift' as const }

  it('garde en aide la date calculée d’une dose déjà reportée, et réécrit sa ligne (Q18)', () => {
    const withPeriods = treatment([period()], [dose(), REPORT, REPORT_SHIFT])

    expect(editionDraft(withPeriods, null, '2026-09-28').nextDose).toMatchObject({
      proposedOn: '2026-10-14',
      help: { kind: 'calculated', on: '2026-10-10' },
    })
    expect(
      editionPlan(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-10-18' }), '2026-09-28', IDS)
        .doses,
    ).toMatchObject([
      { action: 'rewrite', id: 'd-2', dose: { dueOn: '2026-10-10', targetOn: '2026-10-18' } },
      { action: 'rewrite', id: 'd-2s', dose: { status: 'shift', targetOn: '2026-10-18' } },
    ])
  })

  it('supprime la ligne et son décalage quand la dose revient à sa date d’origine', () => {
    const withPeriods = treatment([period()], [dose(), REPORT, REPORT_SHIFT])

    expect(
      editionPlan(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-10-10' }), '2026-09-28', IDS)
        .doses,
    ).toEqual([
      { action: 'delete', id: 'd-2' },
      { action: 'delete', id: 'd-2s' },
    ])
  })

  it('n’écrit rien quand « Prochaine dose » garde la date proposée', () => {
    const withPeriods = treatment([period()], [dose(), REPORT])

    expect(
      editionPlan(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-10-14' }), '2026-09-28', IDS)
        .doses,
    ).toEqual([])
  })

  it('refuse une prochaine dose après la date de fin et n’écrit rien (Q20)', () => {
    const withPeriods = treatment(
      [
        period({
          startsOn: '2026-09-26',
          firstDueOn: '2026-09-26',
          frequency: { value: 1, unit: 'week' },
          endsOn: '2026-10-10',
        }),
      ],
      [dose({ dueOn: '2026-09-26', givenOn: '2026-09-26' })],
    )
    const input = saisie(withPeriods, { nextDoseOn: '2026-11-01' })

    expect(champsRefuses(withPeriods, input, '2026-09-28')).toEqual(['nextDoseOn:afterEnd'])
    expect(() => editionPlan(withPeriods, input, '2026-09-28', IDS)).toThrow(ZodError)
  })

  it('refuse, case décochée, une prochaine dose au-delà de la date de fin comme après la fin, non comme après la dose suivante', () => {
    const withPeriods = treatment(
      [
        period({
          startsOn: '2026-09-26',
          firstDueOn: '2026-09-26',
          frequency: { value: 1, unit: 'week' },
          endsOn: '2026-10-10',
        }),
      ],
      [dose({ dueOn: '2026-09-26', givenOn: '2026-09-26' })],
    )
    const input = saisie(withPeriods, { nextDoseOn: '2026-11-01', shiftsFollowing: false })

    expect(champsRefuses(withPeriods, input, '2026-09-28')).toEqual(['nextDoseOn:afterEnd'])
  })

  it('accepte une prochaine dose au-delà de l’ancienne fin quand la date de fin change dans la même saisie', () => {
    const withPeriods = treatment(
      [
        period({
          frequency: { value: 1, unit: 'week' },
          startsOn: '2026-09-26',
          firstDueOn: '2026-09-26',
          endsOn: '2026-10-10',
        }),
      ],
      [dose({ dueOn: '2026-09-26', givenOn: '2026-09-26' })],
    )

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { endsOn: '2026-11-05', nextDoseOn: '2026-10-08' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { endsOn: '2026-11-05' } })
    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-03', targetOn: '2026-10-08' } },
      { action: 'create', dose: { status: 'shift', targetOn: '2026-10-08' } },
    ])
  })

  it('refuse une prochaine dose avant la borne du moteur', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(
      champsRefuses(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-09-27' }), '2026-09-28'),
    ).toEqual(['nextDoseOn:tooEarly'])
  })

  it('corrige la première échéance d’une période sans prise, sans ligne de déplacement', () => {
    const withPeriods = treatment([period({ startsOn: '2026-10-10', firstDueOn: '2026-10-10' })])

    expect(editionDraft(withPeriods, null, '2026-09-28').nextDose).toEqual({
      change: 'first-due',
      proposedOn: '2026-10-10',
      earliest: '2026-09-28',
      latest: null,
      refusal: null,
      help: null,
      shift: null,
      shiftInitial: true,
    })
    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { nextDoseOn: '2026-10-02' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'correct',
      settings: { startsOn: '2026-10-02', firstDueOn: '2026-10-02' },
    })
    expect(plan.doses).toEqual([])
  })

  it('ne corrige que le nom et le type d’un traitement fini par sa date de fin : on le reprend par « Reprendre »', () => {
    const withPeriods = treatment([period({ endsOn: '2026-08-01' })], [dose()])

    expect(editionDraft(withPeriods, null, '2026-09-28')).toMatchObject({
      change: 'locked',
      nextDose: null,
    })
    expect(
      editionPlan(
        withPeriods,
        saisie(withPeriods, {
          name: 'Milbemax chat',
          frequency: { value: 1, unit: 'day' },
          endsOn: '2026-12-31',
        }),
        '2026-09-28',
        IDS,
      ),
    ).toEqual({ treatment: { name: 'Milbemax chat', type: 'deworming' }, period: null, doses: [] })
  })

  it('verrouille aussi un traitement dont la dernière échéance avant la fin est notée', () => {
    const withPeriods = treatment(
      [period({ frequency: { value: 1, unit: 'week' }, endsOn: '2026-10-01' })],
      [dose({ dueOn: '2026-09-25', givenOn: '2026-09-25' })],
    )

    expect(editionDraft(withPeriods, null, '2026-09-28').change).toBe('locked')
  })

  it('donne la raison du moteur quand une dose plus lointaine est déjà reportée (Q26)', () => {
    const quotidien = period({
      frequency: { value: 1, unit: 'day' },
      startsOn: '2026-09-20',
      firstDueOn: '2026-09-20',
    })
    const withPeriods = treatment(
      [quotidien],
      [
        dose({
          id: 'd-loin',
          dueOn: '2026-10-05',
          givenOn: null,
          status: 'postponed',
          targetOn: '2026-10-07',
        }),
      ],
    )

    const draft = editionDraft(withPeriods, null, '2026-09-28')

    expect(draft.nextDose).toMatchObject({ change: 'move', refusal: { reason: 'later-line' } })
    expect(
      champsRefuses(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-09-30' }), '2026-09-28'),
    ).toEqual(['nextDoseOn:refused'])
  })

  it('supprime avec l’écriture les déplacements que le moteur dit sans effet', () => {
    const withPeriods = treatment([period()], [dose(), dose({ ...REPORT, id: 'd-revenu' })])

    const plan = editionPlan(withPeriods, saisie(withPeriods), '2026-09-28', IDS)

    expect(plan.doses).toEqual([])
  })
})

describe('editionDraft — aides de « Prochaine dose »', () => {
  it('dit la date calculée déjà passée quand un mensuel du 7 passe à l’hebdomadaire le 17 (Q29)', () => {
    const mensuel = period({
      startsOn: '2026-09-07',
      firstDueOn: '2026-09-07',
      frequency: { value: 1, unit: 'month' },
    })
    const withPeriods = treatment([mensuel], [dose({ dueOn: '2026-09-07', givenOn: '2026-09-07' })])

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 1, unit: 'week' } }),
        '2026-09-17',
      ).nextDose,
    ).toMatchObject({
      proposedOn: '2026-09-17',
      help: { kind: 'calculated-passed', on: '2026-09-14' },
    })
  })

  it('dit « prévue » et non « calculée » quand la prochaine dose est l’arrivée d’un report (R9.2)', () => {
    const mensuel = period({
      startsOn: '2026-09-07',
      firstDueOn: '2026-09-07',
      frequency: { value: 1, unit: 'month' },
    })
    const withPeriods = treatment(
      [mensuel],
      [
        dose({ dueOn: '2026-09-07', givenOn: '2026-09-07' }),
        dose({
          id: 'report',
          dueOn: '2026-10-07',
          givenOn: null,
          status: 'postponed',
          targetOn: '2026-10-14',
        }),
      ],
    )

    expect(
      editionDraft(withPeriods, saisie(withPeriods, { times: ['09:00'] }), '2026-10-08').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-14', help: { kind: 'scheduled', on: '2026-10-14' } })
  })

  it('garde l’aide courte quand la dernière journée notée est incomplète : la date calculée est aujourd’hui (Q29)', () => {
    const matinEtSoir = period({
      startsOn: '2026-09-20',
      firstDueOn: '2026-09-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const withPeriods = treatment(
      [matinEtSoir],
      [
        dose({
          dueOn: '2026-10-01',
          dueTime: '08:00',
          givenOn: '2026-10-01',
        }),
      ],
    )

    expect(
      editionDraft(withPeriods, saisie(withPeriods, { times: ['09:00', '21:00'] }), '2026-10-02')
        .nextDose,
    ).toMatchObject({ proposedOn: '2026-10-02', help: { kind: 'today' } })
  })

  it('garde la date d’une dose en retard, sans prise notée, et le dit', () => {
    const hebdo = treatment([
      period({
        startsOn: '2026-09-27',
        firstDueOn: '2026-09-27',
        frequency: { value: 1, unit: 'week' },
      }),
    ])

    expect(editionDraft(hebdo, null, '2026-10-02').nextDose).toMatchObject({
      proposedOn: '2026-09-27',
      earliest: '2026-10-02',
      help: { kind: 'overdue', since: '2026-09-27' },
    })
    expect(
      editionPlan(hebdo, saisie(hebdo, { nextDoseOn: '2026-09-27' }), '2026-10-02', IDS),
    ).toEqual({
      treatment: { name: 'Milbemax', type: 'deworming' },
      period: null,
      doses: [],
    })
    expect(champsRefuses(hebdo, saisie(hebdo, { nextDoseOn: '2026-10-01' }), '2026-10-02')).toEqual(
      ['nextDoseOn:tooEarly'],
    )
  })

  it('garde la date d’une dose en retard après une prise, n’écrit rien sans y toucher, et n’accepte qu’une date à partir d’aujourd’hui', () => {
    const withPeriods = treatment(
      [
        period({
          startsOn: '2026-09-13',
          firstDueOn: '2026-09-13',
          frequency: { value: 1, unit: 'week' },
        }),
      ],
      [dose({ dueOn: '2026-09-20', givenOn: '2026-09-20' })],
    )

    expect(editionDraft(withPeriods, null, '2026-10-02').nextDose).toMatchObject({
      change: 'move',
      proposedOn: '2026-09-27',
      earliest: '2026-10-02',
      help: { kind: 'overdue', since: '2026-09-27' },
    })
    expect(
      editionPlan(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-09-27' }), '2026-10-02', IDS)
        .doses,
    ).toEqual([])
    expect(
      champsRefuses(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-10-01' }), '2026-10-02'),
    ).toEqual(['nextDoseOn:tooEarly'])
    expect(
      editionPlan(withPeriods, saisie(withPeriods, { nextDoseOn: '2026-10-02' }), '2026-10-02', IDS)
        .doses,
    ).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-09-27', targetOn: '2026-10-02' } },
      { action: 'create', dose: { status: 'shift', targetOn: '2026-10-02' } },
    ])
  })

  it('dit la date calculée déjà passée quand aujourd’hui est proposé, à plusieurs heures aussi (V1 quater)', () => {
    const matinEtSoir = period({
      startsOn: '2026-09-20',
      firstDueOn: '2026-09-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const withPeriods = treatment(
      [matinEtSoir],
      [
        dose({
          id: 'm',
          dueOn: '2026-09-27',
          dueTime: '08:00',
          givenOn: '2026-09-27',
        }),
        dose({
          id: 's',
          dueOn: '2026-09-27',
          dueTime: '20:00',
          givenOn: '2026-09-27',
        }),
      ],
    )

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 2, unit: 'day' } }),
        '2026-10-02',
      ).nextDose,
    ).toMatchObject({
      proposedOn: '2026-10-02',
      help: { kind: 'calculated-passed', on: '2026-09-29' },
    })
  })

  it('dit seulement qu’aujourd’hui est proposé quand la dose du jour ouvre la nouvelle période (Q36)', () => {
    const hebdo = period({
      startsOn: '2026-09-14',
      firstDueOn: '2026-09-14',
      frequency: { value: 1, unit: 'week' },
    })
    const withPeriods = treatment([hebdo], [dose({ dueOn: '2026-09-21', givenOn: '2026-09-21' })])

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 2, unit: 'week' } }),
        '2026-09-28',
      ).nextDose,
    ).toMatchObject({ proposedOn: '2026-09-28', help: { kind: 'today' } })
  })

  it('garde « calculée d’après la dernière prise » quand seule la posologie change (Q37)', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(
      editionDraft(withPeriods, saisie(withPeriods, { doseQuantity: 0.5 }), '2026-09-28').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-10', help: { kind: 'scheduled', on: '2026-10-10' } })
  })

  it('dit « prochaine dose prévue » pour un report en vigueur et pour un mensuel du 31, posologie seule changée (Q37)', () => {
    const hebdo = period({
      startsOn: '2026-09-25',
      firstDueOn: '2026-09-25',
      frequency: { value: 1, unit: 'week' },
    })
    const reportee = treatment(
      [hebdo],
      [
        dose({ dueOn: '2026-10-02', givenOn: '2026-10-02' }),
        dose({
          id: 'r',
          dueOn: '2026-10-09',
          givenOn: null,
          status: 'postponed',
          targetOn: '2026-10-20',
        }),
        dose({
          id: 'rs',
          dueOn: '2026-10-09',
          givenOn: null,
          status: 'shift',
          targetOn: '2026-10-20',
        }),
      ],
    )
    const du31 = treatment(
      [
        period({
          startsOn: '2026-01-31',
          firstDueOn: '2026-01-31',
          frequency: { value: 1, unit: 'month' },
        }),
      ],
      [
        dose({ id: 'a', dueOn: '2026-01-31', givenOn: '2026-01-31' }),
        dose({ id: 'b', dueOn: '2026-02-28', givenOn: '2026-02-28' }),
      ],
    )

    expect(
      editionDraft(reportee, saisie(reportee, { doseQuantity: 0.5 }), '2026-10-03').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-20', help: { kind: 'scheduled', on: '2026-10-20' } })
    expect(
      editionDraft(du31, saisie(du31, { doseQuantity: 0.5 }), '2026-03-01').nextDose,
    ).toMatchObject({ proposedOn: '2026-03-31', help: { kind: 'scheduled', on: '2026-03-31' } })
  })

  it('tous les 2 jours à 8 h et 20 h, 8 h du 3 donnée le 2, posologie changée le 2 : prochaine dose le 3 (#656)', () => {
    const matinEtSoir = period({
      startsOn: '2026-10-01',
      firstDueOn: '2026-10-01',
      frequency: { value: 2, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const prise = (id: string, dueOn: string, dueTime: string, givenOn: string) =>
      dose({ id, dueOn, dueTime, givenOn })
    const withPeriods = treatment(
      [matinEtSoir],
      [
        prise('a', '2026-10-01', '08:00', '2026-10-01'),
        prise('b', '2026-10-01', '20:00', '2026-10-01'),
        prise('c', '2026-10-03', '08:00', '2026-10-02'),
      ],
    )

    expect(
      editionDraft(withPeriods, saisie(withPeriods, { doseQuantity: 0.5 }), '2026-10-02').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-03', help: { kind: 'scheduled', on: '2026-10-03' } })
  })

  it.each([
    ['les heures passent à 9 h et 21 h', { times: ['09:00', '21:00'] }, null],
    [
      'la fréquence passe à tous les 3 jours',
      { frequency: { value: 3, unit: 'day' as const } },
      '2026-10-03',
    ],
  ])(
    'tous les 2 jours à 8 h et 20 h, 8 h du 3 donnée le 2, %s le 2 : prochaine dose le 3 (G24, #711)',
    (_, changes, gridOriginOn) => {
      const matinEtSoir = period({
        startsOn: '2026-10-01',
        firstDueOn: '2026-10-01',
        frequency: { value: 2, unit: 'day' },
        times: ['08:00', '20:00'],
      })
      const prise = (id: string, dueOn: string, dueTime: string, givenOn: string) =>
        dose({ id, dueOn, dueTime, givenOn })
      const withPeriods = treatment(
        [matinEtSoir],
        [
          prise('a', '2026-10-01', '08:00', '2026-10-01'),
          prise('b', '2026-10-01', '20:00', '2026-10-01'),
          prise('c', '2026-10-03', '08:00', '2026-10-02'),
        ],
      )
      const saisie711 = saisie(withPeriods, changes)

      expect(editionDraft(withPeriods, saisie711, '2026-10-02').nextDose).toMatchObject({
        proposedOn: '2026-10-03',
        help: { kind: 'scheduled', on: '2026-10-03' },
      })
      expect(editionPlan(withPeriods, saisie711, '2026-10-02', IDS).period).toMatchObject({
        action: 'open',
        gridOriginOn,
        settings: { startsOn: '2026-10-02', firstDueOn: '2026-10-03' },
      })
    },
  )

  it('tous les 2 jours à 8 h et 20 h, 8 h du 3 donnée le 2, heure passée à 9 h seule : le 3, entamé, garde ses heures, prochaine dose le 3, champ libre (décision du 15 octobre 2026)', () => {
    const matinEtSoir = period({
      startsOn: '2026-10-01',
      firstDueOn: '2026-10-01',
      frequency: { value: 2, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const prise = (id: string, dueOn: string, dueTime: string, givenOn: string) =>
      dose({ id, dueOn, dueTime, givenOn })
    const withPeriods = treatment(
      [matinEtSoir],
      [
        prise('a', '2026-10-01', '08:00', '2026-10-01'),
        prise('b', '2026-10-01', '20:00', '2026-10-01'),
        prise('c', '2026-10-03', '08:00', '2026-10-02'),
      ],
    )

    expect(
      editionDraft(withPeriods, saisie(withPeriods, { times: ['09:00'] }), '2026-10-02').nextDose,
    ).toMatchObject({ proposedOn: '2026-10-03', refusal: null, help: { kind: 'scheduled' } })
  })

  it.each(['2026-10-02', '2026-10-04'])(
    'tous les 2 jours, dose du 3 reportée seule au 4, posologie changée le %s : prochaine dose le 4, puis 5 et 7 (G23, #692)',
    (today) => {
      const tousLes2Jours = period({
        startsOn: '2026-10-01',
        firstDueOn: '2026-10-01',
        frequency: { value: 2, unit: 'day' },
      })
      const withPeriods = treatment(
        [tousLes2Jours],
        [
          dose({ dueOn: '2026-10-01', givenOn: '2026-10-01' }),
          dose({
            id: 'r',
            dueOn: '2026-10-03',
            givenOn: null,
            status: 'postponed',
            targetOn: '2026-10-04',
          }),
        ],
      )
      const changes = saisie(withPeriods, { doseQuantity: 0.5 })

      expect(editionDraft(withPeriods, changes, today).nextDose).toMatchObject({
        proposedOn: '2026-10-04',
        help: { kind: 'scheduled', on: '2026-10-04' },
      })
      const plan = editionPlan(withPeriods, changes, today, IDS)
      expect(plan.period).toMatchObject({
        action: 'open',
        gridOriginOn: null,
        settings: { startsOn: today, firstDueOn: '2026-10-04' },
      })
      const opened = period({
        ...tousLes2Jours,
        id: NEW_PERIOD,
        startsOn: today,
        firstDueOn: '2026-10-04',
        gridOriginOn: null,
        doseQuantity: 0.5,
        createdAt: `${today}T09:00:00.000Z`,
      })
      expect(
        viewOf(treatment([tousLes2Jours, opened], withPeriods.doses), today)
          .upcoming({ limit: 3 })
          .map(({ dueOn }) => dueOn),
      ).toEqual(['2026-10-04', '2026-10-05', '2026-10-07'])
    },
  )

  it('mensuel du 31, posologie changée le 20 févr. : la nouvelle période hérite le 31 comme origine de la grille', () => {
    const du31 = treatment(
      [
        period({
          startsOn: '2027-01-31',
          firstDueOn: '2027-01-31',
          frequency: { value: 1, unit: 'month' },
        }),
      ],
      [dose({ dueOn: '2027-01-31', givenOn: '2027-01-31' })],
    )

    expect(
      editionPlan(du31, saisie(du31, { doseQuantity: 0.5 }), '2027-02-20', IDS).period,
    ).toMatchObject({
      action: 'open',
      gridOriginOn: null,
      settings: { startsOn: '2027-02-20', firstDueOn: '2027-02-28' },
    })
    expect(
      editionPlan(
        du31,
        saisie(du31, { doseQuantity: 0.5, nextDoseOn: '2027-03-02' }),
        '2027-02-20',
        IDS,
      ).period,
    ).toMatchObject({ gridOriginOn: '2027-03-02', settings: { firstDueOn: '2027-03-02' } })
  })

  it('ne dit pas « calculée d’après la dernière prise » pour une période ouverte un jour à prises notées puis corrigée plus tard', () => {
    const matinEtSoir = period({
      startsOn: '2026-09-20',
      firstDueOn: '2026-09-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const ouverte = period({
      ...matinEtSoir,
      id: NEW_PERIOD,
      startsOn: '2026-10-01',
      firstDueOn: '2026-10-01',
      times: ['09:00', '21:00'],
      createdAt: '2026-10-01T09:00:00.000Z',
    })
    const withPeriods = treatment(
      [matinEtSoir, ouverte],
      [
        dose({
          dueOn: '2026-10-01',
          dueTime: '08:00',
          givenOn: '2026-10-01',
        }),
      ],
    )

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { times: ['10:00', '22:00'], pastDues: 'drop' }),
        '2026-10-03',
      ).nextDose,
    ).toMatchObject({ proposedOn: '2026-10-03', help: { kind: 'today' } })
  })

  it('garde la dose en retard quand seule la posologie change, en disant depuis quand elle est en retard (Q37)', () => {
    const hebdo = period({
      startsOn: '2026-09-14',
      firstDueOn: '2026-09-14',
      frequency: { value: 1, unit: 'week' },
    })
    const withPeriods = treatment([hebdo], [dose({ dueOn: '2026-09-14', givenOn: '2026-09-14' })])

    const { nextDose } = editionDraft(
      withPeriods,
      saisie(withPeriods, { doseQuantity: 0.5 }),
      '2026-09-30',
    )

    expect(nextDose).toMatchObject({ proposedOn: '2026-09-28' })
    expect(nextDose?.help).toEqual({ kind: 'overdue', since: '2026-09-28' })
  })

  it('garde l’aide courte quand la date calculée est aujourd’hui ou plus tard', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(
      editionDraft(
        withPeriods,
        saisie(withPeriods, { frequency: { value: 6, unit: 'month' } }),
        '2026-09-28',
      ).nextDose,
    ).toMatchObject({ proposedOn: '2027-01-10', help: { kind: 'calculated', on: '2027-01-10' } })
  })
})

describe('editionPlan — date de fin et report en vigueur', () => {
  const REPORTEE = dose({
    id: 'd-report',
    dueOn: '2026-10-10',
    givenOn: null,
    status: 'postponed',
    targetOn: '2026-10-14',
  })
  const AVANCEE = { ...REPORTEE, targetOn: '2026-10-08' }
  const DECALAGE = { ...REPORTEE, id: 'd-shift', status: 'shift' as const }

  it('refuse une date de fin avant l’arrivée d’un report, sans rien écrire', () => {
    const withPeriods = treatment([period()], [dose(), REPORTEE])
    const input = saisie(withPeriods, { endsOn: '2026-10-12', nextDoseOn: '2026-10-14' })

    expect(editionDraft(withPeriods, input, '2026-09-28').nextDose).toMatchObject({
      change: 'move',
      proposedOn: '2026-10-14',
      latest: '2026-10-12',
    })
    expect(champsRefuses(withPeriods, input, '2026-09-28')).toEqual(['endsOn:beforePostponedDose'])
    expect(() => editionPlan(withPeriods, input, '2026-09-28', IDS)).toThrow(ZodError)
  })

  it('refuse de même une date de fin avant l’arrivée d’une dose avancée', () => {
    const withPeriods = treatment([period()], [dose(), AVANCEE])

    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { endsOn: '2026-10-05', nextDoseOn: null }),
        '2026-09-28',
      ),
    ).toEqual(['endsOn:beforeAdvancedDose'])
  })

  it('accepte la date de fin quand « Prochaine dose » est remise avant elle dans la même saisie', () => {
    const withPeriods = treatment([period()], [dose(), REPORTEE, DECALAGE])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { endsOn: '2026-10-12', nextDoseOn: '2026-10-11' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { endsOn: '2026-10-12' } })
    expect(plan.doses).toMatchObject([
      {
        action: 'rewrite',
        id: 'd-report',
        dose: { dueOn: '2026-10-10', targetOn: '2026-10-11' },
      },
      { action: 'rewrite', id: 'd-shift', dose: { status: 'shift', targetOn: '2026-10-11' } },
    ])
  })

  it('compare la date de fin au report le plus lointain de la période, même quand ce n’est pas la prochaine dose (G14)', () => {
    const hebdo = period({
      startsOn: '2026-09-25',
      firstDueOn: '2026-09-25',
      frequency: { value: 1, unit: 'week' },
    })
    const withPeriods = treatment(
      [hebdo],
      [
        dose({
          id: 'ancienne',
          dueOn: '2026-09-25',
          givenOn: '2026-09-25',
        }),
        dose({ ...REPORTEE, dueOn: '2026-10-09', targetOn: '2026-10-20' }),
      ],
    )

    expect(editionDraft(withPeriods, null, '2026-10-03')).toMatchObject({
      nextDose: { proposedOn: '2026-10-02' },
      farthestMove: { arrivesOn: '2026-10-20', advanced: false },
    })
    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { endsOn: '2026-10-15', nextDoseOn: null }),
        '2026-10-03',
      ),
    ).toEqual(['endsOn:beforeFarPostponedDose'])
    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { endsOn: '2026-10-20', nextDoseOn: null }),
        '2026-10-03',
      ),
    ).toEqual([])
  })

  it('ne compare plus la date de fin à un report de l’ancienne période quand la saisie en ouvre une nouvelle', () => {
    const hebdo = period({
      startsOn: '2026-09-25',
      firstDueOn: '2026-09-25',
      frequency: { value: 1, unit: 'week' },
    })
    const withPeriods = treatment(
      [hebdo],
      [
        dose({ dueOn: '2026-10-02', givenOn: '2026-10-02' }),
        dose({ ...REPORTEE, dueOn: '2026-10-09', targetOn: '2026-10-20' }),
      ],
    )
    const input = saisie(withPeriods, {
      frequency: { value: 2, unit: 'week' },
      endsOn: '2026-10-15',
      nextDoseOn: '2026-10-10',
    })

    expect(champsRefuses(withPeriods, input, '2026-10-03')).toEqual([])
    expect(editionPlan(withPeriods, input, '2026-10-03', IDS).period).toMatchObject({
      action: 'open',
      settings: { firstDueOn: '2026-10-10', endsOn: '2026-10-15' },
    })
  })

  it('accepte une date de fin le jour d’arrivée du report', () => {
    const withPeriods = treatment([period()], [dose(), REPORTEE])

    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { endsOn: '2026-10-14', nextDoseOn: '2026-10-14' }),
        '2026-09-28',
      ),
    ).toEqual([])
  })
})

describe('editionPlan — échéances tombées d’une période sans prise', () => {
  const TOUS_LES_2_JOURS = period({
    startsOn: '2026-10-02',
    firstDueOn: '2026-10-03',
    frequency: { value: 2, unit: 'day' },
  })
  const TODAY = '2026-10-08'
  const TROIS_JOURS = { frequency: { value: 3, unit: 'day' } } as const

  function jours(dues: { dueOn: string; dueTime: string | null }[]): string[] {
    return dues.map(({ dueOn, dueTime }) => (dueTime === null ? dueOn : `${dueOn} ${dueTime}`))
  }

  function apres(withPeriods: TreatmentWithPeriods, plan: ReturnType<typeof editionPlan>) {
    const { period: write } = plan
    if (write === null) return viewOf(withPeriods, TODAY)
    const [current] = withPeriods.periods.slice(-1)
    const periods =
      write.action === 'open'
        ? [
            ...withPeriods.periods,
            {
              ...current!,
              ...write.settings,
              gridOriginOn: write.gridOriginOn,
              firstDueChosen: write.firstDueChosen,
              fallenDosesAnswer: write.fallenDosesAnswer,
              id: write.id,
              createdAt: `${TODAY}T10:00:00.000Z`,
            },
          ]
        : [
            ...withPeriods.periods.slice(0, -1),
            {
              ...current!,
              ...write.settings,
              gridOriginOn: write.gridOriginOn,
              firstDueChosen: write.firstDueChosen,
              fallenDosesAnswer: write.fallenDosesAnswer,
            },
          ]
    return viewOf({ ...withPeriods, periods }, TODAY)
  }

  it('annonce les échéances tombées et ne décide pas seule', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const input = saisie(withPeriods, TROIS_JOURS)

    expect(jours(editionDraft(withPeriods, input, TODAY).pastDues)).toEqual([
      '2026-10-03',
      '2026-10-05',
      '2026-10-07',
    ])
    expect(champsRefuses(withPeriods, input, TODAY)).toEqual(['pastDues:required'])
    expect(() => editionPlan(withPeriods, input, TODAY, IDS)).toThrow(ZodError)
  })

  it('« Elles restent à renseigner » ouvre une période aujourd’hui : les trois doses restent à renseigner', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'keep' }),
      TODAY,
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'open',
      firstDueChosen: false,
      fallenDosesAnswer: 'stay-unlogged',
      settings: { startsOn: TODAY, firstDueOn: TODAY, frequency: { value: 3, unit: 'day' } },
    })
    const schedule = apres(withPeriods, plan)
    expect(jours(schedule.unloggedDoses)).toEqual(['2026-10-03', '2026-10-05', '2026-10-07'])
    expect(jours(schedule.currentDoses)).toEqual([TODAY])
  })

  it('« Elles n’étaient pas à donner » corrige la période : plus rien à renseigner, première échéance aujourd’hui', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])

    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'drop' }),
      TODAY,
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'correct',
      firstDueChosen: false,
      fallenDosesAnswer: 'not-due',
      settings: { startsOn: '2026-10-02', firstDueOn: TODAY, frequency: { value: 3, unit: 'day' } },
    })
    const schedule = apres(withPeriods, plan)
    expect(schedule.unloggedDoses).toEqual([])
    expect(jours(schedule.currentDoses)).toEqual([TODAY])
  })

  it('#873 : écrit une ligne « pas à donner » par dose montrée par la question', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const shown = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'keep' }),
      TODAY,
      IDS,
    )
    expect(shown.doses).toEqual([])
    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'drop' }),
      TODAY,
      IDS,
    )
    expect(plan.doses.length).toBeGreaterThan(0)
    expect(
      plan.doses.every((write) => write.action === 'create' && write.dose.status === 'not-due'),
    ).toBe(true)
  })

  it('#873 : la liste montrée envoyée avec la réponse doit être celle de la question au moment d’écrire, sinon la question se repose', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const shownNow = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'drop' }),
      TODAY,
      IDS,
    ).doses.flatMap((write) =>
      write.action === 'create'
        ? [
            write.dose.dueTime === null
              ? write.dose.dueOn
              : `${write.dose.dueOn} ${write.dose.dueTime}`,
          ]
        : [],
    )
    expect(() =>
      editionPlan(
        withPeriods,
        saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'drop', pastDuesShown: shownNow }),
        TODAY,
        IDS,
      ),
    ).not.toThrow()
    const refused = (() => {
      try {
        editionPlan(
          withPeriods,
          saisie(withPeriods, {
            ...TROIS_JOURS,
            pastDues: 'drop',
            pastDuesShown: shownNow.slice(1),
          }),
          TODAY,
          IDS,
        )
        return null
      } catch (error) {
        return error
      }
    })()
    expect(refused).toBeInstanceOf(ZodError)
    expect(pastDuesAskedAgain(refused)).toBe(true)
  })

  it('garde une « Prochaine dose » choisie à la main quand elle vaut pour le chemin choisi, la refuse sinon', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const input = (changes: Partial<TreatmentEditionInput>) =>
      saisie(withPeriods, { ...TROIS_JOURS, nextDoseOn: '2026-10-12', ...changes })

    for (const pastDues of ['keep', 'drop'] as const) {
      expect(editionPlan(withPeriods, input({ pastDues }), TODAY, IDS).period).toMatchObject({
        firstDueChosen: true,
        fallenDosesAnswer: pastDues === 'keep' ? 'stay-unlogged' : 'not-due',
        settings: { firstDueOn: '2026-10-12' },
      })
      expect(champsRefuses(withPeriods, input({ pastDues, endsOn: '2026-10-10' }), TODAY)).toEqual([
        'nextDoseOn:noDoseBeforeEnd',
      ])
    }
  })

  it('dit qu’aujourd’hui est proposé quand le traitement n’a jamais été noté, dans les deux choix', () => {
    const mensuel = treatment([
      period({
        startsOn: '2026-09-20',
        firstDueOn: '2026-09-20',
        frequency: { value: 1, unit: 'month' },
      }),
    ])
    const input = saisie(mensuel, { frequency: { value: 2, unit: 'month' } })

    expect(editionDraft(mensuel, input, '2026-10-02').nextDose).toMatchObject({
      proposedOn: '2026-10-02',
      help: { kind: 'today' },
    })
    for (const pastDues of ['keep', 'drop'] as const) {
      expect(editionPlan(mensuel, { ...input, pastDues }, '2026-10-02', IDS).period).toMatchObject({
        settings: { firstDueOn: '2026-10-02' },
      })
    }
  })

  it('annonce la prochaine dose de chaque choix, celle que ce choix écrit', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const input = saisie(withPeriods, TROIS_JOURS)
    const annoncees = editionDraft(withPeriods, input, TODAY).pastDuesNextDose

    expect(annoncees).toEqual({ keep: '2026-10-08', drop: '2026-10-08' })
    for (const pastDues of ['keep', 'drop'] as const) {
      expect(
        editionPlan(
          withPeriods,
          { ...input, pastDues, nextDoseOn: annoncees![pastDues] },
          TODAY,
          IDS,
        ).period,
      ).toMatchObject({ settings: { firstDueOn: annoncees![pastDues] } })
    }
  })

  it('annonce deux dates différentes quand les deux chemins n’écrivent pas la même', () => {
    const hebdo = period({
      startsOn: '2026-09-18',
      firstDueOn: '2026-09-18',
      frequency: { value: 1, unit: 'week' },
    })
    const dixJours = period({
      id: NEW_PERIOD,
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-02',
      frequency: { value: 10, unit: 'day' },
      createdAt: '2026-10-02T09:00:00.000Z',
    })
    const withPeriods = treatment(
      [hebdo, dixJours],
      [
        dose({ id: 'a', dueOn: '2026-09-18', givenOn: '2026-09-18' }),
        dose({ id: 'b', dueOn: '2026-09-25', givenOn: '2026-09-25' }),
      ],
    )
    const input = saisie(withPeriods, { frequency: { value: 20, unit: 'day' } })
    const ids = { ...IDS, periodId: '55555555-5555-4555-8555-555555555555' }
    const draft = editionDraft(withPeriods, input, '2026-10-04')

    expect(jours(draft.pastDues)).toEqual(['2026-10-02'])
    expect(draft.pastDuesNextDose).toEqual({ keep: '2026-10-15', drop: '2026-10-15' })
    expect(
      editionPlan(
        withPeriods,
        { ...input, pastDues: 'keep', nextDoseOn: '2026-10-15' },
        '2026-10-04',
        ids,
      ).period,
    ).toMatchObject({ action: 'open', settings: { firstDueOn: '2026-10-15' } })
    expect(
      editionPlan(
        withPeriods,
        { ...input, pastDues: 'drop', nextDoseOn: '2026-10-15' },
        '2026-10-04',
        ids,
      ).period,
    ).toMatchObject({ action: 'correct', settings: { firstDueOn: '2026-10-15' } })
  })

  it('annonce la date choisie à la main pour les chemins où elle vaut, la date calculée sinon', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])

    expect(
      editionDraft(withPeriods, saisie(withPeriods, TROIS_JOURS), TODAY, '2026-10-12')
        .pastDuesNextDose,
    ).toEqual({ keep: '2026-10-12', drop: '2026-10-12' })
    expect(
      champsRefuses(
        withPeriods,
        saisie(withPeriods, { ...TROIS_JOURS, endsOn: '2026-10-10', pastDues: 'keep' }),
        TODAY,
      ),
    ).toEqual([])
  })

  it('annonce la prochaine dose à plusieurs heures', () => {
    const withPeriods = treatment([{ ...TOUS_LES_2_JOURS, times: ['08:00', '20:00'] }])

    expect(
      editionDraft(withPeriods, saisie(withPeriods, TROIS_JOURS), TODAY).pastDuesNextDose,
    ).toEqual({
      keep: '2026-10-08',
      drop: '2026-10-08',
    })
  })

  it('n’annonce rien sans question à poser', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(editionDraft(withPeriods, null, '2026-09-28').pastDuesNextDose).toBeNull()
  })

  it('compte chaque heure d’une journée tombée', () => {
    const withPeriods = treatment([{ ...TOUS_LES_2_JOURS, times: ['08:00', '20:00'] }])

    expect(
      jours(editionDraft(withPeriods, saisie(withPeriods, TROIS_JOURS), TODAY).pastDues),
    ).toEqual([
      '2026-10-03 08:00',
      '2026-10-03 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
      '2026-10-07 08:00',
      '2026-10-07 20:00',
    ])
  })

  it('pose la question pour des heures seules changées, pas pour la posologie, la date de fin, le nom ou le type', () => {
    const withPeriods = treatment([TOUS_LES_2_JOURS])
    const tombees = (changes: Partial<TreatmentEditionInput>) =>
      editionDraft(withPeriods, saisie(withPeriods, changes), TODAY).pastDues.length

    expect(tombees({ times: ['09:00'] })).toBe(3)
    expect(tombees({ doseQuantity: 2 })).toBe(0)
    expect(tombees({ endsOn: '2026-12-31' })).toBe(0)
    expect(tombees({ name: 'Autre', type: 'medication' })).toBe(0)
    expect(champsRefuses(withPeriods, saisie(withPeriods, { doseQuantity: 2 }), TODAY)).toEqual([])
  })

  it('ne pose aucune question sans échéance tombée, ni quand une prise est notée dans la période (TR-28)', () => {
    const futur = treatment([{ ...TOUS_LES_2_JOURS, firstDueOn: '2026-10-09' }])
    const notee = treatment(
      [TOUS_LES_2_JOURS],
      [dose({ dueOn: '2026-10-03', givenOn: '2026-10-03' })],
    )

    expect(editionDraft(futur, saisie(futur, TROIS_JOURS), TODAY).pastDues).toEqual([])
    expect(champsRefuses(futur, saisie(futur, TROIS_JOURS), TODAY)).toEqual([])
    expect(editionDraft(notee, saisie(notee, TROIS_JOURS), TODAY)).toMatchObject({
      change: 'edit',
      pastDues: [],
    })
    expect(champsRefuses(notee, saisie(notee, TROIS_JOURS), TODAY)).toEqual([])
  })

  it('n’annonce qu’une dose quand une seule est tombée', () => {
    const withPeriods = treatment([{ ...TOUS_LES_2_JOURS, firstDueOn: '2026-10-07' }])

    expect(
      jours(editionDraft(withPeriods, saisie(withPeriods, TROIS_JOURS), TODAY).pastDues),
    ).toEqual(['2026-10-07'])
  })

  it('pose aussi la question pour une période ouverte par « Modifier », et garde alors l’ancienne période intacte', () => {
    const hebdo = period({
      startsOn: '2026-09-18',
      firstDueOn: '2026-09-18',
      frequency: { value: 1, unit: 'week' },
    })
    const ouverte = { ...TOUS_LES_2_JOURS, id: NEW_PERIOD, createdAt: '2026-10-02T09:00:00.000Z' }
    const withPeriods = treatment(
      [hebdo, ouverte],
      [dose({ dueOn: '2026-09-25', givenOn: '2026-09-25' })],
    )
    const ids = { ...IDS, periodId: '55555555-5555-4555-8555-555555555555' }

    expect(
      editionDraft(withPeriods, saisie(withPeriods, TROIS_JOURS), TODAY).pastDues,
    ).toHaveLength(3)
    const plan = editionPlan(
      withPeriods,
      saisie(withPeriods, { ...TROIS_JOURS, pastDues: 'keep' }),
      TODAY,
      ids,
    )
    expect(plan.period).toMatchObject({ action: 'open', settings: { startsOn: TODAY } })
  })
})

describe('resumptionPlan (TR-32)', () => {
  const ARRETEE = period({
    frequency: { value: 1, unit: 'day' },
    startsOn: '2026-10-06',
    firstDueOn: '2026-10-06',
    gridOriginOn: '2026-10-06',
    endsOn: '2026-10-10',
    stoppedOn: '2026-10-09',
    times: ['20:00'],
    doseQuantity: 0.5,
    reminderOffsetMinutes: 30,
  })
  const PRISE = dose({
    dueOn: '2026-10-08',
    dueTime: '20:00',
    givenOn: '2026-10-08',
  })
  const REPRISE: TreatmentResumptionInput = {
    firstDoseOn: '2026-11-03',
    frequency: { value: 1, unit: 'day' },
    times: ['20:00'],
    doseQuantity: 0.5,
    doseUnit: 'tablet',
    endsOn: '2026-11-07',
  }

  it('ouvre une nouvelle période à la première prise choisie, sans toucher à la précédente', () => {
    const withPeriods = treatment([ARRETEE], [PRISE])

    expect(resumptionPlan(withPeriods, REPRISE, '2026-11-02', IDS)).toEqual({
      treatment: null,
      period: {
        action: 'open',
        id: NEW_PERIOD,
        gridOriginOn: '2026-11-03',
        firstDueChosen: true,
        fallenDosesAnswer: 'unasked',
        settings: {
          startsOn: '2026-11-03',
          firstDueOn: '2026-11-03',
          endsOn: '2026-11-07',
          frequency: { value: 1, unit: 'day' },
          times: ['20:00'],
          doseQuantity: 0.5,
          doseUnit: 'tablet',
          reminderOffsetMinutes: 30,
          reminderTime: null,
        },
      },
      doses: [],
    })
  })

  it('écrit le rappel changé dans le formulaire de reprise', () => {
    const withPeriods = treatment([ARRETEE], [PRISE])

    expect(
      resumptionPlan(withPeriods, { ...REPRISE, reminderOffsetMinutes: 60 }, '2026-11-02', IDS)
        .period,
    ).toMatchObject({ settings: { reminderOffsetMinutes: 60, reminderTime: null } })
  })

  it('reprend aussi un traitement arrivé à sa date de fin', () => {
    const finie = { ...ARRETEE, stoppedOn: null }
    const withPeriods = treatment([finie], [PRISE])

    expect(resumptionPlan(withPeriods, REPRISE, '2026-11-02', IDS).period).toMatchObject({
      action: 'open',
    })
  })

  it('donne la durée de la dernière période et la date de fin qui la reproduit', () => {
    const draft = resumptionDraft(
      treatment([{ ...ARRETEE, stoppedOn: null }], [PRISE]),
      '2026-11-02',
    )

    expect(draft).toMatchObject({
      canResume: true,
      startedOn: '2026-10-06',
      endedOn: '2026-10-10',
      durationDays: 5,
    })
    expect(draft.endsOnFor('2026-11-03')).toBe('2026-11-07')
    expect(draft.endsOnFor('')).toBeNull()
  })

  it('date la fin d’une période arrêtée du jour de l’arrêt, sans durée à reproduire', () => {
    const sansFin = { ...ARRETEE, endsOn: null }
    const draft = resumptionDraft(treatment([sansFin], [PRISE]), '2026-11-02')

    expect(draft).toMatchObject({ endedOn: '2026-10-09', durationDays: null })
    expect(draft.endsOnFor('2026-11-03')).toBeNull()
  })

  it('refuse une première prise avant l’arrêt ou une prise de la période précédente', () => {
    const withPeriods = treatment([ARRETEE], [PRISE])
    const refus = (firstDoseOn: string) => {
      const result = treatmentResumptionSchemaFor(withPeriods, '2026-11-02').safeParse({
        ...REPRISE,
        firstDoseOn,
        endsOn: null,
      })
      return result.success ? [] : result.error.issues.map((issue) => issue.message)
    }

    expect(refus('2026-10-08')).toEqual(['tooEarly'])
    expect(resumptionDraft(withPeriods, '2026-11-02').earliestOn).toBe('2026-10-09')
    expect(refus('2026-10-09')).toEqual([])
  })

  it('accepte une reprise le jour de l’arrêt, même avec une prise notée ce jour-là (G3)', () => {
    const arretee = {
      ...ARRETEE,
      endsOn: null,
      stoppedOn: '2026-10-02',
      startsOn: '2026-09-25',
      firstDueOn: '2026-09-25',
    }
    const withPeriods = treatment(
      [arretee],
      [
        dose({
          dueOn: '2026-10-02',
          dueTime: '20:00',
          givenOn: '2026-10-02',
        }),
      ],
    )
    const input = { ...REPRISE, firstDoseOn: '2026-10-02', endsOn: null }

    expect(treatmentResumptionSchemaFor(withPeriods, '2026-10-02').safeParse(input).success).toBe(
      true,
    )
    expect(
      treatmentResumptionSchemaFor(withPeriods, '2026-10-02').safeParse({
        ...input,
        firstDoseOn: '2026-10-01',
      }).success,
    ).toBe(false)
    expect(resumptionPlan(withPeriods, input, '2026-10-02', IDS).period).toMatchObject({
      action: 'open',
      settings: { startsOn: '2026-10-02', firstDueOn: '2026-10-02' },
    })
  })

  it('accepte une reprise dès le jour de l’arrêt après une dose donnée en avance : l’ancienne période garde sa prise', () => {
    const mensuel = period({
      startsOn: '2026-09-05',
      firstDueOn: '2026-09-05',
      frequency: { value: 1, unit: 'month' },
      stoppedOn: '2026-10-02',
    })
    const withPeriods = treatment(
      [mensuel],
      [
        dose({ id: 'a', dueOn: '2026-09-05', givenOn: '2026-09-05' }),
        dose({ id: 'b', dueOn: '2026-10-05', givenOn: '2026-10-02' }),
      ],
    )

    expect(resumptionDraft(withPeriods, '2026-10-02').earliestOn).toBe('2026-10-02')
    for (const firstDoseOn of ['2026-10-02', '2026-10-05']) {
      const plan = resumptionPlan(
        withPeriods,
        { ...REPRISE, firstDoseOn, endsOn: null },
        '2026-10-02',
        IDS,
      )
      const after = viewOf(
        {
          ...withPeriods,
          periods: [
            mensuel,
            {
              ...mensuel,
              ...(plan.period as { settings: object }).settings,
              id: NEW_PERIOD,
              stoppedOn: null,
            },
          ],
        },
        '2026-10-02',
      )

      expect(after.history.map(({ line }) => line.id)).toEqual(['a', 'b'])
      expect(after.unloggedDoses).toEqual([])
      expect(after.currentDoses).toMatchObject([{ settingId: NEW_PERIOD, dueOn: firstDoseOn }])
    }
  })

  it('donne la première date acceptée après une période finie par sa date de fin', () => {
    const withPeriods = treatment([{ ...ARRETEE, stoppedOn: null }], [PRISE])

    expect(resumptionDraft(withPeriods, '2026-11-02').earliestOn).toBe('2026-10-11')
  })

  it('refuse une première prise jusqu’à la date de fin d’une période finie', () => {
    const withPeriods = treatment([{ ...ARRETEE, stoppedOn: null }], [PRISE])
    const schema = treatmentResumptionSchemaFor(withPeriods, '2026-11-02')

    expect(schema.safeParse({ ...REPRISE, firstDoseOn: '2026-10-10', endsOn: null }).success).toBe(
      false,
    )
    expect(schema.safeParse({ ...REPRISE, firstDoseOn: '2026-10-11', endsOn: null }).success).toBe(
      true,
    )
  })

  it('refuse de reprendre un traitement en cours', () => {
    const withPeriods = treatment([period()], [dose()])

    expect(resumptionDraft(withPeriods, '2026-09-28').canResume).toBe(false)
    expect(() => resumptionPlan(withPeriods, REPRISE, '2026-09-28', IDS)).toThrow(
      'Traitement en cours, rien à reprendre',
    )
  })

  it('refuse une date de fin avant la première prise', () => {
    const withPeriods = treatment([ARRETEE], [PRISE])

    expect(() =>
      resumptionPlan(withPeriods, { ...REPRISE, endsOn: '2026-11-02' }, '2026-11-02', IDS),
    ).toThrow(ZodError)
  })
})
