// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { DoseAction } from '../logic/treatment-dose-writes'
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
import { seedTreatmentWithDose } from './seed-treatment'

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
       WHERE treatment_id = ? AND deleted_at IS NULL AND status <> 'shift' ORDER BY given_on`,
      [bravecto],
    )
  }

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

  describe('noter la dose du moment — feuille « À faire » et notification', () => {
    const LUNA_AT = '2026-09-01T08:00:00.000Z'

    async function creer(
      id: string,
      settings: {
        firstDueOn: string
        frequency: { value: number; unit: 'day' | 'week' | 'month' }
        times?: string[]
        endsOn?: string
      },
    ): Promise<string> {
      await db.runMany([
        {
          sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
                VALUES (?, ?, 'Métacam', 'medication', ?, ?, 'appareil-test', 'appareil-test')`,
          params: [id, BOREE, LUNA_AT, LUNA_AT],
        },
        createTreatmentPeriodsRepository(db).insertStatement({
          id,
          treatmentId: id,
          animalId: BOREE,
          startsOn: settings.firstDueOn,
          firstDueOn: settings.firstDueOn,
          endsOn: settings.endsOn ?? null,
          frequency: settings.frequency,
          times: settings.times ?? [],
          stoppedOn: null,
          createdAt: LUNA_AT,
          updatedAt: LUNA_AT,
          deletedAt: null,
        }),
      ])
      return id
    }

    function lignes(id: string) {
      return db.query<{ due_on: string; due_time: string | null; given_on: string | null }>(
        `SELECT due_on, due_time, given_on FROM treatment_dose
         WHERE treatment_id = ? AND deleted_at IS NULL AND status <> 'shift'
         ORDER BY due_on, due_time`,
        [id],
      )
    }

    async function fiche(id: string) {
      const history = await treatments.getWithHistory(id)
      return treatmentScheduleOf(history!, todayIsoDate())
    }

    const DEUX_HEURES = {
      firstDueOn: '2026-09-23',
      frequency: { value: 1, unit: 'day' as const },
      times: ['08:00', '20:00'],
    }
    const HEBDO = { firstDueOn: '2026-09-18', frequency: { value: 1, unit: 'week' as const } }

    it('note en avance la prochaine dose d’un mensuel, rappels reprogrammés', async () => {
      const noted = await service.noteMoment(bravecto, '2026-09-23')

      expect(noted).toMatchObject({
        animalId: BOREE,
        alreadyGivenOn: null,
        due: { periodId: bravecto, dueOn: '2026-09-28', dueTime: null },
        severalTimes: false,
      })
      await expect(treatments.getById(bravecto)).resolves.toMatchObject({
        lastDoseDate: '2026-09-23',
        nextDueDate: '2026-10-23',
      })
      expect(dueDates()[0]).toBe('2026-10-23')

      await service.undoBatch(bravecto, noted.undo)

      expect(dueDates()[0]).toBe('2026-09-28')
    })

    it('(a) à 8 h et 20 h, note la première heure sans prise : la fiche garde la dose de 20 h du jour', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)

      const noted = await service.noteMoment(metacam, '2026-09-23')

      expect(noted).toMatchObject({
        due: { dueOn: '2026-09-23', dueTime: '08:00' },
        severalTimes: true,
      })
      await expect(lignes(metacam)).resolves.toEqual([
        { due_on: '2026-09-23', due_time: '08:00', given_on: '2026-09-23' },
      ])
      await expect(fiche(metacam)).resolves.toMatchObject({
        phase: 'today',
        currentDoses: [{ dueOn: '2026-09-23', dueTime: '20:00' }],
      })
    })

    it('(b) fiche d’abord, puis feuille le même jour : l’heure suivante, puis « déjà notée », sans rien écrire', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      await service.apply(metacam, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: metacam, dueOn: '2026-09-23', dueTime: '08:00' },
          givenOn: '2026-09-23',
        },
      })

      const soir = await service.noteMoment(metacam, '2026-09-23')
      const encore = await service.noteMoment(metacam, '2026-09-23')

      expect(soir.due).toMatchObject({ dueOn: '2026-09-23', dueTime: '20:00' })
      expect(encore).toMatchObject({ undo: [], alreadyGivenOn: '2026-09-23', due: null })
      await expect(lignes(metacam)).resolves.toHaveLength(2)
    })

    it('(b) feuille d’abord, puis fiche : la fiche dit « déjà notée » pour l’heure notée par la feuille', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      await service.noteMoment(metacam, '2026-09-23')

      const applied = await service.apply(metacam, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: metacam, dueOn: '2026-09-23', dueTime: '08:00' },
          givenOn: '2026-09-23',
        },
      })

      expect(applied).toMatchObject({ undo: [], alreadyGivenOn: '2026-09-23' })
      await expect(lignes(metacam)).resolves.toHaveLength(1)
    })

    it('(c) dose en retard notée aujourd’hui : elle vise son échéance, aucune dose non renseignée', async () => {
      const hebdo = await creer('hebdo', HEBDO)

      await service.noteMoment(hebdo, '2026-09-23')

      await expect(lignes(hebdo)).resolves.toEqual([
        { due_on: '2026-09-18', due_time: null, given_on: '2026-09-23' },
      ])
      await expect(fiche(hebdo)).resolves.toMatchObject({ phase: 'upcoming', unloggedDoses: [] })
    })

    it('(c) la feuille et la fiche écrivent la même ligne, dans un ordre comme dans l’autre', async () => {
      const parLaFeuille = await creer('feuille', HEBDO)
      const parLaFiche = await creer('fiche', HEBDO)

      await service.noteMoment(parLaFeuille, '2026-09-23')
      await service.apply(parLaFiche, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: parLaFiche, dueOn: '2026-09-18', dueTime: null },
          givenOn: '2026-09-23',
        },
      })

      await expect(lignes(parLaFeuille)).resolves.toEqual(await lignes(parLaFiche))
      await expect(service.noteMoment(parLaFiche, '2026-09-18')).resolves.toMatchObject({
        undo: [],
        alreadyGivenOn: '2026-09-23',
      })
    })

    it('« Fait à une autre date » vise la première échéance sans prise de ce jour', async () => {
      const metacam = await creer('metacam', { ...DEUX_HEURES, firstDueOn: '2026-09-20' })

      const noted = await service.noteMoment(metacam, '2026-09-21')

      expect(noted.due).toMatchObject({ dueOn: '2026-09-21', dueTime: '08:00' })
    })

    it('deux prises notées en même temps : une seule ligne, la seconde répond « déjà notée »', async () => {
      const hebdo = await creer('hebdo', HEBDO)

      const [premiere, seconde] = await Promise.all([
        service.noteMoment(hebdo, '2026-09-23'),
        service.noteMoment(hebdo, '2026-09-23'),
      ])

      await expect(lignes(hebdo)).resolves.toHaveLength(1)
      expect(premiere.undo).toHaveLength(2)
      expect(seconde).toMatchObject({ undo: [], alreadyGivenOn: '2026-09-23', due: null })
    })

    it('deux prises en plus notées en même temps : une seule ligne, la seconde répond « déjà notée »', async () => {
      const hebdo = await creer('hebdo', HEBDO)
      await service.noteMoment(hebdo, '2026-09-23')
      const enPlus: DoseAction = {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: hebdo, dueOn: '2026-09-30', dueTime: null },
          givenOn: '2026-09-23',
        },
      }

      const [premiere, seconde] = await Promise.all([
        service.apply(hebdo, enPlus),
        service.apply(hebdo, enPlus),
      ])

      await expect(lignes(hebdo)).resolves.toHaveLength(2)
      expect(premiere.undo).toHaveLength(1)
      expect(seconde).toMatchObject({ undo: [], alreadyGivenOn: '2026-09-23' })
    })

    function dueSlots(id: string): string[] {
      return [...notifications.pending.keys()]
        .filter((key) => key.startsWith(`treatment:${id}:`) && key.endsWith(':due'))
        .map((key) => key.split(':').slice(2, 4).join(' '))
        .sort()
    }

    it('RA-13 : une prise en plus reprogramme le soin sans changer son calendrier', async () => {
      const hebdo = await creer('hebdo', HEBDO)
      await service.noteMoment(hebdo, '2026-09-23')
      const before = dueSlots(hebdo)
      expect(before[0]).toBe('2026-09-30 ')
      notifications.scheduleReminders.mockClear()

      await service.apply(hebdo, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: hebdo, dueOn: '2026-09-30', dueTime: null },
          givenOn: '2026-09-23',
        },
      })

      expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
      expect(dueSlots(hebdo)).toEqual(before)
    })

    it('RA-13 : à 8 h et 20 h avec une date de fin, un rappel par heure et rien après la fin', async () => {
      const metacam = await creer('metacam', { ...DEUX_HEURES, endsOn: '2026-09-25' })

      await service.noteMoment(metacam, '2026-09-23')

      expect(dueSlots(metacam)).toEqual([
        '2026-09-23 2000',
        '2026-09-24 0800',
        '2026-09-24 2000',
        '2026-09-25 0800',
        '2026-09-25 2000',
      ])
    })

    it('refuse une prise dans le futur ou un traitement fini, sans rien écrire', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      await db.run('UPDATE treatment_period SET stopped_on = ? WHERE treatment_id = ?', [
        '2026-09-23',
        metacam,
      ])

      await expect(service.noteMoment(bravecto, '2026-09-24')).rejects.toThrow('date future')
      await expect(service.noteMoment(metacam, '2026-09-23')).resolves.toMatchObject({
        outcome: 'none',
        undo: [],
        due: null,
      })

      await expect(visibleDoses()).resolves.toHaveLength(1)
      await expect(lignes(metacam)).resolves.toEqual([])
    })

    it('second « Fait aujourd’hui » le même jour : « déjà notée aujourd’hui », rien d’écrit ; la fiche note une prise en plus', async () => {
      const hebdo = await creer('hebdo', HEBDO)
      await service.noteMoment(hebdo, '2026-09-23')

      const second = await service.noteMoment(hebdo, '2026-09-23')

      expect(second).toMatchObject({ outcome: 'already', undo: [], alreadyGivenOn: '2026-09-23' })
      await expect(lignes(hebdo)).resolves.toHaveLength(1)

      await service.apply(hebdo, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: hebdo, dueOn: '2026-09-30', dueTime: null },
          givenOn: '2026-09-23',
        },
      })

      await expect(lignes(hebdo)).resolves.toEqual([
        { due_on: '2026-09-18', due_time: null, given_on: '2026-09-23' },
        { due_on: '2026-09-23', due_time: null, given_on: '2026-09-23' },
      ])
      await expect(treatments.getById(hebdo)).resolves.toMatchObject({
        lastDoseDate: '2026-09-23',
        nextDueDate: '2026-09-30',
      })
      expect((await fiche(hebdo)).currentDoses).toEqual([
        { periodId: hebdo, dueOn: '2026-09-30', dueTime: null },
      ])
    })

    it('notification d’un jour dont une prise est déjà notée : rien n’est écrit, la feuille décidera', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      const notification = { notifiedDueOn: '2026-09-23' }

      const premiere = await service.noteMoment(metacam, '2026-09-23', notification)
      const seconde = await service.noteMoment(metacam, '2026-09-23', notification)

      expect(premiere).toMatchObject({
        outcome: 'noted',
        due: { dueOn: '2026-09-23', dueTime: '08:00' },
      })
      expect(seconde).toMatchObject({ outcome: 'ask', undo: [], due: null })
      await expect(lignes(metacam)).resolves.toHaveLength(1)
    })

    it('8 h marquée oubliée : la feuille puis la notification notent 20 h, jamais 8 h ; la fiche la corrige', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      const matin = { periodId: metacam, dueOn: '2026-09-23', dueTime: '08:00' }
      await service.apply(metacam, { kind: 'note', gesture: { kind: 'missed', due: matin } })

      const soir = await service.noteMoment(metacam, '2026-09-23')
      const feuille = await service.noteMoment(metacam, '2026-09-23')
      const notification = await service.noteMoment(metacam, '2026-09-23', {
        notifiedDueOn: '2026-09-22',
      })

      expect(soir.due).toMatchObject({ dueTime: '20:00' })
      expect(feuille).toMatchObject({ outcome: 'already', undo: [], alreadyGivenOn: '2026-09-23' })
      expect(notification).toMatchObject({ outcome: 'already', undo: [] })
      await expect(lignes(metacam)).resolves.toEqual([
        { due_on: '2026-09-23', due_time: '08:00', given_on: null },
        { due_on: '2026-09-23', due_time: '20:00', given_on: '2026-09-23' },
      ])

      await service.apply(metacam, {
        kind: 'note',
        gesture: { kind: 'given', due: matin, givenOn: '2026-09-23' },
      })

      await expect(lignes(metacam)).resolves.toMatchObject([
        { due_time: '08:00', given_on: '2026-09-23' },
        { due_time: '20:00', given_on: '2026-09-23' },
      ])
    })

    it('8 h et 20 h toutes deux oubliées : les doses du jour sont déjà notées, rien d’écrit', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      for (const dueTime of ['08:00', '20:00']) {
        await service.apply(metacam, {
          kind: 'note',
          gesture: { kind: 'missed', due: { periodId: metacam, dueOn: '2026-09-23', dueTime } },
        })
      }

      await expect(service.noteMoment(metacam, '2026-09-23')).resolves.toMatchObject({
        outcome: 'day-noted',
        undo: [],
        alreadyGivenOn: null,
      })
      await expect(lignes(metacam)).resolves.toMatchObject([{ given_on: null }, { given_on: null }])
    })

    it('notification d’un jour passé non renseigné : rien n’est écrit, la feuille décidera', async () => {
      const quotidien = await creer('quotidien', {
        firstDueOn: '2026-09-18',
        frequency: { value: 1, unit: 'day' },
      })

      const noted = await service.noteMoment(quotidien, '2026-09-23', {
        notifiedDueOn: '2026-09-20',
      })

      expect(noted).toMatchObject({ outcome: 'ask', undo: [], due: null })
      await expect(lignes(quotidien)).resolves.toEqual([])
    })

    it('notification de la veille touchée après minuit, à plusieurs heures : rien n’est écrit', async () => {
      const metacam = await creer('metacam', { ...DEUX_HEURES, firstDueOn: '2026-09-22' })

      const noted = await service.noteMoment(metacam, '2026-09-23', {
        notifiedDueOn: '2026-09-22',
      })

      expect(noted).toMatchObject({ outcome: 'ask', undo: [] })
      await expect(lignes(metacam)).resolves.toEqual([])
    })

    it('notification dont l’échéance est la dose du moment, du jour ou en retard : notée', async () => {
      const metacam = await creer('metacam', DEUX_HEURES)
      const hebdo = await creer('hebdo', HEBDO)

      const duJour = await service.noteMoment(metacam, '2026-09-23', {
        notifiedDueOn: '2026-09-23',
      })
      const enRetard = await service.noteMoment(hebdo, '2026-09-23', {
        notifiedDueOn: '2026-09-18',
      })

      expect(duJour).toMatchObject({ outcome: 'noted', due: { dueOn: '2026-09-23' } })
      expect(enRetard).toMatchObject({ outcome: 'noted', due: { dueOn: '2026-09-18' } })
    })

    describe('dose en retard et date de fin, sans case (Q4, #506)', () => {
      const QUATRE_SEMAINES = { value: 4, unit: 'week' as const }
      const loin = { firstDueOn: '2026-09-15', frequency: QUATRE_SEMAINES, endsOn: '2026-10-13' }
      const proche = { firstDueOn: '2026-09-01', frequency: QUATRE_SEMAINES, endsOn: '2026-09-29' }

      function decalages(id: string) {
        return db.query(
          `SELECT due_on FROM treatment_dose
           WHERE treatment_id = ? AND deleted_at IS NULL AND status = 'shift'`,
          [id],
        )
      }

      it('la dose prévue au moins une demi-fréquence après : elle reste, par la feuille et la notification', async () => {
        const feuille = await creer('feuille', loin)
        const notification = await creer('notification', loin)

        const parLaFeuille = await service.noteMoment(feuille, '2026-09-23')
        const parLaNotification = await service.noteMoment(notification, '2026-09-23', {
          notifiedDueOn: '2026-09-15',
        })

        for (const [id, noted] of [
          [feuille, parLaFeuille],
          [notification, parLaNotification],
        ] as const) {
          expect(noted).toMatchObject({ outcome: 'noted', finishes: false })
          await expect(decalages(id)).resolves.toEqual([])
          await expect(fiche(id)).resolves.toMatchObject({
            finished: false,
            currentDoses: [{ dueOn: '2026-10-13' }],
          })
        }
      })

      it('plusieurs doses avant la fin : la dose suivante loin, rien ne bouge ; proche, la dose perdue est dite', async () => {
        const SEMAINE = { value: 1, unit: 'week' as const }
        const loinLundi = await creer('loin', {
          firstDueOn: '2026-09-21',
          frequency: SEMAINE,
          endsOn: '2026-10-05',
        })
        const procheVendredi = await creer('proche', {
          firstDueOn: '2026-09-18',
          frequency: SEMAINE,
          endsOn: '2026-10-02',
        })

        const garde = await service.noteMoment(loinLundi, '2026-09-23')
        const coupe = await service.noteMoment(procheVendredi, '2026-09-23', {
          notifiedDueOn: '2026-09-18',
        })

        expect(garde).not.toHaveProperty('lostToEnd')
        await expect(decalages(loinLundi)).resolves.toEqual([])
        expect(coupe).toMatchObject({
          outcome: 'noted',
          finishes: false,
          lostToEnd: ['2026-10-02'],
        })
        await expect(decalages(procheVendredi)).resolves.toEqual([{ due_on: '2026-09-18' }])
      })

      it('à moins d’une demi-fréquence : le traitement se termine, par la feuille, la notification et la fiche', async () => {
        const feuille = await creer('feuille', proche)
        const notification = await creer('notification', proche)
        const parLaFiche = await creer('fiche', proche)

        const notes = [
          await service.noteMoment(feuille, '2026-09-23'),
          await service.noteMoment(notification, '2026-09-23', { notifiedDueOn: '2026-09-01' }),
          await service.apply(parLaFiche, {
            kind: 'note',
            gesture: {
              kind: 'given',
              due: { periodId: parLaFiche, dueOn: '2026-09-01', dueTime: null },
              givenOn: '2026-09-23',
            },
          }),
        ]

        for (const noted of notes) expect(noted).toMatchObject({ finishes: true })
        for (const id of [feuille, notification, parLaFiche]) {
          await expect(decalages(id)).resolves.toEqual([{ due_on: '2026-09-01' }])
          await expect(fiche(id)).resolves.toMatchObject({ finished: true })
        }
      })
    })

    it('lit le jour une seule fois : minuit pendant le geste ne repasse pas un oubli en donnée', async () => {
      const metacam = await creer('metacam', { ...DEUX_HEURES, times: [] })
      await service.apply(metacam, {
        kind: 'note',
        gesture: {
          kind: 'missed',
          due: { periodId: metacam, dueOn: '2026-09-23', dueTime: null },
        },
      })
      const days = ['2026-09-23', '2026-09-24']
      const aMinuit = createTreatmentDosesService({
        treatments: () => treatments,
        doses: () => createTreatmentDosesRepository(db),
        reminders: { reschedule: async () => {} },
        now: () => new Date(),
        today: () => days.shift() ?? '2026-09-24',
      })

      const noted = await aMinuit.noteMoment(metacam, '2026-09-23')

      expect(noted).toMatchObject({ outcome: 'day-noted', undo: [] })
      expect(days).toEqual(['2026-09-24'])
      await expect(lignes(metacam)).resolves.toEqual([
        { due_on: '2026-09-23', due_time: null, given_on: null },
      ])
    })

    it('notification d’une dose déjà donnée en avance : « déjà notée », rien d’écrit', async () => {
      await service.apply(bravecto, {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: { periodId: bravecto, dueOn: '2026-09-28', dueTime: null },
          givenOn: '2026-09-23',
        },
      })

      const noted = await service.noteMoment(bravecto, '2026-09-23', {
        notifiedDueOn: '2026-09-28',
      })

      expect(noted).toMatchObject({ outcome: 'already', undo: [], alreadyGivenOn: '2026-09-23' })
      await expect(visibleDoses()).resolves.toHaveLength(2)
    })

    it('lève pour un traitement introuvable', async () => {
      await expect(service.noteMoment('inconnu', '2026-09-23')).rejects.toThrow(
        'Traitement introuvable',
      )
    })
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
         FROM treatment_dose WHERE treatment_id = ? AND status <> 'shift' ORDER BY due_on`,
        [bravecto],
      )
    }

    it('note la dose du moment en avance : la suite repart de la date réelle, rappels reprogrammés', async () => {
      const applied = await service.apply(bravecto, {
        kind: 'note',
        gesture: { kind: 'given', due: septembre(), givenOn: '2026-09-23' },
      })

      expect(applied).toMatchObject({ animalId: BOREE, alreadyGivenOn: null, postponement: null })
      expect(applied.undo).toEqual([
        { action: 'delete', id: expect.any(String) },
        { action: 'delete', id: expect.any(String) },
      ])
      await expect(
        db.query(`SELECT due_on, next_due_date FROM treatment_dose WHERE status = 'shift'`),
      ).resolves.toEqual([{ due_on: '2026-09-28', next_due_date: '2026-09-23' }])
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
        finishes: false,
        undo: [],
        alreadyGivenOn: '2026-08-28',
        postponement: null,
        moved: null,
        shiftKept: false,
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
      const prise = (await treatments.listDoses(bravecto)).find(
        ({ dueOn, status }) => dueOn === '2026-09-28' && status === 'given',
      )
      await db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
           given_on, status, next_due_date, created_at, updated_at, created_by_device, updated_by_device)
         VALUES ('report', ?, ?, ?, '2026-10-23', NULL, NULL, 'postponed', '2026-10-30', ?, ?, 'appareil-test', 'appareil-test')`,
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
        { due_on: '2026-09-28', given_on: '2026-09-21', next_due_date: '2026-10-30' },
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
})
