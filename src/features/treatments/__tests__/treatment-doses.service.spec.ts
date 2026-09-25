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

      const changement = await service.changeDate(bravecto, derniere, '2026-09-21')

      expect(changement).toEqual({
        previous: {
          givenOn: '2026-09-23',
          nextDueDate: '2026-10-23',
          frequency: { value: 1, unit: 'month' },
        },
        postponementKept: false,
      })
      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
        { given_on: '2026-09-21', next_due_date: '2026-10-21' },
      ])
      expect(dueDates()[0]).toBe('2026-10-21')
    })

    it('remet les dates d’avant le changement (Annuler)', async () => {
      const derniere = await noter('2026-09-23')
      const { previous } = await service.changeDate(bravecto, derniere, '2026-09-21')

      await service.undoChangeDate(bravecto, derniere, previous)

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-09-23',
        nextDueDate: '2026-10-23',
      })
    })

    it('garde un report manuel quand la prise est déplacée, et le dit', async () => {
      const trimestriel = (
        await treatments.create({
          animalId: BOREE,
          name: 'Bravecto trimestriel',
          type: 'antiparasitic',
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: '2026-08-28',
        })
      ).id
      await treatments.update(trimestriel, {
        name: 'Bravecto trimestriel',
        type: 'antiparasitic',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-12-15',
      })

      const changement = await service.changeDate(trimestriel, trimestriel, '2026-08-27')

      expect(changement.postponementKept).toBe(true)
      await expect(treatments.getById(trimestriel)).resolves.toMatchObject({
        lastDoseDate: '2026-08-27',
        nextDueDate: '2026-12-15',
      })
    })

    it('une prise qui devient la dernière prend la fréquence du plan et la recopie', async () => {
      const ancienne = await noter('2026-06-01')
      await treatments.update(bravecto, {
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-11-28',
      })

      await service.changeDate(bravecto, ancienne, '2026-09-01')

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-09-01',
        nextDueDate: '2026-12-01',
      })
      await expect(
        db.query('SELECT frequency_value, frequency_unit FROM treatment_dose WHERE id = ?', [
          ancienne,
        ]),
      ).resolves.toEqual([{ frequency_value: 3, frequency_unit: 'month' }])
      expect(dueDates()[0]).toBe('2026-12-01')
    })

    it('une prise qui cesse d’être la dernière rend la main à la précédente et à son échéance', async () => {
      const derniere = await noter('2026-09-10')

      await service.changeDate(bravecto, derniere, '2026-08-01')

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-08-28',
        nextDueDate: '2026-09-28',
      })
      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-01', next_due_date: '2026-09-01' },
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
      ])
    })

    it('ne dit pas « report gardé » quand la dernière passe avant la précédente', async () => {
      const trimestriel = (
        await treatments.create({
          animalId: BOREE,
          name: 'Bravecto trimestriel',
          type: 'antiparasitic',
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: '2026-08-28',
        })
      ).id
      await service.record(trimestriel, '2026-07-01')
      await treatments.update(trimestriel, {
        name: 'Bravecto trimestriel',
        type: 'antiparasitic',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-12-15',
      })

      const changement = await service.changeDate(trimestriel, trimestriel, '2026-06-15')

      expect(changement.postponementKept).toBe(false)
      await expect(treatments.getById(trimestriel)).resolves.toMatchObject({
        lastDoseDate: '2026-07-01',
      })
    })

    function frequenceDe(id: string) {
      return db.query('SELECT frequency_value, frequency_unit FROM treatment_dose WHERE id = ?', [
        id,
      ])
    }

    it('une prise précédente redatée garde sa fréquence, même si le plan en a une autre', async () => {
      const precedente = await noter('2026-06-01')
      await treatments.update(bravecto, {
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-11-28',
      })

      await service.changeDate(bravecto, precedente, '2026-06-05')

      await expect(frequenceDe(precedente)).resolves.toEqual([
        { frequency_value: 1, frequency_unit: 'month' },
      ])
      await expect(visibleDoses()).resolves.toContainEqual({
        given_on: '2026-06-05',
        next_due_date: '2026-07-05',
      })
    })

    it('sur un traitement arrêté, la dernière redatée garde sa fréquence', async () => {
      await treatments.stop(bravecto, '2026-09-01')
      await db.run(
        `UPDATE treatment SET frequency_value = 3, frequency_unit = 'month' WHERE id = ?`,
        [bravecto],
      )

      await service.changeDate(bravecto, bravecto, '2026-08-25')

      await expect(frequenceDe(bravecto)).resolves.toEqual([
        { frequency_value: 1, frequency_unit: 'month' },
      ])
      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-25', next_due_date: '2026-09-25' },
      ])
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

  it('dit l’échec d’une annulation qui n’a rien supprimé', async () => {
    const { doseId } = await service.record(bravecto, '2026-09-23')
    await service.remove(bravecto, bravecto)

    await expect(service.undo(bravecto, doseId!)).rejects.toThrow('Prise non annulée')

    await expect(visibleDoses()).resolves.toEqual([
      { given_on: '2026-09-23', next_due_date: '2026-10-23' },
    ])
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(
      service.record('99999999-9999-4999-8999-999999999999', '2026-09-23'),
    ).rejects.toThrow('Traitement introuvable')
  })
})
