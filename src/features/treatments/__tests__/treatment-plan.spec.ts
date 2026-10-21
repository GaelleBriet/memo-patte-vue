import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { creationPastDues, creationPlan } from '../logic/treatment-creation'
import { editionDraft } from '../logic/treatment-edition-draft'
import { editionPlan } from '../logic/treatment-edition-plan'
import { resumptionDraft, resumptionPlan } from '../logic/treatment-resumption'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { legacyFactsOf } from '@/shared/domain/dose-calendar'

const AT = '2026-07-01T08:00:00.000Z'
const MILO = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'
const IDS = { periodId: '33333333-3333-4333-8333-333333333333', newId: () => 'nouvelle-ligne' }

function period(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  const record = {
    id: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    startsOn: '2026-09-07',
    firstDueOn: '2026-09-07',
    gridOriginOn: overrides.firstDueOn ?? '2026-09-07',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'week' },
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

function dose(dueOn: string, overrides: Partial<TreatmentDose> = {}): TreatmentDose {
  return {
    previousTargetOn: null,
    previousTargetTime: null,
    dueRank: null,
    id: `d-${dueOn}`,
    periodId: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    dueOn,
    dueTime: null,
    givenOn: dueOn,
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

const RHYTHM = {
  frequency: { value: 1, unit: 'week' as const },
  times: [],
  doseQuantity: 1,
  doseUnit: 'tablet' as const,
  endsOn: null,
}
const CREATION: TreatmentCreationInput = {
  animalId: MILO,
  name: 'Milbemax',
  type: 'deworming',
  firstDoseOn: '2026-09-07',
  ...RHYTHM,
}
const EDITION: TreatmentEditionInput = {
  name: 'Milbemax',
  type: 'deworming',
  ...RHYTHM,
  nextDoseOn: null,
}
const WEEKLY_AFTER_TWO = treatment([period()], [dose('2026-09-07'), dose('2026-09-14')])
const TODAY = '2026-09-17'

describe('creationPlan — le traitement avec sa période et les doses passées renseignées (TR-3)', () => {
  it('crée la période à la première prise, sans dose', () => {
    const plan = creationPlan(CREATION, TREATMENT, '2026-09-01')

    expect(plan).toMatchObject({
      id: TREATMENT,
      settings: { startsOn: '2026-09-07', firstDueOn: '2026-09-07', frequency: RHYTHM.frequency },
      doses: [],
    })
  })

  it('écrit une ligne par dose passée renseignée, donnée à son jour ou oubliée', () => {
    const today = '2026-09-17'
    const dues = creationPastDues(CREATION, today)
    expect(dues.map(({ dueOn }) => dueOn)).toEqual(['2026-09-07', '2026-09-14'])

    const plan = creationPlan(
      {
        ...CREATION,
        pastDoses: [{ dueOn: '2026-09-07', dueTime: null, status: 'given' }],
      },
      TREATMENT,
      today,
      () => 'nouvelle',
    )

    expect(plan.doses).toMatchObject([
      { id: 'nouvelle', dose: { dueOn: '2026-09-07', status: 'given', givenOn: '2026-09-07' } },
    ])
  })

  it('refuse une dose passée qui n’est pas une échéance tombée', () => {
    expect(() =>
      creationPlan(
        { ...CREATION, pastDoses: [{ dueOn: '2026-09-08', dueTime: null, status: 'given' }] },
        TREATMENT,
        '2026-09-17',
      ),
    ).toThrow(RangeError)
  })
})

describe('editionPlan — « Modifier » écrit ce que le moteur propose (TR-28, R9, R10)', () => {
  it('le nom seul : aucune période écrite', () => {
    const plan = editionPlan(WEEKLY_AFTER_TWO, { ...EDITION, name: 'Autre' }, TODAY, IDS)

    expect(plan).toEqual({
      treatment: { name: 'Autre', type: 'deworming' },
      period: null,
      doses: [],
    })
  })

  it('des heures changées après une prise : un réglage ouvert aujourd’hui qui hérite l’origine', () => {
    const plan = editionPlan(WEEKLY_AFTER_TWO, { ...EDITION, times: ['09:00'] }, TODAY, IDS)

    expect(plan.period).toMatchObject({
      action: 'open',
      id: IDS.periodId,
      settings: { startsOn: TODAY, times: ['09:00'] },
      gridOriginOn: null,
    })
  })

  it('une autre « Prochaine dose » avec une posologie changée : un réglage qui pose sa propre origine', () => {
    const plan = editionPlan(
      WEEKLY_AFTER_TWO,
      { ...EDITION, doseQuantity: 2, nextDoseOn: '2026-09-24' },
      TODAY,
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'open',
      settings: { firstDueOn: '2026-09-24' },
      gridOriginOn: '2026-09-24',
    })
  })

  it('sans prise, le réglage en cours est corrigé sur place', () => {
    const plan = editionPlan(
      treatment([period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20' })]),
      { ...EDITION, frequency: { value: 2, unit: 'week' }, nextDoseOn: '2026-09-20' },
      '2026-09-18',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'correct',
      id: TREATMENT,
      settings: { frequency: { value: 2, unit: 'week' } },
    })
  })

  it('une fréquence qui change sans prise mais avec des échéances tombées pose la question (Q38)', () => {
    const withPeriods = treatment([period({ startsOn: '2026-09-01', firstDueOn: '2026-09-01' })])
    const input = { ...EDITION, frequency: { value: 2, unit: 'week' as const } }

    const draft = editionDraft(withPeriods, input, TODAY)
    expect(draft.pastDues.length).toBeGreaterThan(0)
    expect(draft.pastDuesNextDose).toMatchObject({
      keep: expect.any(String),
      drop: expect.any(String),
    })
    expect(() =>
      editionPlan(withPeriods, { ...input, nextDoseOn: draft.nextDose!.proposedOn }, TODAY, IDS),
    ).toThrow(ZodError)
    expect(
      editionPlan(
        withPeriods,
        { ...input, nextDoseOn: draft.nextDose!.proposedOn, pastDues: 'keep' },
        TODAY,
        IDS,
      ).period,
    ).toMatchObject({ action: 'open' })
  })

  it('un traitement fini ne change que son nom et son type', () => {
    const fini = treatment([period({ endsOn: '2026-09-10' })], [dose('2026-09-07')])

    expect(editionDraft(fini, null, TODAY)).toMatchObject({ change: 'locked', nextDose: null })
    expect(
      editionPlan(fini, { ...EDITION, name: 'Autre', endsOn: '2026-09-10' }, TODAY, IDS),
    ).toEqual({
      treatment: { name: 'Autre', type: 'deworming' },
      period: null,
      doses: [],
    })
  })

  it('refuse sans rien écrire une saisie que le moteur refuse', () => {
    expect(() =>
      editionPlan(WEEKLY_AFTER_TWO, { ...EDITION, nextDoseOn: '2026-09-10' }, TODAY, IDS),
    ).toThrow(ZodError)
  })
})

describe('resumptionPlan — « Reprendre » ouvre un réglage (R8)', () => {
  const STOPPED = treatment([period({ stoppedOn: '2026-09-15' })], [dose('2026-09-07')])
  const RESUME: TreatmentResumptionInput = { firstDoseOn: '2026-09-21', ...RHYTHM }

  it('commence à la première prise choisie, origine posée sur elle (#925)', () => {
    expect(resumptionDraft(STOPPED, TODAY).canResume).toBe(true)

    const plan = resumptionPlan(STOPPED, RESUME, TODAY, IDS)

    expect(plan).toMatchObject({
      treatment: null,
      period: {
        action: 'open',
        id: IDS.periodId,
        settings: { startsOn: '2026-09-21', firstDueOn: '2026-09-21' },
        gridOriginOn: '2026-09-21',
      },
      doses: [],
    })
  })

  it('lève pour un traitement en cours', () => {
    expect(() => resumptionPlan(WEEKLY_AFTER_TWO, RESUME, TODAY, IDS)).toThrow('rien à reprendre')
  })
})
