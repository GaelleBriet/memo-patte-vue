// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { DoseAlreadyLoggedError } from '../logic/treatment-dose-writes'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import { createWriteQueue } from '../logic/treatment-write-queue'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import {
  createTreatmentRemindersService,
  type TreatmentRemindersService,
} from '../service/treatment-reminders.service'
import {
  createTreatmentStopService,
  type TreatmentStopService,
} from '../service/treatment-stop.service'
import { seedTreatmentWithDose } from './seed-treatment'

const BOREE = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-23T08:00:00.000Z')

describe('treatmentStopService', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let notifications: FakeNotifications
  let service: TreatmentStopService
  let reminders: TreatmentRemindersService
  let bravecto: string

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Boree', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
      [BOREE, NOW.toISOString(), NOW.toISOString()],
    )
    treatments = createTreatmentsRepository(db)
    notifications = createFakeNotifications()
    reminders = createTreatmentRemindersService({
      treatments: () => treatments,
      animals: () => createAnimalsRepository(db),
      notifications,
      t: i18n.global.t,
      now: () => new Date(),
    })
    service = createTreatmentStopService({
      treatments: () => treatments,
      periods: () => createTreatmentPeriodsRepository(db),
      doses: () => createTreatmentDosesRepository(db),
      reminders,
      today: () => '2026-09-23',
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    })
    bravecto = (
      await seedTreatmentWithDose(db, {
        animalId: BOREE,
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        lastDoseDate: '2026-08-28',
      })
    ).id
    await reminders.reschedule(bravecto)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('arrête la période en cours aujourd’hui et retire tous les rappels, prises gardées', async () => {
    expect(notifications.pending.size).toBeGreaterThan(0)

    await expect(service.stop(bravecto)).resolves.toEqual({
      animalId: BOREE,
      stopped: true,
      finished: true,
      undo: [],
    })

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      stoppedOn: '2026-09-23',
      lastDoseDate: '2026-08-28',
    })
    await expect(
      db.query('SELECT stopped_on FROM treatment_period WHERE treatment_id = ?', [bravecto]),
    ).resolves.toEqual([{ stopped_on: '2026-09-23' }])
    expect(notifications.pending.size).toBe(0)
  })

  it('annule l’arrêt : le traitement reprend avec ses rappels', async () => {
    await service.stop(bravecto)

    await service.undo(bravecto)

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({ stoppedOn: null })
    expect([...notifications.pending.keys()]).toContain(`treatment:${bravecto}:2026-09-28::due`)
  })

  it('dit qu’un traitement déjà arrêté ne l’a pas été de nouveau', async () => {
    await service.stop(bravecto)

    await expect(service.stop(bravecto)).resolves.toMatchObject({ animalId: BOREE, stopped: false })
  })

  describe('avec des doses à renseigner (TR-30)', () => {
    const STOPPED_AT = '2026-09-23T08:00:00.000Z'
    const UNDONE_AT = '2026-09-23T08:00:04.000Z'
    let panacur: string

    function due(dueOn: string) {
      return { periodId: panacur, dueOn, dueTime: null }
    }

    function given(dueOn: string) {
      return { kind: 'given' as const, due: due(dueOn), givenOn: dueOn }
    }

    function reminded(): boolean {
      return [...notifications.pending.keys()].some((key) =>
        key.startsWith(`treatment:${panacur}:`),
      )
    }

    function rows() {
      return Promise.all([
        db.query<{ stopped_on: string | null; updated_at: string }>(
          'SELECT stopped_on, updated_at FROM treatment_period WHERE treatment_id = ?',
          [panacur],
        ),
        db.query<{ due_on: string; status: string; deleted_at: string | null; updated_at: string }>(
          `SELECT due_on, status, deleted_at, updated_at FROM treatment_dose
           WHERE treatment_id = ? ORDER BY due_on`,
          [panacur],
        ),
      ])
    }

    beforeEach(async () => {
      panacur = crypto.randomUUID()
      await treatments.create({
        id: panacur,
        animalId: BOREE,
        name: 'Panacur',
        type: 'deworming',
        settings: {
          startsOn: '2026-09-20',
          firstDueOn: '2026-09-20',
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

    it('garde le traitement à renseigner quand on arrête sans renseigner', async () => {
      await expect(service.stop(panacur)).resolves.toMatchObject({ stopped: true, finished: false })
    })

    it('écrit les prises et l’arrêt en une seule transaction, et termine le traitement', async () => {
      const runMany = vi.spyOn(db, 'runMany')

      const stopped = await service.stop(panacur, [
        given('2026-09-20'),
        given('2026-09-21'),
        { kind: 'missed', due: due('2026-09-22') },
      ])

      expect(runMany).toHaveBeenCalledOnce()
      expect(stopped).toMatchObject({ animalId: BOREE, stopped: true, finished: true })
      expect(stopped.undo).toHaveLength(3)
      const [periods, doses] = await rows()
      expect(periods).toEqual([{ stopped_on: '2026-09-23', updated_at: STOPPED_AT }])
      expect(doses.map(({ due_on, status }) => [due_on, status])).toEqual([
        ['2026-09-20', 'given'],
        ['2026-09-21', 'given'],
        ['2026-09-22', 'missed'],
      ])
    })

    it('« Annuler » défait l’arrêt et les prises écrites, à son propre instant', async () => {
      const stopped = await service.stop(panacur, [given('2026-09-20'), given('2026-09-21')])
      expect(reminded()).toBe(false)
      vi.setSystemTime(new Date(UNDONE_AT))
      const runMany = vi.spyOn(db, 'runMany')

      await service.undo(panacur, stopped.undo)

      expect(runMany).toHaveBeenCalledOnce()
      const [periods, doses] = await rows()
      expect(periods).toEqual([{ stopped_on: null, updated_at: UNDONE_AT }])
      expect(doses.map(({ deleted_at, updated_at }) => [deleted_at, updated_at])).toEqual([
        [UNDONE_AT, UNDONE_AT],
        [UNDONE_AT, UNDONE_AT],
      ])
      expect(reminded()).toBe(true)
    })

    it('D8 : « Annuler » puis aussitôt « C’est fait » sur une dose renseignée : elle est notée de nouveau', async () => {
      const queue = createWriteQueue()
      const shared = { treatments: () => treatments, reminders, now: () => new Date() }
      const stopping = createTreatmentStopService({
        ...shared,
        periods: () => createTreatmentPeriodsRepository(db),
        doses: () => createTreatmentDosesRepository(db),
        today: () => '2026-09-23',
        newId: () => crypto.randomUUID(),
        queue,
      })
      const doses = createTreatmentDosesService({
        ...shared,
        doses: () => createTreatmentDosesRepository(db),
        today: () => '2026-09-23',
        queue,
      })
      const stopped = await stopping.stop(panacur, [given('2026-09-20')])
      vi.setSystemTime(new Date(UNDONE_AT))

      const [, again] = await Promise.all([
        stopping.undo(panacur, stopped.undo),
        doses.apply(panacur, { kind: 'note', gesture: given('2026-09-20') }),
      ])

      expect(again).toMatchObject({ alreadyGivenOn: null })
      const [, lines] = await rows()
      expect(lines.filter(({ deleted_at }) => deleted_at === null)).toHaveLength(1)
    })

    it('n’écrit rien pour un traitement déjà arrêté, même avec des doses', async () => {
      await service.stop(panacur)
      const runMany = vi.spyOn(db, 'runMany')

      await expect(service.stop(panacur, [given('2026-09-20')])).resolves.toMatchObject({
        stopped: false,
        undo: [],
      })

      expect(runMany).not.toHaveBeenCalled()
      const [, doses] = await rows()
      expect(doses).toEqual([])
    })

    it('n’écrit rien quand la période est arrêtée ailleurs entre la lecture et l’écriture', async () => {
      const doses = createTreatmentDosesRepository(db)
      const racing = createTreatmentStopService({
        treatments: () => treatments,
        periods: () => createTreatmentPeriodsRepository(db),
        doses: () => ({
          applyBatch: async (writes, at, also) => {
            await db.run(
              "UPDATE treatment_period SET stopped_on = '2026-09-22' WHERE treatment_id = ?",
              [panacur],
            )
            return doses.applyBatch(writes, at, also)
          },
        }),
        reminders: { reschedule: async () => {} },
        today: () => '2026-09-23',
        now: () => new Date(),
        newId: () => crypto.randomUUID(),
      })

      await expect(racing.stop(panacur, [given('2026-09-20')])).resolves.toEqual({
        animalId: BOREE,
        stopped: false,
        finished: false,
        undo: [],
      })

      const [periods, written] = await rows()
      expect(periods).toMatchObject([{ stopped_on: '2026-09-22' }])
      expect(written).toEqual([])
    })

    it('n’arrête pas un traitement fini par sa date de fin', async () => {
      await db.run("UPDATE treatment_period SET ends_on = '2026-09-21' WHERE treatment_id = ?", [
        panacur,
      ])

      await expect(service.stop(panacur)).resolves.toMatchObject({ stopped: false, undo: [] })
      await expect(service.stop(panacur, [given('2026-09-20')])).resolves.toMatchObject({
        stopped: false,
      })

      const [periods, doses] = await rows()
      expect(periods).toMatchObject([{ stopped_on: null }])
      expect(doses).toEqual([])
    })

    it('n’arrête rien quand une dose du lot est déjà notée', async () => {
      await service.stop(panacur, [given('2026-09-20')])
      await service.undo(panacur, [])
      await createTreatmentDosesRepository(db).applyBatch(
        [
          {
            action: 'create',
            id: crypto.randomUUID(),
            treatmentId: panacur,
            animalId: BOREE,
            dose: {
              periodId: panacur,
              dueOn: '2026-09-21',
              dueTime: null,
              givenOn: '2026-09-21',
              status: 'given',
              nextDueDate: '2026-09-22',
            },
          },
        ],
        STOPPED_AT,
      )

      await expect(service.stop(panacur, [given('2026-09-21')])).rejects.toBeInstanceOf(
        DoseAlreadyLoggedError,
      )

      const [periods] = await rows()
      expect(periods).toMatchObject([{ stopped_on: null }])
    })
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(service.stop('99999999-9999-4999-8999-999999999999')).rejects.toThrow(
      'Traitement introuvable',
    )
  })
})
