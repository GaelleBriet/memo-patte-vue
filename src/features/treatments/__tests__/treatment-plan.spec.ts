import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  creationPlan,
  editionDraft,
  editionPlan,
  resumptionDraft,
  resumptionPlan,
  treatmentEditionSchemaFor,
  treatmentResumptionSchemaFor,
} from '../logic/treatment-plan'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type {
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'

const AT = '2026-07-01T08:00:00.000Z'
const MILO = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'
const NEW_PERIOD = '33333333-3333-4333-8333-333333333333'
const NEW_DOSE = '44444444-4444-4444-8444-444444444444'
const IDS = { periodId: NEW_PERIOD, doseId: NEW_DOSE }

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
    doseQuantity: 1,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

function dose(overrides: Partial<NewTreatmentDose> = {}): NewTreatmentDose {
  return {
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
    ...overrides,
  }
}

function treatment(
  periods: TreatmentPeriodRecord[],
  doses: NewTreatmentDose[] = [],
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

function saisie(
  history: TreatmentWithHistory,
  changes: Partial<TreatmentEditionInput> = {},
): TreatmentEditionInput {
  const current = history.periods.at(-1)!
  return {
    name: history.name,
    type: history.type,
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
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
): string[] {
  const result = treatmentEditionSchemaFor(history, today).safeParse(input)
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
      ),
    ).toThrow(ZodError)
  })
})

