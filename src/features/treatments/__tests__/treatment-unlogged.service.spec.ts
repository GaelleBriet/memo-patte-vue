// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { DoseAlreadyLoggedError } from '../logic/treatment-dose-writes'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import { choiceGestures } from '../logic/treatment-choose-days'
import {
  createTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import type { DoseGesture } from '@/shared/domain/treatment-schedule'

const MILO = '11111111-1111-4111-8111-111111111111'
const PANACUR = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-28T09:00:00')
const TODAY = '2026-09-28'

describe('renseigner les doses non renseignées (TR-17)', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let doses: TreatmentDosesRepository
  let reschedule: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>

  function serviceWith(applyBatch: TreatmentDosesRepository['applyBatch']) {
    return createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => ({ applyBatch }),
      reminders: { reschedule },
      now: () => new Date(),
    })
  }

  async function schedule() {
    const history = await treatments.getWithHistory(PANACUR)
    return treatmentScheduleOf(history!, TODAY)
  }

  function statuses() {
    return db
      .query<{ status: string; n: number }>(
        `SELECT status, COUNT(*) AS n FROM treatment_dose
         WHERE treatment_id = ? AND deleted_at IS NULL GROUP BY status ORDER BY status`,
        [PANACUR],
      )
      .then((rows) => Object.fromEntries(rows.map(({ status, n }) => [status, n])))
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Milo', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
      [MILO, NOW.toISOString(), NOW.toISOString()],
    )
    treatments = createTreatmentsRepository(db)
    doses = createTreatmentDosesRepository(db)
    reschedule = vi.fn<(id: string) => Promise<void>>(async () => {})
    await treatments.create({
      id: PANACUR,
      animalId: MILO,
      name: 'Panacur',
      type: 'deworming',
      settings: {
        startsOn: '2026-09-03',
        firstDueOn: '2026-09-03',
        endsOn: null,
        frequency: { value: 1, unit: 'day' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('« Choisir les jours » écrit 20 données et 5 oubliées en un seul lot, sans déplacer la dose du jour', async () => {
    const applyBatch = vi.fn<TreatmentDosesRepository['applyBatch']>(doses.applyBatch)
    const before = await schedule()
    const gestures = before.unloggedDoses.map((due, index): DoseGesture =>
      index < 5 ? { kind: 'missed', due } : { kind: 'given', due, givenOn: due.dueOn },
    )

    await serviceWith(applyBatch).apply(PANACUR, { kind: 'log', gestures })
    const after = await schedule()

    expect(before.unloggedDoses).toHaveLength(25)
    expect(applyBatch).toHaveBeenCalledOnce()
    expect(reschedule).toHaveBeenCalledOnce()
    await expect(statuses()).resolves.toEqual({ given: 20, missed: 5 })
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses).toEqual(before.currentDoses)
    expect(after.upcoming(5)).toEqual(before.upcoming(5))
    expect(after.doses.every(({ periodId }) => periodId === PANACUR)).toBe(true)
  })

  it('« Annuler » défait tout le geste en un seul lot', async () => {
    const applyBatch = vi.fn<TreatmentDosesRepository['applyBatch']>(doses.applyBatch)
    const service = serviceWith(applyBatch)
    const { unloggedDoses } = await schedule()

    const { undo } = await service.apply(PANACUR, {
      kind: 'log',
      gestures: choiceGestures({ given: unloggedDoses, missed: [] }),
    })
    await service.undoBatch(PANACUR, undo)

    expect(undo).toHaveLength(25)
    expect(applyBatch).toHaveBeenCalledTimes(2)
    await expect(statuses()).resolves.toEqual({})
    expect((await schedule()).unloggedDoses).toEqual(unloggedDoses)
  })

  describe('dit quand le geste termine le traitement (TR-31)', () => {
    async function logAll() {
      const { unloggedDoses } = await schedule()
      return serviceWith(doses.applyBatch).apply(PANACUR, {
        kind: 'log',
        gestures: choiceGestures({ given: unloggedDoses, missed: [] }),
      })
    }

    function setCurrentPeriod(column: 'stopped_on' | 'ends_on', day: string) {
      return db.run(`UPDATE treatment_period SET ${column} = ? WHERE treatment_id = ?`, [
        day,
        PANACUR,
      ])
    }

    it('pas pour un traitement en cours, même tout renseigné', async () => {
      await expect(logAll()).resolves.toMatchObject({ finishes: false })
    })

    it('quand renseigner ne laisse plus rien à un traitement arrêté', async () => {
      await setCurrentPeriod('stopped_on', TODAY)

      await expect(logAll()).resolves.toMatchObject({ finishes: true })
    })

    it('quand la dernière dose d’un traitement à date de fin est notée', async () => {
      await setCurrentPeriod('ends_on', TODAY)
      await logAll()
      const [due] = (await schedule()).currentDoses

      const noted = await serviceWith(doses.applyBatch).apply(PANACUR, {
        kind: 'note',
        gesture: { kind: 'given', due: due!, givenOn: TODAY },
      })

      expect(due).toMatchObject({ dueOn: TODAY })
      expect(noted.finishes).toBe(true)
      expect((await schedule()).finished).toBe(true)
    })

    it('pas quand il reste une dose à renseigner après la date de fin', async () => {
      await setCurrentPeriod('ends_on', '2026-09-27')
      const [first, ...rest] = (await schedule()).unloggedDoses

      const logged = await serviceWith(doses.applyBatch).apply(PANACUR, {
        kind: 'log',
        gestures: choiceGestures({ given: rest, missed: [] }),
      })

      expect(first).toBeDefined()
      expect(logged.finishes).toBe(false)
    })
  })

  it('une dose notée entre-temps, vue à la relecture : rien n’est écrit', async () => {
    const { unloggedDoses } = await schedule()
    const service = serviceWith(doses.applyBatch)
    await service.apply(PANACUR, {
      kind: 'note',
      gesture: { kind: 'missed', due: unloggedDoses[3]! },
    })

    await expect(
      service.apply(PANACUR, {
        kind: 'log',
        gestures: choiceGestures({ given: unloggedDoses, missed: [] }),
      }),
    ).rejects.toThrow(DoseAlreadyLoggedError)
    await expect(statuses()).resolves.toEqual({ missed: 1 })
  })

  it('un autre échec d’écriture n’est pas pris pour une dose déjà notée', async () => {
    const { unloggedDoses } = await schedule()
    const failing = serviceWith(async () => {
      throw new Error('base indisponible')
    })

    const refus = await failing
      .apply(PANACUR, {
        kind: 'log',
        gestures: choiceGestures({ given: unloggedDoses, missed: [] }),
      })
      .catch((cause: unknown) => cause)

    expect(refus).toBeInstanceOf(Error)
    expect(refus).not.toBeInstanceOf(DoseAlreadyLoggedError)
  })

  it('une dose notée pendant l’écriture : tout le lot échoue, rien n’est écrit à moitié', async () => {
    const { unloggedDoses } = await schedule()
    const late = serviceWith(async (writes, at) => {
      await serviceWith(doses.applyBatch).apply(PANACUR, {
        kind: 'note',
        gesture: { kind: 'missed', due: unloggedDoses[10]! },
      })
      return doses.applyBatch(writes, at)
    })

    await expect(
      late.apply(PANACUR, {
        kind: 'log',
        gestures: choiceGestures({ given: unloggedDoses, missed: [] }),
      }),
    ).rejects.toThrow(DoseAlreadyLoggedError)
    await expect(statuses()).resolves.toEqual({ missed: 1 })
  })
})
