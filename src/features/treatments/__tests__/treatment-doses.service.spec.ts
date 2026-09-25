// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import {
  createTreatmentDosesService,
  type TreatmentDosesService,
} from '../service/treatment-doses.service'
import { createTreatmentRemindersService } from '../service/treatment-reminders.service'

const BOREE = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-09-23T08:00:00.000Z')

describe('treatmentDosesService', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let notifications: FakeNotifications
  let service: TreatmentDosesService
  let bravecto: string

  function dueDates(): string[] {
    return [...notifications.pending.keys()]
      .filter((key) => key.endsWith(':due'))
      .map((key) => key.split(':')[2]!)
      .sort()
  }

  function visibleDoses() {
    return db.query<{ given_on: string; next_due_date: string }>(
      `SELECT given_on, next_due_date FROM treatment_dose
       WHERE treatment_id = ? AND deleted_at IS NULL ORDER BY given_on`,
      [bravecto],
    )
  }

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
    service = createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => createTreatmentDosesRepository(db),
      reminders,
      now: () => new Date(),
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

  it('note la prise du jour : nouvelle tête, prochaine dose recalculée, rappels reprogrammés', async () => {
    expect(dueDates()[0]).toBe('2026-09-28')

    const recorded = await service.record(bravecto, '2026-09-23')

    expect(recorded).toEqual({ animalId: BOREE, doseId: expect.any(String) })
    await expect(visibleDoses()).resolves.toEqual([
      { given_on: '2026-08-28', next_due_date: '2026-09-28' },
      { given_on: '2026-09-23', next_due_date: '2026-10-23' },
    ])
    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: '2026-09-23',
      nextDueDate: '2026-10-23',
    })
    expect(dueDates()[0]).toBe('2026-10-23')
  })

  it('note une prise à une date passée, échéance calculée depuis cette date', async () => {
    await service.record(bravecto, '2026-09-20')

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: '2026-09-20',
      nextDueDate: '2026-10-20',
    })
  })

  it('ne note qu’une prise sur un double tap', async () => {
    const [premier, second] = await Promise.all([
      service.record(bravecto, '2026-09-23'),
      service.record(bravecto, '2026-09-23'),
    ])

    expect([premier.doseId, second.doseId].filter((id) => id !== null)).toHaveLength(1)
    await expect(visibleDoses()).resolves.toHaveLength(2)
  })

  it('refuse une prise dans le futur, sans rien écrire', async () => {
    await expect(service.record(bravecto, '2026-09-24')).rejects.toThrow(ZodError)

    await expect(visibleDoses()).resolves.toHaveLength(1)
  })

  it('annule la prise : la précédente redevient la tête, ses rappels reviennent', async () => {
    const { doseId } = await service.record(bravecto, '2026-09-23')

    await service.undo(bravecto, doseId!)

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: '2026-08-28',
      nextDueDate: '2026-09-28',
    })
    expect(dueDates()[0]).toBe('2026-09-28')
  })

  describe('historique', () => {
    async function noter(givenOn: string): Promise<string> {
      const { doseId } = await service.record(bravecto, givenOn)
      if (doseId === null) throw new Error('prise non notée')
      return doseId
    }

    it('supprime la dernière prise : la précédente redevient la tête, ses rappels reviennent', async () => {
      const derniere = await noter('2026-09-23')

      await service.remove(bravecto, derniere)

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-08-28',
        nextDueDate: '2026-09-28',
      })
      expect(dueDates()[0]).toBe('2026-09-28')
    })

    it('refuse de supprimer la seule prise d’un traitement', async () => {
      await expect(service.remove(bravecto, bravecto)).rejects.toThrow('Prise non supprimée')

      await expect(visibleDoses()).resolves.toHaveLength(1)
    })

    it('rétablit une prise supprimée (Annuler)', async () => {
      const derniere = await noter('2026-09-23')
      await service.remove(bravecto, derniere)

      await service.undoRemove(bravecto, derniere)

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        nextDueDate: '2026-10-23',
      })
      expect(dueDates()[0]).toBe('2026-10-23')
    })

    it('change la date de la dernière prise : la prochaine dose est recalculée', async () => {
      const derniere = await noter('2026-09-23')

      const avant = await service.changeDate(bravecto, derniere, '2026-09-21')

      expect(avant).toEqual({
        givenOn: '2026-09-23',
        nextDueDate: '2026-10-23',
        frequency: { value: 1, unit: 'month' },
      })
      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
        { given_on: '2026-09-21', next_due_date: '2026-10-21' },
      ])
      expect(dueDates()[0]).toBe('2026-10-21')
    })

    it('remet les dates d’avant le changement (Annuler)', async () => {
      const derniere = await noter('2026-09-23')
      const avant = await service.changeDate(bravecto, derniere, '2026-09-21')

      await service.undoChangeDate(bravecto, derniere, avant)

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-09-23',
        nextDueDate: '2026-10-23',
      })
    })

    it('refuse une date future ou déjà notée, sans rien écrire', async () => {
      const derniere = await noter('2026-09-23')

      await expect(service.changeDate(bravecto, derniere, '2026-09-24')).rejects.toThrow(ZodError)
      await expect(service.changeDate(bravecto, derniere, '2026-08-28')).rejects.toThrow(
        'Prise non modifiée',
      )

      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
        { given_on: '2026-09-23', next_due_date: '2026-10-23' },
      ])
    })
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(
      service.record('99999999-9999-4999-8999-999999999999', '2026-09-23'),
    ).rejects.toThrow('Traitement introuvable')
  })
})
