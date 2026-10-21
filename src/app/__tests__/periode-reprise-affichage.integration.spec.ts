// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { treatmentPeriods } from '@/features/settings/logic/pdf-treatment-history'
import { carnetTreatments } from '@/features/treatments/logic/treatment-carnet'
import { treatmentHistory } from '@/features/treatments/logic/treatment-history'
import { treatmentReadingOf } from '@/features/treatments/logic/treatment-reading-adapter'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import type { TreatmentCreationInput } from '@/features/treatments/schema/treatment-form.schema'
import { createTreatmentPlanService } from '@/features/treatments/service/treatment-plan.service'
import { treatmentStates } from '@/shared/domain/treatment-outlook'
import { plain } from '@/shared/__tests__/plain'

const MILO = '11111111-1111-4111-8111-111111111111'
const T0 = '2026-09-01T08:00:00.000Z'
const t = i18n.global.t

const DRONTAL: TreatmentCreationInput = {
  animalId: MILO,
  name: 'Drontal',
  type: 'deworming',
  firstDoseOn: '2026-10-03',
  frequency: { value: 1, unit: 'week' },
  times: [],
  doseQuantity: 1,
  doseUnit: 'tablet',
  endsOn: null,
}

let db: InMemoryDb
let today: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(T0) })
  db = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
     VALUES (?, 'Milo', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
    [MILO, T0, T0],
  )
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
})

async function give(treatmentId: string, dueOn: string): Promise<void> {
  await createTreatmentDosesRepository(db).applyBatch(
    [
      {
        action: 'create',
        id: crypto.randomUUID(),
        treatmentId,
        animalId: MILO,
        dose: {
          previousTargetOn: null,
          previousTargetTime: null,
          dueRank: null,
          periodId: treatmentId,
          dueOn,
          dueTime: null,
          givenOn: dueOn,
          status: 'given',
          targetOn: null,
        },
      },
    ],
    T0,
  )
}

type Case = { endsOn: string | null; stoppedOn: string | null; firstDoseOn: string }

async function resumed({ endsOn, stoppedOn, firstDoseOn }: Case) {
  const treatments = createTreatmentsRepository(db)
  const service = createTreatmentPlanService({
    treatments: () => treatments,
    reminders: { reschedule: () => Promise.resolve() },
    today: () => today,
    newId: () => crypto.randomUUID(),
  })
  today = '2026-10-10'
  const { id } = await service.create({ ...DRONTAL, endsOn })
  await give(id, '2026-10-03')
  await give(id, '2026-10-10')
  if (stoppedOn !== null) await createTreatmentPeriodsRepository(db).stop(id, stoppedOn)
  today = '2026-10-17'
  await service.resume(id, { ...DRONTAL, firstDoseOn, endsOn: '2026-11-28' })
  const treatment = await treatments.getWithPeriods(id)
  if (treatment === null) throw new Error('introuvable')
  return treatment
}

describe('R12 : une période qui suit une période close se date de sa première échéance (#925)', () => {
  it.each([
    {
      label: 'arrêt le 17, reprise le 17, première prise le 18',
      setup: { endsOn: null, stoppedOn: '2026-10-17', firstDoseOn: '2026-10-18' },
      start: '2026-10-18',
      lastDay: '2026-10-17',
      heads: ['Du 18 oct. au 28 nov. 2026', 'Du 3 oct. au 17 oct. 2026'],
      carnet: 'Toutes les semaines · du 18 oct. au 28 nov.',
    },
    {
      label: 'fin le 10, reprise le 17, première prise le 18',
      setup: { endsOn: '2026-10-10', stoppedOn: null, firstDoseOn: '2026-10-18' },
      start: '2026-10-18',
      lastDay: '2026-10-10',
      heads: ['Du 18 oct. au 28 nov. 2026', 'Du 3 oct. au 10 oct. 2026'],
      carnet: 'Toutes les semaines · du 18 oct. au 28 nov.',
    },
    {
      label: 'arrêt le 10, reprise le 17, première prise le 12',
      setup: { endsOn: null, stoppedOn: '2026-10-10', firstDoseOn: '2026-10-12' },
      start: '2026-10-12',
      lastDay: '2026-10-10',
      heads: ['Du 12 oct. au 28 nov. 2026', 'Du 3 oct. au 10 oct. 2026'],
      carnet: 'Toutes les semaines · du 12 oct. au 28 nov.',
    },
  ])('$label : la fiche, le PDF et le Carnet disent les mêmes jours', async (each) => {
    const treatment = await resumed(each.setup)
    expect(treatment.periods.map(({ startsOn }) => startsOn)).toContain('2026-10-17')

    const reading = treatmentReadingOf(treatment, today)
    const heads = plain(treatmentHistory(t, treatment, reading, today)).periods.map(
      ({ head }) => head?.title,
    )
    expect(heads).toEqual(each.heads)

    const data = {
      treatmentPeriods: await createTreatmentPeriodsRepository(db).listRecords(),
      treatmentDoses: await createTreatmentDosesRepository(db).listRecords(),
    }
    const state = treatmentStates(data, today)(treatment.id)
    expect(treatmentPeriods(state).map(({ from, to }) => [from, to])).toEqual([
      [each.start, '2026-11-28'],
      ['2026-10-03', each.lastDay],
    ])

    const [row] = carnetTreatments(t, [treatment], today).ongoing
    expect(plain(row?.detail)).toBe(each.carnet)
  })
})
