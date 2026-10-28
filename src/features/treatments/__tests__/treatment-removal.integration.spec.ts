// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createWriteQueue, type WriteQueue } from '@/core/write-queue/treatment-write-queue'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import { createTreatmentRemovalService } from '../service/treatment-removal.service'
import { seedTreatmentWithDose } from './seed-treatment'

const LUNA = '22222222-2222-4222-8222-222222222222'
const NOW = new Date(2026, 8, 23, 8)

function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { opened, open }
}

const otherTasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('suppression d’un traitement et file des écritures', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let queue: WriteQueue
  let metacam: string
  const reminders = { reschedule: async () => {} }

  function removal(repository: Pick<TreatmentsRepository, 'remove' | 'restore'> = treatments) {
    return createTreatmentRemovalService({
      treatments: repository,
      reminders: () => reminders,
      queue,
    })
  }

  function doseLines() {
    return db.query<{ given_on: string; deleted_at: string | null }>(
      `SELECT given_on, deleted_at FROM treatment_dose WHERE treatment_id = ? ORDER BY given_on`,
      [metacam],
    )
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Luna', 'cat', ?, ?, 'appareil-test', 'appareil-test')`,
      [LUNA, NOW.toISOString(), NOW.toISOString()],
    )
    treatments = createTreatmentsRepository(db)
    queue = createWriteQueue()
    metacam = (
      await seedTreatmentWithDose(db, {
        animalId: LUNA,
        name: 'Métacam',
        type: 'medication',
        frequency: { value: 1, unit: 'day' },
        lastDoseDate: '2026-09-22',
      })
    ).id
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('« C’est fait » d’une notification en cours : « Supprimer » l’attend et marque la prise, « Annuler » la rend', async () => {
    const read = gate()
    const resume = gate()
    const notification = createTreatmentDosesService({
      treatments: () => ({
        async getWithPeriods(id: string) {
          const treatment = await treatments.getWithPeriods(id)
          read.open()
          await resume.opened
          return treatment
        },
      }),
      doses: () => createTreatmentDosesRepository(db),
      reminders,
      now: () => new Date(),
      queue,
    })

    const noting = notification.apply(metacam, {
      kind: 'note',
      gesture: {
        kind: 'note',
        status: 'given',
        due: { settingId: metacam, dueOn: '2026-09-23', dueTime: null },
        givenOn: '2026-09-23',
        shiftsFollowing: false,
      },
    })
    await read.opened
    const removing = removal().remove(metacam)
    await otherTasks()
    resume.open()
    await noting
    const deletedAt = await removing

    await expect(doseLines()).resolves.toEqual([
      { given_on: '2026-09-22', deleted_at: deletedAt },
      { given_on: '2026-09-23', deleted_at: deletedAt },
    ])

    await removal().restore(metacam, deletedAt)

    await expect(doseLines()).resolves.toEqual([
      { given_on: '2026-09-22', deleted_at: null },
      { given_on: '2026-09-23', deleted_at: null },
    ])
  })

  it('« Annuler » attend l’écriture déjà en file avant de rétablir le traitement', async () => {
    const deletedAt = await removal().remove(metacam)
    const order: string[] = []
    const queued = gate()
    const pending = queue(async () => {
      await queued.opened
      order.push('écriture en file')
    })

    const restoring = removal({
      remove: treatments.remove,
      restore: async (id, at) => {
        order.push('rétablissement')
        await treatments.restore(id, at)
      },
    }).restore(metacam, deletedAt)
    await otherTasks()
    queued.open()
    await Promise.all([pending, restoring])

    expect(order).toEqual(['écriture en file', 'rétablissement'])
  })
})
