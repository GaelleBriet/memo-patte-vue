// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  DuplicateDueError,
  createTreatmentDosesRepository,
  type DoseWrite,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import type { DoseFields } from '@/shared/domain/treatment-schedule'

const LUNA = '11111111-1111-4111-8111-111111111111'
const METACAM = 'metacam'
const PERIODE = 'metacam-1'
const T0 = '2026-09-01T08:00:00.000Z'
const T1 = '2026-09-28T09:00:00.000Z'
const T2 = '2026-09-28T09:05:00.000Z'
const T3 = '2026-09-28T09:05:04.000Z'

function fields(overrides: Partial<DoseFields> = {}): DoseFields {
  return {
    periodId: PERIODE,
    dueOn: '2026-09-27',
    dueTime: '08:00',
    givenOn: '2026-09-27',
    status: 'given',
    nextDueDate: '2026-09-27',
    ...overrides,
  }
}

const MATIN = fields()
const SOIR = fields({ dueTime: '20:00', nextDueDate: '2026-09-28' })
const OWNER = { treatmentId: METACAM, animalId: LUNA }

describe('treatmentDosesRepository — écrire ce que rend le moteur', () => {
  let db: InMemoryDb
  let doses: TreatmentDosesRepository

  async function visible() {
    const rows = await doses.listByTreatment(METACAM)
    return rows
      .map(({ id, periodId, dueOn, dueTime, givenOn, status, nextDueDate }) => ({
        id,
        periodId,
        dueOn,
        dueTime,
        givenOn,
        status,
        nextDueDate,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  async function row(id: string) {
    const [found] = await db.query<{
      created_at: string
      updated_at: string
      deleted_at: string | null
    }>('SELECT created_at, updated_at, deleted_at FROM treatment_dose WHERE id = ?', [id])
    return found
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    doses = createTreatmentDosesRepository(db)
    await db.runMany([
      {
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
              VALUES (?, 'Luna', 'cat', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [LUNA, T0, T0],
      },
      {
        sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at, created_by_device, updated_by_device)
              VALUES (?, ?, 'Métacam', 'medication', ?, ?, 'appareil-test', 'appareil-test')`,
        params: [METACAM, LUNA, T0, T0],
      },
      createTreatmentPeriodsRepository(db).insertStatement({
        id: PERIODE,
        treatmentId: METACAM,
        animalId: LUNA,
        startsOn: '2026-09-21',
        firstDueOn: '2026-09-21',
        frequency: { value: 1, unit: 'day' },
        times: ['08:00', '20:00'],
        stoppedOn: null,
        createdAt: T0,
        updatedAt: T0,
        deletedAt: null,
      }),
    ])
  })

  afterEach(() => {
    db.close()
  })

  describe('instructions', () => {
    it('crée deux prises du même jour à deux heures : l’unicité est celle de l’échéance', async () => {
      await db.runMany([
        doses.createStatement({ id: 'matin', ...OWNER, dose: MATIN, at: T1 }),
        doses.createStatement({ id: 'soir', ...OWNER, dose: SOIR, at: T1 }),
      ])

      await expect(visible()).resolves.toEqual([
        { id: 'matin', ...MATIN },
        { id: 'soir', ...SOIR },
      ])
      await expect(row('matin')).resolves.toEqual({
        created_at: T1,
        updated_at: T1,
        deleted_at: null,
      })
    })

    it('crée une prise oubliée et un report, sans date réelle', async () => {
      const oubliee = fields({ givenOn: null, status: 'missed', nextDueDate: '2026-09-28' })
      const report = fields({
        dueOn: '2026-09-29',
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-10-02',
      })

      await db.runMany([
        doses.createStatement({ id: 'oubliee', ...OWNER, dose: oubliee, at: T1 }),
        doses.createStatement({ id: 'report', ...OWNER, dose: report, at: T1 }),
      ])

      await expect(visible()).resolves.toEqual([
        { id: 'oubliee', ...oubliee },
        { id: 'report', ...report },
      ])
    })

    it('réécrit une ligne avec de nouveaux champs, sans changer sa création', async () => {
      await db.runMany([doses.createStatement({ id: 'matin', ...OWNER, dose: MATIN, at: T1 })])
      const redatee = fields({ givenOn: '2026-09-28', nextDueDate: '2026-09-28' })

      await db.runMany([doses.rewriteStatement('matin', redatee, T2)])

      await expect(visible()).resolves.toEqual([{ id: 'matin', ...redatee }])
      await expect(row('matin')).resolves.toMatchObject({ created_at: T1, updated_at: T2 })
    })

    it('supprime logiquement une liste de lignes, sans redater celles déjà supprimées', async () => {
      await db.runMany([
        doses.createStatement({ id: 'matin', ...OWNER, dose: MATIN, at: T1 }),
        doses.createStatement({ id: 'soir', ...OWNER, dose: SOIR, at: T1 }),
        doses.createStatement({
          id: 'garde',
          ...OWNER,
          dose: fields({ dueOn: '2026-09-26' }),
          at: T1,
        }),
        doses.markDeletedStatement(['soir'], T1),
      ])

      await db.runMany([doses.markDeletedStatement(['matin', 'soir'], T2)])

      expect((await visible()).map(({ id }) => id)).toEqual(['garde'])
      await expect(row('matin')).resolves.toMatchObject({ deleted_at: T2, updated_at: T2 })
      await expect(row('soir')).resolves.toMatchObject({ deleted_at: T1, updated_at: T1 })
    })

    it('ne supprime rien pour une liste vide', async () => {
      await db.runMany([doses.createStatement({ id: 'matin', ...OWNER, dose: MATIN, at: T1 })])

      await db.runMany([doses.markDeletedStatement([], T2)])

      await expect(visible()).resolves.toHaveLength(1)
    })
  })

  describe('lot', () => {
    const DEPART: DoseWrite[] = [
      { action: 'create', id: 'matin', ...OWNER, dose: MATIN },
      { action: 'create', id: 'soir', ...OWNER, dose: SOIR },
      {
        action: 'create',
        id: 'report',
        ...OWNER,
        dose: fields({
          dueOn: '2026-09-29',
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-10-02',
        }),
      },
    ]
    const REDATEE = fields({ givenOn: '2026-09-28', nextDueDate: '2026-09-28' })
    const NOUVELLE = fields({
      dueOn: '2026-09-28',
      givenOn: '2026-09-28',
      nextDueDate: '2026-09-28',
    })
    const LOT: DoseWrite[] = [
      { action: 'create', id: 'nouvelle', ...OWNER, dose: NOUVELLE },
      { action: 'rewrite', id: 'matin', dose: REDATEE },
      { action: 'delete', id: 'report' },
    ]

    beforeEach(async () => {
      await doses.applyBatch(DEPART, T1)
    })

    it('applique créations, réécritures et suppressions en une fois', async () => {
      await doses.applyBatch(LOT, T2)

      await expect(visible()).resolves.toEqual([
        { id: 'matin', ...REDATEE },
        { id: 'nouvelle', ...NOUVELLE },
        { id: 'soir', ...SOIR },
      ])
      await expect(row('report')).resolves.toMatchObject({ deleted_at: T2 })
    })

    it('rend le lot inverse, qui défait tout et date chaque ligne de l’annulation', async () => {
      const before = await visible()

      const inverse = await doses.applyBatch(LOT, T2)
      await doses.applyBatch(inverse, T3)

      await expect(visible()).resolves.toEqual(before)
      expect(inverse).toEqual([
        { action: 'restore', id: 'report' },
        { action: 'rewrite', id: 'matin', dose: MATIN },
        { action: 'delete', id: 'nouvelle' },
      ])
      await expect(row('report')).resolves.toMatchObject({ updated_at: T3, deleted_at: null })
      await expect(row('matin')).resolves.toMatchObject({ updated_at: T3 })
      await expect(row('nouvelle')).resolves.toMatchObject({ updated_at: T3, deleted_at: T3 })
    })

    it('n’écrit rien quand une instruction échoue', async () => {
      const before = await visible()
      const casse: DoseWrite[] = [
        ...LOT,
        { action: 'create', id: 'orpheline', ...OWNER, dose: fields({ periodId: 'inconnue' }) },
      ]

      await expect(doses.applyBatch(casse, T2)).rejects.toThrow(/FOREIGN KEY/i)

      await expect(visible()).resolves.toEqual(before)
    })

    it.each<[string, DoseWrite]>([
      ['réécrire une ligne inconnue', { action: 'rewrite', id: 'inconnue', dose: REDATEE }],
      ['supprimer une ligne inconnue', { action: 'delete', id: 'inconnue' }],
      ['rétablir une ligne visible', { action: 'restore', id: 'soir' }],
    ])('refuse de %s, sans rien écrire', async (_, write) => {
      const before = await visible()

      await expect(doses.applyBatch([...LOT, write], T2)).rejects.toThrow('Prise')

      await expect(visible()).resolves.toEqual(before)
    })

    it('refuse de réécrire une ligne déjà supprimée', async () => {
      await doses.applyBatch([{ action: 'delete', id: 'soir' }], T2)

      await expect(
        doses.applyBatch([{ action: 'rewrite', id: 'soir', dose: REDATEE }], T2),
      ).rejects.toThrow('Prise')
    })

    it('refuse de créer une seconde prise pour une échéance déjà notée, sans rien écrire', async () => {
      const before = await visible()
      const doublon: DoseWrite[] = [
        { action: 'delete', id: 'soir' },
        {
          action: 'create',
          id: 'doublon',
          ...OWNER,
          dose: fields({ givenOn: null, status: 'missed' }),
        },
      ]

      await expect(doses.applyBatch(doublon, T2)).rejects.toBeInstanceOf(DuplicateDueError)

      await expect(visible()).resolves.toEqual(before)
    })

    it('refuse un second report pour une échéance déjà reportée', async () => {
      const second: DoseWrite = {
        action: 'create',
        id: 'second',
        ...OWNER,
        dose: fields({
          dueOn: '2026-09-29',
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-10-03',
        }),
      }

      await expect(doses.applyBatch([second], T2)).rejects.toBeInstanceOf(DuplicateDueError)
    })

    it('crée une prise pour une échéance qui n’a qu’un report, ou dont la prise est supprimée', async () => {
      const prise: DoseWrite = {
        action: 'create',
        id: 'prise',
        ...OWNER,
        dose: fields({ dueOn: '2026-09-29', givenOn: '2026-09-29', nextDueDate: '2026-09-30' }),
      }
      await doses.applyBatch([{ action: 'delete', id: 'matin' }], T2)

      await doses.applyBatch(
        [prise, { action: 'create', id: 'matin-bis', ...OWNER, dose: MATIN }],
        T3,
      )

      await expect(visible()).resolves.toHaveLength(4)
    })

    it('crée le décalage d’une échéance reportée, mais jamais un second décalage (Q5)', async () => {
      const shift = (id: string): DoseWrite => ({
        action: 'create',
        id,
        ...OWNER,
        dose: fields({
          dueOn: '2026-09-29',
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-10-03',
        }),
      })

      await doses.applyBatch([shift('decalage')], T2)

      await expect(doses.applyBatch([shift('second')], T3)).rejects.toBeInstanceOf(
        DuplicateDueError,
      )
      await expect(row('decalage')).resolves.toMatchObject({ deleted_at: null })
    })

    it('n’écrit rien pour un lot vide', async () => {
      await expect(doses.applyBatch([], T2)).resolves.toEqual([])
    })
  })
})