describe('editionPlan — nom et type (TR-27)', () => {
  it('corrige le nom et le type sans toucher à la période ni aux prises', () => {
    const history = treatment([period()], [dose()])

    const plan = editionPlan(
      history,
      saisie(history, { name: 'Milbemax chat', type: 'medication' }),
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
    const history = treatment([period({ firstDueOn: '2026-10-10', startsOn: '2026-10-10' })])

    const plan = editionPlan(
      history,
      saisie(history, {
        frequency: { value: 2, unit: 'week' },
        times: ['20:00', '08:00'],
        doseQuantity: 0.5,
      }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toEqual({
      action: 'correct',
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
    const hebdo = period({ frequency: { value: 1, unit: 'week' }, doseUnit: 'pipette' })
    const history = treatment(
      [hebdo],
      [dose({ dueOn: '2026-09-08', givenOn: '2026-09-08', nextDueDate: '2026-09-15' })],
    )
    const input = saisie(history, { frequency: { value: 15, unit: 'day' } })

    expect(editionDraft(history, input, '2026-09-29')).toMatchObject({
      change: 'open',
      nextDose: {
        change: 'first-due',
        proposedOn: '2026-09-29',
        earliest: '2026-09-29',
        latest: null,
        calculatedOn: '2026-09-29',
      },
    })
    expect(editionPlan(history, input, '2026-09-29', IDS).period).toEqual({
      action: 'open',
      id: NEW_PERIOD,
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
    const history = treatment([period()], [dose()])

    const plan = editionPlan(
      history,
      saisie(history, { doseQuantity: 0.5, nextDoseOn: '2026-10-20' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'open',
      settings: { startsOn: '2026-09-28', firstDueOn: '2026-10-20', doseQuantity: 0.5 },
    })
    expect(plan.doses).toEqual([])
  })

  it('ouvre une nouvelle période pour des heures changées, même sans changer la fréquence', () => {
    const history = treatment([period()], [dose()])

    expect(editionDraft(history, saisie(history, { times: ['09:00'] }), '2026-09-28').change).toBe(
      'open',
    )
  })

  it('refuse une première dose de la nouvelle période avant aujourd’hui ou après la date de fin', () => {
    const history = treatment([period()], [dose()])
    const changed = { frequency: { value: 1, unit: 'month' } } as const

    expect(
      champsRefuses(
        history,
        saisie(history, { ...changed, nextDoseOn: '2026-09-27' }),
        '2026-09-28',
      ),
    ).toEqual(['nextDoseOn:tooEarly'])
    expect(
      champsRefuses(
        history,
        saisie(history, { ...changed, endsOn: '2026-10-15', nextDoseOn: '2026-10-16' }),
        '2026-09-28',
      ),
    ).toEqual(['nextDoseOn:afterEnd'])
  })

  it('refuse une date de fin restée avant la première dose de la nouvelle période', () => {
    const history = treatment([period({ endsOn: '2026-08-10' })], [dose()])

    expect(
      champsRefuses(
        history,
        saisie(history, { frequency: { value: 1, unit: 'month' } }),
        '2026-09-28',
      ),
    ).toEqual(['endsOn:beforeNextDose'])
  })

  it('corrige la date de fin seule sans ouvrir de période, même avec des prises', () => {
    const history = treatment([period()], [dose()])

    const plan = editionPlan(history, saisie(history, { endsOn: '2026-12-31' }), '2026-09-28', IDS)

    expect(plan.period).toMatchObject({
      action: 'correct',
      settings: { startsOn: '2026-07-10', firstDueOn: '2026-07-10', endsOn: '2026-12-31' },
    })
  })

  it('refuse une date de fin avant la dernière prise notée, égale acceptée (TR-6)', () => {
    const history = treatment(
      [period()],
      [
        dose(),
        dose({ id: 'd-2', dueOn: '2026-10-10', givenOn: '2026-10-12', nextDueDate: '2027-01-12' }),
      ],
    )
    const refus = (endsOn: string) =>
      champsRefuses(history, saisie(history, { endsOn }), '2026-10-20')

    expect(refus('2026-10-09')).toEqual(['endsOn:beforeLastDose'])
    expect(refus('2026-10-10')).toEqual([])
    expect(refus('2026-07-09')).toEqual(['endsOn:beforeFirstDose'])
  })

  it('ne corrige que le nom et le type d’un traitement arrêté', () => {
    const history = treatment([period({ stoppedOn: '2026-08-01' })], [dose()])

    const plan = editionPlan(
      history,
      saisie(history, { name: 'Milbemax chat', frequency: { value: 1, unit: 'day' } }),
      '2026-09-28',
      IDS,
    )

    expect(editionDraft(history, null, '2026-09-28')).toMatchObject({
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

describe('editionPlan — « Prochaine dose » (TR-7, TR-9)', () => {
  it('propose la prochaine dose calculée d’après la dernière prise, avec les bornes du moteur', () => {
    const history = treatment([period()], [dose()])

    expect(editionDraft(history, null, '2026-09-28').nextDose).toEqual({
      change: 'move',
      proposedOn: '2026-10-10',
      earliest: '2026-09-28',
      latest: null,
      refusal: null,
      calculatedOn: '2026-10-10',
    })
  })

  it('reporte la dose par une ligne « Reportée », sans période nouvelle (Q17)', () => {
    const history = treatment([period()], [dose()])

    const plan = editionPlan(
      history,
      saisie(history, { nextDoseOn: '2026-10-14' }),
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
            nextDueDate: '2026-10-14',
          },
        },
      ],
    })
  })

  it('avance la dose par la même ligne, d’après son échéance d’origine', () => {
    const history = treatment([period()], [dose()])

    const plan = editionPlan(
      history,
      saisie(history, { nextDoseOn: '2026-10-08' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-10', nextDueDate: '2026-10-08' } },
    ])
  })

  const REPORT = dose({
    id: 'd-2',
    dueOn: '2026-10-10',
    givenOn: null,
    status: 'postponed',
    nextDueDate: '2026-10-14',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  })

  it('garde en aide la date calculée d’une dose déjà reportée, et réécrit sa ligne (Q18)', () => {
    const history = treatment([period()], [dose(), REPORT])

    expect(editionDraft(history, null, '2026-09-28').nextDose).toMatchObject({
      proposedOn: '2026-10-14',
      calculatedOn: '2026-10-10',
    })
    expect(
      editionPlan(history, saisie(history, { nextDoseOn: '2026-10-18' }), '2026-09-28', IDS).doses,
    ).toMatchObject([
      { action: 'rewrite', id: 'd-2', dose: { dueOn: '2026-10-10', nextDueDate: '2026-10-18' } },
    ])
  })

  it('supprime la ligne quand la dose revient à sa date d’origine', () => {
    const history = treatment([period()], [dose(), REPORT])

    expect(
      editionPlan(history, saisie(history, { nextDoseOn: '2026-10-10' }), '2026-09-28', IDS).doses,
    ).toEqual([{ action: 'delete', id: 'd-2' }])
  })

  it('n’écrit rien quand « Prochaine dose » garde la date proposée', () => {
    const history = treatment([period()], [dose(), REPORT])

    expect(
      editionPlan(history, saisie(history, { nextDoseOn: '2026-10-14' }), '2026-09-28', IDS).doses,
    ).toEqual([])
  })

  it('refuse une prochaine dose après la date de fin et n’écrit rien (Q20)', () => {
    const history = treatment(
      [period({ frequency: { value: 1, unit: 'week' }, endsOn: '2026-10-10' })],
      [dose({ dueOn: '2026-09-26', givenOn: '2026-09-26', nextDueDate: '2026-10-03' })],
    )
    const input = saisie(history, { nextDoseOn: '2026-11-01' })

    expect(champsRefuses(history, input, '2026-09-28')).toEqual(['nextDoseOn:afterEnd'])
    expect(() => editionPlan(history, input, '2026-09-28', IDS)).toThrow(ZodError)
  })

  it('accepte une prochaine dose au-delà de l’ancienne fin quand la date de fin change dans la même saisie', () => {
    const history = treatment(
      [period({ frequency: { value: 1, unit: 'week' }, endsOn: '2026-10-10' })],
      [dose({ dueOn: '2026-09-26', givenOn: '2026-09-26', nextDueDate: '2026-10-03' })],
    )

    const plan = editionPlan(
      history,
      saisie(history, { endsOn: '2026-11-05', nextDoseOn: '2026-10-08' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { endsOn: '2026-11-05' } })
    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-03', nextDueDate: '2026-10-08' } },
    ])
  })

  it('refuse une prochaine dose avant la borne du moteur', () => {
    const history = treatment([period()], [dose()])

    expect(
      champsRefuses(history, saisie(history, { nextDoseOn: '2026-09-27' }), '2026-09-28'),
    ).toEqual(['nextDoseOn:tooEarly'])
  })

  it('corrige la première échéance d’une période sans prise, sans ligne de déplacement', () => {
    const history = treatment([period({ startsOn: '2026-10-10', firstDueOn: '2026-10-10' })])

    expect(editionDraft(history, null, '2026-09-28').nextDose).toEqual({
      change: 'first-due',
      proposedOn: '2026-10-10',
      earliest: '2026-09-28',
      latest: null,
      refusal: null,
      calculatedOn: null,
    })
    const plan = editionPlan(
      history,
      saisie(history, { nextDoseOn: '2026-10-02' }),
      '2026-09-28',
      IDS,
    )

    expect(plan.period).toMatchObject({
      action: 'correct',
      settings: { startsOn: '2026-10-02', firstDueOn: '2026-10-02' },
    })
    expect(plan.doses).toEqual([])
  })

  it('ne propose aucune prochaine dose à un traitement fini', () => {
    const history = treatment([period({ endsOn: '2026-08-01' })], [dose()])

    expect(editionDraft(history, null, '2026-09-28').nextDose).toBeNull()
  })

  it('donne la raison du moteur quand une dose plus lointaine est déjà reportée (Q26)', () => {
    const quotidien = period({
      frequency: { value: 1, unit: 'day' },
      startsOn: '2026-09-20',
      firstDueOn: '2026-09-20',
    })
    const history = treatment(
      [quotidien],
      [
        dose({
          id: 'd-loin',
          dueOn: '2026-10-05',
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-10-07',
        }),
      ],
    )

    const draft = editionDraft(history, null, '2026-09-28')

    expect(draft.nextDose).toMatchObject({ change: 'move', refusal: 'later-line' })
    expect(
      champsRefuses(history, saisie(history, { nextDoseOn: '2026-09-30' }), '2026-09-28'),
    ).toEqual(['nextDoseOn:refused'])
  })

  it('supprime avec l’écriture les déplacements que le moteur dit sans effet', () => {
    const history = treatment(
      [period()],
      [dose(), dose({ ...REPORT, id: 'd-revenu', nextDueDate: '2026-10-10' })],
    )

    const plan = editionPlan(history, saisie(history), '2026-09-28', IDS)

    expect(plan.doses).toEqual([{ action: 'delete', id: 'd-revenu' }])
  })
})

describe('resumptionPlan (TR-32)', () => {
  const ARRETEE = period({
    frequency: { value: 1, unit: 'day' },
    startsOn: '2026-10-06',
    firstDueOn: '2026-10-06',
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
    nextDueDate: '2026-10-09',
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
    const history = treatment([ARRETEE], [PRISE])

    expect(resumptionPlan(history, REPRISE, '2026-11-02', IDS)).toEqual({
      treatment: null,
      period: {
        action: 'open',
        id: NEW_PERIOD,
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

  it('reprend aussi un traitement arrivé à sa date de fin', () => {
    const finie = { ...ARRETEE, stoppedOn: null }
    const history = treatment([finie], [PRISE])

    expect(resumptionPlan(history, REPRISE, '2026-11-02', IDS).period).toMatchObject({
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
    const history = treatment([ARRETEE], [PRISE])
    const refus = (firstDoseOn: string) => {
      const result = treatmentResumptionSchemaFor(history, '2026-11-02').safeParse({
        ...REPRISE,
        firstDoseOn,
        endsOn: null,
      })
      return result.success ? [] : result.error.issues.map((issue) => issue.message)
    }

    expect(refus('2026-10-08')).toEqual(['beforePreviousPeriod'])
    expect(refus('2026-10-09')).toEqual([])
  })

  it('refuse une première prise jusqu’à la date de fin d’une période finie', () => {
    const history = treatment([{ ...ARRETEE, stoppedOn: null }], [PRISE])
    const schema = treatmentResumptionSchemaFor(history, '2026-11-02')

    expect(schema.safeParse({ ...REPRISE, firstDoseOn: '2026-10-10', endsOn: null }).success).toBe(
      false,
    )
    expect(schema.safeParse({ ...REPRISE, firstDoseOn: '2026-10-11', endsOn: null }).success).toBe(
      true,
    )
  })

  it('refuse de reprendre un traitement en cours', () => {
    const history = treatment([period()], [dose()])

    expect(resumptionDraft(history, '2026-09-28').canResume).toBe(false)
    expect(() => resumptionPlan(history, REPRISE, '2026-09-28', IDS)).toThrow(
      'Traitement en cours, rien à reprendre',
    )
  })

  it('refuse une date de fin avant la première prise', () => {
    const history = treatment([ARRETEE], [PRISE])

    expect(() =>
      resumptionPlan(history, { ...REPRISE, endsOn: '2026-11-02' }, '2026-11-02', IDS),
    ).toThrow(ZodError)
  })
})
