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
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import {
  createTreatmentDosesService,
  type TreatmentDosesService,
} from '../service/treatment-doses.service'
import { createTreatmentRemindersService } from '../service/treatment-reminders.service'
import { seedHeadEdit, seedTreatmentWithDose } from './seed-treatment'

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

  it('note la première prise d’un traitement sans prise', async () => {
    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE treatment_id = ?', [
      bravecto,
    ])

    await service.record(bravecto, '2026-09-23')

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: '2026-09-23',
      nextDueDate: '2026-10-23',
    })
    expect(dueDates()[0]).toBe('2026-10-23')
  })

  it('annule la première prise d’un traitement sans prise : plus aucune prise, rappels sur la première échéance', async () => {
    await db.run('UPDATE treatment_dose SET deleted_at = updated_at WHERE treatment_id = ?', [
      bravecto,
    ])
    await db.run('UPDATE treatment_period SET first_due_on = ? WHERE treatment_id = ?', [
      '2026-09-30',
      bravecto,
    ])
    const { doseId } = await service.record(bravecto, '2026-09-23')
    expect(dueDates()[0]).toBe('2026-10-23')

    await service.undo(bravecto, doseId!)

    await expect(visibleDoses()).resolves.toEqual([])
    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: null,
      nextDueDate: '2026-09-30',
    })
    expect(dueDates()[0]).toBe('2026-09-30')
  })

  it('note une prise à une date passée, échéance calculée depuis cette date', async () => {
    await service.record(bravecto, '2026-09-20')

    await expect(treatments.getById(bravecto)).resolves.toMatchObject({
      lastDoseDate: '2026-09-20',
      nextDueDate: '2026-10-20',
    })
  })

  describe('échéance visée', () => {
    function dueOns() {
      return db.query<{ given_on: string; due_on: string; status: string; period_id: string }>(
        `SELECT given_on, due_on, status, period_id FROM treatment_dose
         WHERE treatment_id = ? AND deleted_at IS NULL ORDER BY given_on`,
        [bravecto],
      )
    }

    it.each([
      ['en avance', '2026-09-23'],
      ['en retard', '2026-10-02'],
      ['pour un jour d’avant la dernière', '2026-08-01'],
    ])('une prise donnée %s vise son propre jour, dans la période en cours', async (_, day) => {
      vi.setSystemTime(new Date('2026-10-02T08:00:00.000Z'))

      await service.record(bravecto, day)

      await expect(dueOns()).resolves.toContainEqual({
        given_on: day,
        due_on: day,
        status: 'given',
        period_id: bravecto,
      })
    })

    it('une prise notée pour un jour d’avant la dernière ne devient pas la dernière', async () => {
      await service.record(bravecto, '2026-08-01')

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-08-28',
        nextDueDate: '2026-09-28',
      })
    })

    it('après une prise en avance, une prochaine dose avancée à la main reste notable', async () => {
      await service.record(bravecto, '2026-09-23')
      await seedHeadEdit(db, bravecto, {
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        nextDueDate: '2026-09-25',
      })
      vi.setSystemTime(new Date('2026-09-25T08:00:00.000Z'))

      await service.record(bravecto, '2026-09-25')

      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-09-25',
        nextDueDate: '2026-10-25',
      })
    })

    it('un quotidien rattrapé après coup garde son historique dans l’ordre des dates, et sa dernière prise après une suppression', async () => {
      vi.setSystemTime(new Date('2026-09-01T08:00:00.000Z'))
      const panacur = (
        await seedTreatmentWithDose(db, {
          animalId: BOREE,
          name: 'Panacur',
          type: 'deworming',
          frequency: { value: 1, unit: 'day' },
          lastDoseDate: '2026-09-01',
        })
      ).id
      vi.setSystemTime(new Date('2026-09-02T08:00:00.000Z'))
      await service.record(panacur, '2026-09-02')
      vi.setSystemTime(new Date('2026-09-05T08:00:00.000Z'))
      const { doseId } = await service.record(panacur, '2026-09-05')
      vi.setSystemTime(new Date('2026-09-05T08:01:00.000Z'))
      await service.record(panacur, '2026-09-04')
      vi.setSystemTime(new Date('2026-09-05T08:02:00.000Z'))
      await service.record(panacur, '2026-09-03')

      expect((await treatments.listDoses(panacur)).map(({ givenOn }) => givenOn)).toEqual([
        '2026-09-05',
        '2026-09-04',
        '2026-09-03',
        '2026-09-02',
        '2026-09-01',
      ])

      await service.remove(panacur, doseId!)

      await expect(treatments.getById(panacur)).resolves.toMatchObject({
        lastDoseDate: '2026-09-04',
        nextDueDate: '2026-09-05',
      })
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
        previous: { givenOn: '2026-09-23', dueOn: '2026-09-23', nextDueDate: '2026-10-23' },
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
      await expect(
        db.query('SELECT due_on FROM treatment_dose WHERE id = ?', [derniere]),
      ).resolves.toEqual([{ due_on: '2026-09-23' }])
    })

    it('garde un report manuel quand la prise est déplacée, et le dit', async () => {
      const trimestriel = (
        await seedTreatmentWithDose(db, {
          animalId: BOREE,
          name: 'Bravecto trimestriel',
          type: 'antiparasitic',
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: '2026-08-28',
        })
      ).id
      await seedHeadEdit(db, trimestriel, {
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

    it('ne dit pas « report gardé » pour une prise d’une période précédente', async () => {
      await seedHeadEdit(db, bravecto, {
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 1, unit: 'month' },
        nextDueDate: '2026-10-15',
      })
      await db.runMany([
        createTreatmentPeriodsRepository(db).insertStatement({
          id: 'reprise',
          treatmentId: bravecto,
          animalId: BOREE,
          startsOn: '2026-09-20',
          firstDueOn: '2026-11-01',
          frequency: { value: 1, unit: 'month' },
          stoppedOn: null,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          deletedAt: null,
        }),
      ])

      const changement = await service.changeDate(bravecto, bravecto, '2026-08-27')

      expect(changement.postponementKept).toBe(false)
      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: null,
        nextDueDate: '2026-11-01',
      })
    })

    it('une prise qui devient la dernière fixe la prochaine dose avec la fréquence de sa période', async () => {
      const ancienne = await noter('2026-06-01')
      await seedHeadEdit(db, bravecto, {
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
        await seedTreatmentWithDose(db, {
          animalId: BOREE,
          name: 'Bravecto trimestriel',
          type: 'antiparasitic',
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: '2026-08-28',
        })
      ).id
      await service.record(trimestriel, '2026-07-01')
      await seedHeadEdit(db, trimestriel, {
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

    it('une prise précédente redatée recalcule sa prochaine dose, sans devenir la dernière', async () => {
      const precedente = await noter('2026-06-01')

      await service.changeDate(bravecto, precedente, '2026-06-05')

      await expect(visibleDoses()).resolves.toContainEqual({
        given_on: '2026-06-05',
        next_due_date: '2026-07-05',
      })
      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-08-28',
        nextDueDate: '2026-09-28',
      })
    })

    it('après un changement de fréquence, une prise précédente redatée garde sa prochaine dose, lue comme un report', async () => {
      const precedente = await noter('2026-06-01')
      await seedHeadEdit(db, bravecto, {
        name: 'Bravecto',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        nextDueDate: '2026-11-28',
      })

      const changement = await service.changeDate(bravecto, precedente, '2026-06-05')

      expect(changement.postponementKept).toBe(false)
      await expect(visibleDoses()).resolves.toContainEqual({
        given_on: '2026-06-05',
        next_due_date: '2026-07-01',
      })
    })

    it('sur un traitement arrêté dont la fréquence a changé, la dernière redatée garde sa prochaine dose, lue comme un report', async () => {
      await createTreatmentPeriodsRepository(db).stop(bravecto, '2026-09-01')
      await db.run(
        `UPDATE treatment_period SET frequency_value = 3, frequency_unit = 'month'
         WHERE treatment_id = ?`,
        [bravecto],
      )

      const changement = await service.changeDate(bravecto, bravecto, '2026-08-25')

      expect(changement.postponementKept).toBe(true)
      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-25', next_due_date: '2026-09-28' },
      ])
    })

    it('garde l’historique dans l’ordre des dates et la dernière prise la plus tardive, quels que soient les gestes', async () => {
      let seed = 452
      const random = (max: number) => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed % max
      }
      const day = () => `2026-09-${String(1 + random(23)).padStart(2, '0')}`

      for (let step = 0; step < 60; step += 1) {
        const doses = await treatments.listDoses(bravecto)
        const target = doses[random(doses.length)]!
        const gesture = random(3)
        if (gesture === 0) await service.record(bravecto, day())
        else if (gesture === 1) await service.changeDate(bravecto, target.id, day()).catch(() => {})
        else await service.remove(bravecto, target.id).catch(() => {})

        const days = (await treatments.listDoses(bravecto)).map(({ givenOn }) => givenOn)
        expect(days).toEqual([...days].sort().reverse())
        expect((await treatments.getById(bravecto))?.lastDoseDate).toBe(days[0])
      }
    })

    it('refuse de redater une prise qui n’a pas été donnée', async () => {
      await db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, status,
           next_due_date, created_at, updated_at)
         VALUES ('oubliee', ?, ?, ?, '2026-09-28', 'missed', '2026-10-28', ?, ?)`,
        [bravecto, bravecto, BOREE, NOW.toISOString(), NOW.toISOString()],
      )

      await expect(service.changeDate(bravecto, 'oubliee', '2026-09-20')).rejects.toThrow(
        'Prise non donnée',
      )
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
    await service.undo(bravecto, doseId!)

    await expect(service.undo(bravecto, doseId!)).rejects.toThrow('Prise non annulée')

    await expect(visibleDoses()).resolves.toEqual([
      { given_on: '2026-08-28', next_due_date: '2026-09-28' },
    ])
  })

  it('annule la prise du jour même quand elle est devenue la seule', async () => {
    const { doseId } = await service.record(bravecto, '2026-09-23')
    await service.remove(bravecto, bravecto)

    await service.undo(bravecto, doseId!)

    await expect(visibleDoses()).resolves.toEqual([])
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(
      service.record('99999999-9999-4999-8999-999999999999', '2026-09-23'),
    ).rejects.toThrow('Traitement introuvable')
  })
})
