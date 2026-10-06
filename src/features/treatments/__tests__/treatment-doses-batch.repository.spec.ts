// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { DbClient, SqlStatement } from '@/core/db/db-client'
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
const GUARD_REFUSED = /UNIQUE constraint failed: treatment_dose\.id/

/** Une autre écriture passe entre la lecture du lot et sa transaction. */
function slippedIn(db: DbClient, other: () => SqlStatement[]): DbClient {
  let slipped = false
  return {
    ...db,
    async runMany(statements) {
      if (!slipped) {
        slipped = true
        await db.runMany(other())
      }
      await db.runMany(statements)
    },
  }
}

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
        { action: 'restore', id: 'report', expectedUpdatedAt: T2 },
        { action: 'rewrite', id: 'matin', dose: MATIN, expectedUpdatedAt: T2 },
        { action: 'delete', id: 'nouvelle', expectedUpdatedAt: T2 },
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

    describe('écritures concurrentes', () => {
      const T4 = '2026-09-28T09:06:00.000Z'

      it('D1 : échoue en entier quand une ligne à réécrire est supprimée après la lecture', async () => {
        const before = await visible()
        const concurrent = createTreatmentDosesRepository(
          slippedIn(db, () => [doses.markDeletedStatement(['soir'], T2)]),
        )

        await expect(
          concurrent.applyBatch(
            [
              { action: 'rewrite', id: 'matin', dose: REDATEE },
              { action: 'rewrite', id: 'soir', dose: { ...SOIR, givenOn: '2026-09-28' } },
            ],
            T3,
          ),
        ).rejects.toThrow(GUARD_REFUSED)

        await expect(visible()).resolves.toEqual(before.filter(({ id }) => id !== 'soir'))
      })

      it('D1 : échoue en entier quand une ligne à supprimer est supprimée après la lecture', async () => {
        const concurrent = createTreatmentDosesRepository(
          slippedIn(db, () => [doses.markDeletedStatement(['soir'], T2)]),
        )

        await expect(
          concurrent.applyBatch(
            [
              { action: 'delete', id: 'matin' },
              { action: 'delete', id: 'soir' },
            ],
            T3,
          ),
        ).rejects.toThrow(GUARD_REFUSED)

        await expect(row('matin')).resolves.toMatchObject({ deleted_at: null })
        await expect(row('soir')).resolves.toMatchObject({ deleted_at: T2 })
      })

      it('D9 : un « Annuler » ancien ne réécrit pas une ligne modifiée depuis', async () => {
        const undo = await doses.applyBatch([{ action: 'rewrite', id: 'matin', dose: REDATEE }], T2)
        const encore = fields({ givenOn: '2026-09-29', nextDueDate: '2026-09-29' })
        await doses.applyBatch([{ action: 'rewrite', id: 'matin', dose: encore }], T3)

        await expect(doses.applyBatch(undo, T4)).rejects.toThrow('Prise')

        await expect(visible()).resolves.toContainEqual({ id: 'matin', ...encore })
        await expect(row('matin')).resolves.toMatchObject({ updated_at: T3 })
      })

      it('D9 : un « Annuler » ne supprime pas une prise créée puis modifiée depuis', async () => {
        const undo = await doses.applyBatch(LOT, T2)
        await doses.applyBatch(
          [{ action: 'rewrite', id: 'nouvelle', dose: { ...NOUVELLE, givenOn: '2026-09-27' } }],
          T3,
        )

        await expect(doses.applyBatch(undo, T4)).rejects.toThrow('Prise')

        await expect(row('nouvelle')).resolves.toMatchObject({ deleted_at: null, updated_at: T3 })
        await expect(row('report')).resolves.toMatchObject({ deleted_at: T2 })
      })

      it('D9 : un « Annuler » ne rétablit pas une ligne rétablie puis supprimée de nouveau', async () => {
        const undo = await doses.applyBatch([{ action: 'delete', id: 'soir' }], T2)
        await doses.applyBatch([{ action: 'restore', id: 'soir' }], T3)
        await doses.applyBatch([{ action: 'delete', id: 'soir' }], T3)

        await expect(doses.applyBatch(undo, T4)).rejects.toThrow('Prise')

        await expect(row('soir')).resolves.toMatchObject({ deleted_at: T3 })
      })

      it('D9 : un « Annuler » échoue en entier quand la ligne est modifiée après la lecture', async () => {
        const undo = await doses.applyBatch(LOT, T2)
        const concurrent = createTreatmentDosesRepository(
          slippedIn(db, () => [doses.rewriteStatement('matin', MATIN, T3)]),
        )

        await expect(concurrent.applyBatch(undo, T4)).rejects.toThrow(GUARD_REFUSED)

        await expect(row('nouvelle')).resolves.toMatchObject({ deleted_at: null })
        await expect(row('report')).resolves.toMatchObject({ deleted_at: T2 })
      })

      it.each([
        [
          'le traitement est supprimé',
          `UPDATE treatment SET deleted_at = '${T2}' WHERE id = '${METACAM}'`,
        ],
        [
          'la période est supprimée',
          `UPDATE treatment_period SET deleted_at = '${T2}' WHERE id = '${PERIODE}'`,
        ],
      ])('D11 : ne crée aucune prise quand %s après la lecture', async (_, sql) => {
        const before = await visible()
        const concurrent = createTreatmentDosesRepository(slippedIn(db, () => [{ sql }]))

        await expect(concurrent.applyBatch(LOT, T3)).rejects.toThrow(GUARD_REFUSED)

        const [{ live }] = (await db.query<{ live: number }>(
          'SELECT COUNT(*) AS live FROM treatment_dose WHERE deleted_at IS NULL',
        )) as [{ live: number }]
        expect(live).toBe(before.length)
        await expect(row('nouvelle')).resolves.toBeUndefined()
      })

      it('D11 : un « Annuler » ne rétablit pas une prise sous un traitement supprimé depuis', async () => {
        const undo = await doses.applyBatch([{ action: 'delete', id: 'soir' }], T2)
        await db.run(`UPDATE treatment SET deleted_at = ? WHERE id = ?`, [T3, METACAM])

        await expect(doses.applyBatch(undo, T4)).rejects.toThrow(GUARD_REFUSED)

        await expect(row('soir')).resolves.toMatchObject({ deleted_at: T2 })
      })

      it('D12 : deux créations de la même échéance dans un lot lèvent DuplicateDueError', async () => {
        const before = await visible()
        const echeance = fields({ dueOn: '2026-09-30', nextDueDate: '2026-09-30' })

        await expect(
          doses.applyBatch(
            [
              { action: 'create', id: 'une', ...OWNER, dose: echeance },
              { action: 'create', id: 'deux', ...OWNER, dose: { ...echeance, status: 'missed' } },
            ],
            T2,
          ),
        ).rejects.toBeInstanceOf(DuplicateDueError)

        await expect(visible()).resolves.toEqual(before)
      })
    })
  })
})
