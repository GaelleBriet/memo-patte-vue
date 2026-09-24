// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import { createTreatmentRemindersService } from '../service/treatment-reminders.service'
import {
  createTreatmentStopService,
  type TreatmentStopService,
} from '../service/treatment-stop.service'

const BOREE = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-23T08:00:00.000Z')

describe('treatmentStopService', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let notifications: FakeNotifications
  let service: TreatmentStopService
  let bravecto: string

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Boree', 'dog', ?, ?)`,
      [BOREE, NOW.toISOString(), NOW.toISOString()],
    )
    treatments = createTreatmentsRepository(db)
    notifications = createFakeNotifications()
    const reminders = createTreatmentRemindersService({
      treatments: () => treatments,
      animals: () => createAnimalsRepository(db),
      notifications,
      t: i18n.global.t,
      now: () => new Date(),
    })
    service = createTreatmentStopService({
      treatments: () => treatments,
      reminders,
      today: () => '2026-09-23',
    })
    bravecto = (
      await treatments.create({
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

  it('arrête le traitement aujourd’hui et retire tous ses rappels, prises gardées', async () => {
    expect(notifications.pending.size).toBeGreaterThan(0)

    await expect(service.stop(bravecto)).resolves.toEqual({ animalId: BOREE, stopped: true })

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      stoppedOn: '2026-09-23',
      lastDoseDate: '2026-08-28',
    })
    expect(notifications.pending.size).toBe(0)
  })

  it('annule l’arrêt : le traitement reprend avec ses rappels', async () => {
    await service.stop(bravecto)

    await service.undo(bravecto)

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({ stoppedOn: null })
    expect([...notifications.pending.keys()]).toContain(`treatment:${bravecto}:2026-09-28:due`)
  })

  it('dit qu’un traitement déjà arrêté ne l’a pas été de nouveau', async () => {
    await service.stop(bravecto)

    await expect(service.stop(bravecto)).resolves.toEqual({ animalId: BOREE, stopped: false })
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(service.stop('99999999-9999-4999-8999-999999999999')).rejects.toThrow(
      'Traitement introuvable',
    )
  })
})
