import { describe, expect, it } from 'vitest'

import { treatmentEditionSchemaFor } from '../logic/treatment-edition-checks'
import { editionDraft } from '../logic/treatment-edition-draft'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { legacyFactsOf } from '@/shared/domain/dose-calendar'

const MILO = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'
const SECOND = '33333333-3333-4333-8333-333333333333'
const DAILY = { value: 1, unit: 'day' as const }
const TWO_DAYS = { value: 2, unit: 'day' as const }
const THREE_TIMES = ['08:00', '14:00', '20:00']

let stamp = 0
const at = () => `2026-01-01T00:00:${String(++stamp).padStart(2, '0')}.000Z`

function period(overrides: Partial<TreatmentPeriodRecord>): TreatmentPeriodRecord {
  const createdAt = at()
  const record = {
    id: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    startsOn: '2026-03-14',
    firstDueOn: '2026-03-14',
    gridOriginOn: overrides.firstDueOn ?? '2026-03-14',
    endsOn: null,
    stoppedOn: null,
    frequency: DAILY,
    times: [],
    doseQuantity: 1,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  } satisfies Partial<TreatmentPeriodRecord>
  return {
    ...legacyFactsOf(record.gridOriginOn),
    settingsWrittenAt: record.createdAt,
    ...record,
  }
}

function dose(overrides: Partial<TreatmentDose>): TreatmentDose {
  const createdAt = at()
  return {
    previousTargetOn: null,
    previousTargetTime: null,
    dueRank: null,
    id: `d-${stamp}`,
    periodId: TREATMENT,
    treatmentId: TREATMENT,
    animalId: MILO,
    dueOn: '2026-03-14',
    dueTime: null,
    givenOn: overrides.status === undefined || overrides.status === 'given' ? '2026-03-14' : null,
    status: 'given',
    targetOn: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  }
}

function treatment(periods: TreatmentPeriodRecord[], doses: TreatmentDose[]) {
  return {
    id: TREATMENT,
    animalId: MILO,
    name: 'Métacam',
    type: 'deworming',
    createdAt: at(),
    updatedAt: at(),
    periods,
    doses,
  } satisfies TreatmentWithPeriods
}

function saisie(
  withPeriods: TreatmentWithPeriods,
  changes: Partial<TreatmentEditionInput>,
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

function refusedFields(
  withPeriods: TreatmentWithPeriods,
  input: TreatmentEditionInput,
  today: string,
) {
  const result = treatmentEditionSchemaFor(withPeriods, today).safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`)
}

describe('#806, Q38 : « Elles n’étaient pas à donner » refusé quand il ne laisse plus aucune dose avant la date de fin (décision du 2026-10-13)', () => {
  const withPeriods = treatment(
    [
      period({ times: THREE_TIMES, endsOn: '2026-04-06' }),
      period({
        id: SECOND,
        startsOn: '2026-03-17',
        firstDueOn: '2026-03-17',
        gridOriginOn: null,
        times: ['06:00', '12:00', '18:00', '23:00'],
        endsOn: '2026-04-06',
      }),
    ],
    [
      dose({ dueOn: '2026-03-17', dueTime: '14:00', status: 'postponed', targetOn: '2026-04-05' }),
      dose({ dueOn: '2026-03-17', dueTime: '14:00', status: 'shift', targetOn: '2026-04-05' }),
      dose({ dueOn: '2026-03-16', dueTime: '08:00', givenOn: '2026-03-16' }),
    ],
  )
  const back = saisie(withPeriods, { times: THREE_TIMES, endsOn: '2026-03-25' })

  it('chaque jour à 8, 14 et 20 h, fin le 6 avr. ; le 17 mars, 14 h reportée au 5 avr. avec décalage, puis 6, 12, 18 et 23 h ; le 18, retour à 8, 14 et 20 h, fin le 25 : la question n’annonce aucune date pour « pas à donner », le champ montre le 17', () => {
    const draft = editionDraft(withPeriods, back, '2026-03-18')
    expect(draft.pastDuesNextDose).toEqual({ keep: '2026-03-17', drop: null })
    expect(draft.nextDose).toMatchObject({ proposedOn: '2026-03-17' })
  })

  it('même carnet, « Elles n’étaient pas à donner » : refusé avec le texte de #787 ; « Elles restent à renseigner » : accepté', () => {
    expect(refusedFields(withPeriods, { ...back, pastDues: 'drop' }, '2026-03-18')).toEqual([
      'nextDoseOn:noDoseBeforeEnd',
    ])
    expect(
      refusedFields(
        withPeriods,
        { ...back, pastDues: 'keep', nextDoseOn: '2026-03-17' },
        '2026-03-18',
      ),
    ).toEqual([])
  })
})

describe('#811, Q26 : une dose notée plus loin que le jour de la modification grise la « Prochaine dose » (décision du 2026-10-13)', () => {
  const metacam = period({ startsOn: '2026-10-02', firstDueOn: '2026-10-02', frequency: TWO_DAYS })
  const given = ['02', '04', '06', '08', '10'].map((day) =>
    dose({ dueOn: `2026-10-${day}`, givenOn: `2026-10-${day}` }),
  )
  const withPeriods = treatment(
    [metacam],
    [...given, dose({ dueOn: '2026-10-12', givenOn: '2026-10-11' })],
  )

  it('tous les 2 jours, doses du 2 au 10 données, celle du 12 donnée d’avance le 11 ; le 11, posologie : le 14 proposé, champ grisé', () => {
    const draft = editionDraft(withPeriods, saisie(withPeriods, { doseQuantity: 2 }), '2026-10-11')
    expect(draft.nextDose).toMatchObject({
      proposedOn: '2026-10-14',
      refusal: { reason: 'later-dose' },
      help: { kind: 'refused', refusal: { reason: 'later-dose' } },
    })
  })

  it('même carnet, posologie seule à la date proposée : acceptée ; « Prochaine dose » le 13 : refusée', () => {
    expect(
      refusedFields(
        withPeriods,
        saisie(withPeriods, { doseQuantity: 2, nextDoseOn: '2026-10-14' }),
        '2026-10-11',
      ),
    ).toEqual([])
    expect(
      refusedFields(
        withPeriods,
        saisie(withPeriods, { doseQuantity: 2, nextDoseOn: '2026-10-13' }),
        '2026-10-11',
      ),
    ).toEqual(['nextDoseOn:refused'])
  })
})
