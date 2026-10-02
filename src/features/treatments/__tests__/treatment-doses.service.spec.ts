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
      await treatments.update(bravecto, {
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
        await treatments.create({
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

      await service.apply(panacur, { kind: 'remove', doseId: doseId! })

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

  describe('gestes de la fiche, calculés par le moteur', () => {
    const DOSE_DE_SEPTEMBRE = { periodId: '', dueOn: '2026-09-28', dueTime: null }

    function septembre() {
      return { ...DOSE_DE_SEPTEMBRE, periodId: bravecto }
    }

    function rows() {
      return db.query<{
        due_on: string
        given_on: string | null
        status: string
        next_due_date: string
        updated_at: string
        deleted_at: string | null
      }>(
        `SELECT due_on, given_on, status, next_due_date, updated_at, deleted_at
         FROM treatment_dose WHERE treatment_id = ? ORDER BY due_on`,
        [bravecto],
      )
    }

    it('note la dose du moment en avance : la suite repart de la date réelle, rappels reprogrammés', async () => {
      const applied = await service.apply(bravecto, {
        kind: 'note',
        gesture: { kind: 'given', due: septembre(), givenOn: '2026-09-23' },
      })

      expect(applied).toMatchObject({ animalId: BOREE, alreadyGivenOn: null, postponement: null })
      expect(applied.undo).toEqual([{ action: 'delete', id: expect.any(String) }])
      await expect(rows()).resolves.toMatchObject([
        { due_on: '2026-08-28', given_on: '2026-08-28', next_due_date: '2026-09-28' },
        { due_on: '2026-09-28', given_on: '2026-09-23', next_due_date: '2026-10-23' },
      ])
      expect(dueDates()[0]).toBe('2026-10-23')
    })

    it('« Annuler » rejoue le lot inverse à son propre instant : la ligne est datée de l’annulation', async () => {
      const { undo } = await service.apply(bravecto, {
        kind: 'note',
        gesture: { kind: 'given', due: septembre(), givenOn: '2026-09-23' },
      })
      const later = new Date('2026-09-23T08:00:04.000Z')
      vi.setSystemTime(later)

      await service.undoBatch(bravecto, undo)

      await expect(rows()).resolves.toMatchObject([
        { due_on: '2026-08-28', deleted_at: null, updated_at: NOW.toISOString() },
        {
          due_on: '2026-09-28',
          deleted_at: later.toISOString(),
          updated_at: later.toISOString(),
        },
      ])
      expect(dueDates()[0]).toBe('2026-09-28')
    })

    it('n’écrit rien pour une échéance déjà donnée, et dit quand elle l’a été', async () => {
      const applied = await service.apply(bravecto, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: bravecto, dueOn: '2026-08-28', dueTime: null },
          givenOn: '2026-09-23',
        },
      })

      expect(applied).toEqual({
        animalId: BOREE,
        undo: [],
        alreadyGivenOn: '2026-08-28',
        postponement: null,
      })
      await expect(visibleDoses()).resolves.toHaveLength(1)
    })

    it('supprime la seule prise : le traitement reste, son échéance revient', async () => {
      const { undo } = await service.apply(bravecto, { kind: 'remove', doseId: bravecto })

      await expect(visibleDoses()).resolves.toEqual([])
      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: null,
        nextDueDate: '2026-08-28',
      })

      await service.undoBatch(bravecto, undo)

      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
      ])
      expect(dueDates()[0]).toBe('2026-09-28')
    })

    it('marque oubliée la seule prise donnée', async () => {
      await service.apply(bravecto, {
        kind: 'note',
        gesture: {
          kind: 'missed',
          due: { periodId: bravecto, dueOn: '2026-08-28', dueTime: null },
        },
      })

      await expect(rows()).resolves.toMatchObject([
        { due_on: '2026-08-28', given_on: null, status: 'missed', next_due_date: '2026-09-28' },
      ])
    })

    it('change la date d’une prise et dit le report gardé', async () => {
      await service.apply(bravecto, {
        kind: 'note',
        gesture: { kind: 'given', due: septembre(), givenOn: '2026-09-23' },
      })
      const [, prise] = await treatments.listDoses(bravecto).then((doses) => doses.reverse())
      await db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
           given_on, status, next_due_date, created_at, updated_at)
         VALUES ('report', ?, ?, ?, '2026-10-23', NULL, NULL, 'postponed', '2026-10-30', ?, ?)`,
        [bravecto, bravecto, BOREE, '2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00.000Z'],
      )

      const applied = await service.apply(bravecto, {
        kind: 'redate',
        doseId: prise!.id,
        givenOn: '2026-09-21',
      })

      expect(applied.postponement).toEqual({ kept: true, nextDueDate: '2026-10-30' })
      await expect(rows()).resolves.toMatchObject([
        { due_on: '2026-08-28' },
        { due_on: '2026-09-28', given_on: '2026-09-21', next_due_date: '2026-10-21' },
        { due_on: '2026-10-21', status: 'postponed', next_due_date: '2026-10-30' },
      ])
    })

    it('n’écrit rien quand le moteur refuse le geste', async () => {
      await expect(
        service.apply(bravecto, { kind: 'redate', doseId: bravecto, givenOn: '2026-09-24' }),
      ).rejects.toThrow(RangeError)

      await expect(visibleDoses()).resolves.toEqual([
        { given_on: '2026-08-28', next_due_date: '2026-09-28' },
      ])
    })

    it('lève pour un traitement introuvable', async () => {
      await expect(
        service.apply('99999999-9999-4999-8999-999999999999', { kind: 'remove', doseId: 'x' }),
      ).rejects.toThrow('Traitement introuvable')
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
    await service.apply(bravecto, { kind: 'remove', doseId: bravecto })

    await service.undo(bravecto, doseId!)

    await expect(visibleDoses()).resolves.toEqual([])
  })

  it('lève pour un traitement introuvable', async () => {
    await expect(
      service.record('99999999-9999-4999-8999-999999999999', '2026-09-23'),
    ).rejects.toThrow('Traitement introuvable')
  })
})
