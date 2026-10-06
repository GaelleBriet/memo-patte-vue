import type { HomeTreatmentSource, HomeVaccinationSource } from '../service/home-reminders.service'
import type { TreatmentDoseInput, TreatmentPeriodInput } from '@/shared/domain/treatment-schedule'

const AT = '2026-09-01T08:00:00.000Z'

export function vaccination(overrides: Partial<HomeVaccinationSource> = {}): HomeVaccinationSource {
  return {
    kind: 'vaccination',
    id: 'v1',
    animalId: 'milo',
    label: 'CHPPiL',
    dueDate: '2026-09-07',
    treatmentType: null,
    ...overrides,
  }
}

export function period(overrides: Partial<TreatmentPeriodInput> = {}): TreatmentPeriodInput {
  const firstDueOn = overrides.firstDueOn ?? '2026-09-01'
  return {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'day' },
    times: [],
    createdAt: AT,
    ...overrides,
  }
}

/** Prise donnée le jour de son échéance, sauf mention. */
export function given(
  dueOn: string,
  dueTime: string | null = null,
  overrides: Partial<TreatmentDoseInput> = {},
): TreatmentDoseInput {
  return {
    id: dueTime === null ? dueOn : `${dueOn} ${dueTime}`,
    periodId: 'p1',
    dueOn,
    dueTime,
    givenOn: dueOn,
    status: 'given',
    nextDueDate: dueOn,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

/** Une prise donnée par jour (et par heure) de `from` à `to` inclus. */
export function givenDays(
  from: string,
  to: string,
  times: readonly (string | null)[] = [null],
): TreatmentDoseInput[] {
  const doses: TreatmentDoseInput[] = []
  for (let day = new Date(`${from}T12:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10)
    if (iso > to) return doses
    doses.push(...times.map((time) => given(iso, time)))
  }
}

export function treatment(
  overrides: Partial<HomeTreatmentSource> & Pick<HomeTreatmentSource, 'periods'>,
): HomeTreatmentSource {
  return {
    kind: 'treatment',
    id: 't1',
    animalId: 'luna',
    label: 'Métacam',
    treatmentType: 'medication',
    doses: [],
    ...overrides,
  }
}

/** Un traitement mensuel sans prise, dont la première échéance tombe à `dueOn`. */
export function monthlyFrom(
  dueOn: string,
  overrides: Partial<HomeTreatmentSource> = {},
): HomeTreatmentSource {
  return treatment({
    label: 'Milbemax',
    treatmentType: 'deworming',
    periods: [period({ firstDueOn: dueOn, frequency: { value: 1, unit: 'month' } })],
    ...overrides,
  })
}
