import type { SupabaseClient } from '@supabase/supabase-js'

import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { currentDeviceId } from '@/core/device/device-identity'
import { guardedUpsert, type SyncRow } from '@/core/supabase/guarded-upsert'
import { loadSupabaseClient } from '@/core/supabase/load-client'
import { syncField, type SyncPullPage } from '@/core/sync/service/syncable-table'
import {
  createTreatmentDosesRepository,
  headDoseIdSql,
  lastGivenOnSql,
} from './treatment-doses.repository'
import {
  createTreatmentPeriodsRepository,
  currentPeriodIdSql,
} from './treatment-periods.repository'
import type { NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import {
  treatmentInputSchema,
  treatmentTypeSchema,
  type FrequencyUnit,
  type Treatment,
  type TreatmentType,
} from '../schema/treatment.schema'
import type { Stamped } from '@/shared/domain/carnet-data'
import type { DoseFields } from '@/shared/domain/treatment-schedule'

interface TreatmentRow {
  id: string
  animal_id: string
  name: string
  type: TreatmentType
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

interface TreatmentWithHeadRow extends Omit<
  TreatmentRow,
  'created_by_device' | 'updated_by_device'
> {
  period_id: string
  frequency_value: number
  frequency_unit: FrequencyUnit
  stopped_on: string | null
  last_dose_date: string | null
  next_due_date: string
}

export type TreatmentVersion = Pick<Treatment, 'id' | 'animalId' | 'updatedAt' | 'deletedAt'>
/** Le traitement tel que sa table l'enregistre, sans sa période ni la tête de son historique. */
export type TreatmentRecord = Pick<
  Treatment,
  'id' | 'animalId' | 'name' | 'type' | 'createdAt' | 'updatedAt'
>
export type StampedTreatmentRecord = Stamped<TreatmentRecord>
export type RestoredTreatment = StampedTreatmentRecord
/** Ce que le moteur d'échéances lit : toutes les périodes, de la première à la dernière, et les prises visibles. */
export type TreatmentWithHistory = TreatmentRecord & {
  periods: TreatmentPeriodRecord[]
  doses: NewTreatmentDose[]
}

/** Un traitement à créer avec sa première période, et les prises renseignées à la création (TR-3). */
export type NewTreatmentPlan = Pick<Treatment, 'id' | 'animalId' | 'name' | 'type'> & {
  settings: TreatmentPeriodSettings
  doses?: { id: string; dose: DoseFields }[]
}

export type PlannedDoseWrite =
  | { action: 'create'; id: string; dose: DoseFields }
  | { action: 'rewrite'; id: string; dose: DoseFields }
  | { action: 'delete'; id: string }

/**
 * Ce que « Modifier » ou « Reprendre » écrit en une fois ; `null` : rien à écrire dans cette table.
 * `referenceOn` absent : le jour de référence suit la première échéance.
 */
export type TreatmentPlanWrite = {
  treatment: Pick<Treatment, 'name' | 'type'> | null
  period:
    | { action: 'correct'; settings: TreatmentPeriodSettings; referenceOn?: string }
    | { action: 'open'; id: string; settings: TreatmentPeriodSettings; referenceOn?: string }
    | null
  doses: PlannedDoseWrite[]
}

const COLUMNS =
  'id, animal_id, name, type, created_at, updated_at, deleted_at, created_by_device, updated_by_device'

/** Les traitements supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

const NEXT_DUE_DATE = 'COALESCE(head.next_due_date, period.first_due_on)'

/**
 * La tête est la dernière ligne de la période en cours ; le traitement est daté de la modification
 * la plus récente entre lui et cette période.
 */
const VISIBLE_WITH_HEAD = `
  SELECT treatment.id, treatment.animal_id, treatment.name, treatment.type,
         period.id AS period_id, period.frequency_value, period.frequency_unit, period.stopped_on,
         ${lastGivenOnSql('period.id')} AS last_dose_date,
         ${NEXT_DUE_DATE} AS next_due_date,
         treatment.created_at, MAX(treatment.updated_at, period.updated_at) AS updated_at,
         treatment.deleted_at
  FROM treatment
  JOIN treatment_period period ON period.id = ${currentPeriodIdSql('treatment.id')}
  LEFT JOIN treatment_dose head ON head.id = ${headDoseIdSql('period.id')}
  WHERE treatment.deleted_at IS NULL`

function toRecord(row: TreatmentRow): TreatmentRecord {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toStampedRecord(row: TreatmentRow): StampedTreatmentRecord {
  return {
    ...toRecord(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(keyOf(row))
    if (group) group.push(row)
    else groups.set(keyOf(row), [row])
  }
  return groups
}

/** Sans période visible, un traitement ne se lit pas ; les prises d'une période supprimée non plus. */
function withHistory(
  rows: TreatmentRow[],
  periods: TreatmentPeriodRecord[],
  doses: TreatmentDose[],
): TreatmentWithHistory[] {
  const periodsOf = groupBy(periods, ({ treatmentId }) => treatmentId)
  const dosesOf = groupBy(doses, ({ periodId }) => periodId)
  return rows.flatMap((row) => {
    const own = periodsOf.get(row.id)
    if (!own) return []
    return [
      {
        ...toRecord(row),
        periods: own,
        doses: own.flatMap(({ id }) =>
          (dosesOf.get(id) ?? []).map(({ frequency: _frequency, ...dose }) => dose),
        ),
      },
    ]
  })
}

function toTreatment(row: TreatmentWithHeadRow): Treatment {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    periodId: row.period_id,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    lastDoseDate: row.last_dose_date,
    nextDueDate: row.next_due_date,
    stoppedOn: row.stopped_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface TreatmentsRepositoryDependencies {
  loadSupabaseClient?: () => Promise<SupabaseClient>
  deviceId?: () => string
}

export function createTreatmentsRepository(
  db: DbClient,
  {
    loadSupabaseClient: loadClient = loadSupabaseClient,
    deviceId = currentDeviceId,
  }: TreatmentsRepositoryDependencies = {},
) {
  const periods = createTreatmentPeriodsRepository(db, { deviceId })
  const doses = createTreatmentDosesRepository(db, { deviceId })

  async function getById(id: string): Promise<Treatment | null> {
    const rows = await db.query<TreatmentWithHeadRow>(`${VISIBLE_WITH_HEAD} AND treatment.id = ?`, [
      id,
    ])
    const row = rows[0]
    return row ? toTreatment(row) : null
  }

  async function requireVisible(id: string): Promise<Treatment> {
    const treatment = await getById(id)
    if (!treatment) {
      throw new Error(`Traitement introuvable : ${id}`)
    }
    return treatment
  }

  function identityOf({ name, type }: Pick<Treatment, 'name' | 'type'>) {
    return {
      name: treatmentInputSchema.shape.name.parse(name),
      type: treatmentTypeSchema.parse(type),
    }
  }

  function doseStatement(
    write: PlannedDoseWrite,
    { id: treatmentId, animalId }: Treatment,
    at: string,
  ): SqlStatement {
    switch (write.action) {
      case 'create':
        return doses.createStatement({ id: write.id, treatmentId, animalId, dose: write.dose, at })
      case 'rewrite':
        return doses.rewriteStatement(write.id, write.dose, at)
      case 'delete':
        return doses.markDeletedStatement([write.id], at)
    }
  }

  return {
    entity: 'treatment',

    getById,

    /** Le plus urgent d'abord : l'ordre de la section « Traitements en cours » et de l'accueil. */
    async listByAnimal(animalId: string): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithHeadRow>(
        `${VISIBLE_WITH_HEAD} AND treatment.animal_id = ?
         ORDER BY ${NEXT_DUE_DATE}, treatment.created_at`,
        [animalId],
      )
      return rows.map(toTreatment)
    },

    async listAll(): Promise<Treatment[]> {
      const rows = await db.query<TreatmentWithHeadRow>(
        `${VISIBLE_WITH_HEAD}
         ORDER BY treatment.animal_id, ${NEXT_DUE_DATE}, treatment.created_at`,
      )
      return rows.map(toTreatment)
    },

    /** Traitements visibles, qu'ils aient ou non une prise. */
    async listRecords(): Promise<StampedTreatmentRecord[]> {
      const rows = await db.query<TreatmentRow>(
        `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED}
         ORDER BY animal_id, created_at, id`,
      )
      return rows.map(toStampedRecord)
    },

    async getWithHistory(id: string): Promise<TreatmentWithHistory | null> {
      const [rows, ownPeriods, ownDoses] = await Promise.all([
        db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED} AND id = ?`, [
          id,
        ]),
        periods.listByTreatment(id),
        doses.listByTreatment(id),
      ])
      return withHistory(rows, ownPeriods, ownDoses)[0] ?? null
    },

    /** Dans l'ordre de saisie des traitements. */
    async listWithHistoryByAnimal(animalId: string): Promise<TreatmentWithHistory[]> {
      const [rows, ownPeriods, ownDoses] = await Promise.all([
        db.query<TreatmentRow>(
          `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED} AND animal_id = ?
           ORDER BY created_at, id`,
          [animalId],
        ),
        periods.listByAnimal(animalId),
        doses.listByAnimal(animalId),
      ])
      return withHistory(rows, ownPeriods, ownDoses)
    },

    /** Par animal, puis dans l'ordre de saisie des traitements. */
    async listAllWithHistory(): Promise<TreatmentWithHistory[]> {
      const [rows, allPeriods, allDoses] = await Promise.all([
        db.query<TreatmentRow>(
          `SELECT ${COLUMNS} FROM treatment WHERE ${NOT_DELETED}
           ORDER BY animal_id, created_at, id`,
        ),
        periods.listAll(),
        doses.listAll(),
      ])
      return withHistory(rows, allPeriods, allDoses)
    },

    /** Le traitement, sa première période, de même identifiant, et les prises du plan : tout ou rien. */
    async create(plan: NewTreatmentPlan): Promise<Treatment> {
      const { name, type } = identityOf(plan)
      const now = new Date().toISOString()

      await db.runMany([
        {
          sql: `INSERT INTO treatment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          params: [plan.id, plan.animalId, name, type, now, now, deviceId(), deviceId()],
        },
        periods.insertStatement({
          ...plan.settings,
          id: plan.id,
          treatmentId: plan.id,
          animalId: plan.animalId,
          stoppedOn: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
        ...(plan.doses ?? []).map(({ id, dose }) =>
          doses.createStatement({
            id,
            treatmentId: plan.id,
            animalId: plan.animalId,
            dose,
            at: now,
          }),
        ),
      ])

      return requireVisible(plan.id)
    },

    /**
     * Nom et type, réglages de la période en cours ou nouvelle période, lignes de déplacement :
     * tout ou rien. Une ligne que rien ne change n'est pas datée ; `animal_id` reste figé.
     */
    async applyPlan(id: string, plan: TreatmentPlanWrite): Promise<Treatment> {
      const current = await requireVisible(id)
      const at = new Date().toISOString()
      const statements: SqlStatement[] = []

      if (plan.treatment !== null) {
        const { name, type } = identityOf(plan.treatment)
        statements.push({
          sql: `UPDATE treatment SET name = ?, type = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED} AND (name <> ? OR type <> ?)`,
          params: [name, type, at, deviceId(), id, name, type],
        })
      }
      if (plan.period?.action === 'correct') {
        const { settings, referenceOn } = plan.period
        statements.push(periods.correctCurrentSettingsStatement(id, settings, at, referenceOn))
      }
      if (plan.period?.action === 'open') {
        statements.push(
          periods.insertStatement({
            ...plan.period.settings,
            referenceOn: plan.period.referenceOn,
            id: plan.period.id,
            treatmentId: id,
            animalId: current.animalId,
            stoppedOn: null,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          }),
        )
      }
      statements.push(...plan.doses.map((write) => doseStatement(write, current, at)))

      if (statements.length > 0) await db.runMany(statements)
      return requireVisible(id)
    },

    listDoses(treatmentId: string): Promise<TreatmentDose[]> {
      return doses.listByTreatment(treatmentId)
    },

    /**
     * Rend l'instant de la suppression, à passer à `restore`. Sans effet sur un traitement inconnu
     * ou déjà supprimé : la date initiale est gardée.
     */
    async remove(id: string): Promise<string> {
      const deletedAt = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        periods.markDeletedByTreatmentStatement(id, deletedAt),
        doses.markDeletedByTreatmentStatement(id, deletedAt),
      ])
      return deletedAt
    },

    /** Rétablit le traitement, ses périodes et ses prises supprimés à cet instant, et eux seuls. */
    async restore(id: string, deletedAt: string): Promise<void> {
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE treatment SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        periods.reviveByTreatmentStatement(id, deletedAt, at),
        doses.reviveByTreatmentStatement(id, deletedAt, at),
      ])
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId(), animalId],
      }
    },

    /** Lignes supprimées comprises : l'import compare les versions avant d'écrire. */
    async listVersions(): Promise<TreatmentVersion[]> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment`)
      return rows.map(({ id, animal_id, updated_at, deleted_at }) => ({
        id,
        animalId: animal_id,
        updatedAt: updated_at,
        deletedAt: deleted_at,
      }))
    },

    markAllDeletedStatement(deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ?, updated_by_device = ?
              WHERE ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, deviceId()],
      }
    },

    /** Rend la ligne visible sans la changer d'animal. */
    restoreStatement(treatment: RestoredTreatment, exists: boolean): SqlStatement {
      const values = [
        treatment.name,
        treatment.type,
        treatment.createdAt,
        treatment.updatedAt,
        treatment.createdByDevice,
        treatment.updatedByDevice,
      ]
      return exists
        ? {
            sql: `UPDATE treatment
                  SET name = ?, type = ?, created_at = ?, updated_at = ?, created_by_device = ?,
                      updated_by_device = ?, deleted_at = NULL
                  WHERE id = ?`,
            params: [...values, treatment.id],
          }
        : {
            sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
                    created_by_device, updated_by_device)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [treatment.id, treatment.animalId, ...values],
          }
    },

    /** Tombstones compris : le push doit pouvoir renvoyer une suppression comme une ligne normale. */
    async getRowForPush(id: string): Promise<SyncRow | null> {
      const rows = await db.query<TreatmentRow>(`SELECT ${COLUMNS} FROM treatment WHERE id = ?`, [
        id,
      ])
      return (rows[0] as SyncRow | undefined) ?? null
    },

    async pushRow(userId: string, row: SyncRow): Promise<void> {
      const supabase = await loadClient()
      await guardedUpsert(supabase, 'treatment', ['user_id', 'id'], { ...row, user_id: userId })
    },

    async pullPage(userId: string, since: string, limit: number): Promise<SyncPullPage> {
      const supabase = await loadClient()
      const { data, error } = await supabase
        .from('treatment')
        .select(`${COLUMNS}, server_updated_at`)
        .eq('user_id', userId)
        .gte('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw error

      const rows = (data ?? []) as Array<TreatmentRow & { server_updated_at: string }>
      const cursor = rows.length > 0 ? (rows.at(-1)?.server_updated_at ?? null) : null
      return {
        rows: rows.map(({ server_updated_at: _serverUpdatedAt, ...columns }) => columns as SyncRow),
        cursor,
      }
    },

    applyRemoteRowStatement(row: SyncRow): SqlStatement {
      return {
        sql: `INSERT INTO treatment (${COLUMNS})
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                animal_id = excluded.animal_id, name = excluded.name, type = excluded.type,
                created_at = excluded.created_at, updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at, created_by_device = excluded.created_by_device,
                updated_by_device = excluded.updated_by_device
              WHERE excluded.updated_at > treatment.updated_at`,
        params: [
          row.id,
          syncField(row, 'animal_id'),
          syncField(row, 'name'),
          syncField(row, 'type'),
          syncField(row, 'created_at'),
          row.updated_at,
          syncField(row, 'deleted_at'),
          syncField(row, 'created_by_device'),
          syncField(row, 'updated_by_device'),
        ],
      }
    },
  }
}

export type TreatmentsRepository = ReturnType<typeof createTreatmentsRepository>

let repository: Promise<TreatmentsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentsRepository(): Promise<TreatmentsRepository> {
  repository ??= getDb()
    .then(createTreatmentsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
