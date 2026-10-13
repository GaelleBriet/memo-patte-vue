import {
  allowedValuesTriggerStatements,
  DOSE_UNITS,
  outboxTriggerStatements,
  type DbMigration,
} from './schema-statements'

const PERIOD_COLUMNS = [
  'id',
  'treatment_id',
  'animal_id',
  'starts_on',
  'first_due_on',
  'grid_origin_on',
  'ends_on',
  'stopped_on',
  'frequency_value',
  'frequency_unit',
  'times',
  'dose_quantity',
  'dose_unit',
  'reminder_offset_minutes',
  'reminder_time',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]

const DOSE_COLUMNS = [
  'id',
  'period_id',
  'treatment_id',
  'animal_id',
  'due_on',
  'due_time',
  'given_on',
  'status',
  'target_on',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]

const int = (sql: string) => `CAST(${sql} AS INTEGER)`
const monthIndex = (day: string) =>
  `(${int(`substr(${day}, 1, 4)`)} * 12 + ${int(`substr(${day}, 6, 2)`)})`

// R2, comme `isOnGrid` du moteur : en mois, un jour qui n'existe pas devient le dernier du mois.
function onGrid(origin: string, day: string, value: string, unit: string): string {
  const days = int(`julianday(${day}) - julianday(${origin})`)
  const lastDay = int(`strftime('%d', ${day}, 'start of month', '+1 month', '-1 day')`)
  return `CASE ${unit}
    WHEN 'day' THEN ${days} % ${value} = 0
    WHEN 'week' THEN ${days} % (7 * ${value}) = 0
    ELSE (${monthIndex(day)} - ${monthIndex(origin)}) % ${value} = 0
      AND ${int(`substr(${day}, 9, 2)`)} = min(${int(`substr(${origin}, 9, 2)`)}, ${lastDay})
  END`
}

// Un réglage remplacé avant son premier jour cède sa place au réglage écrit après lui (R1, R9).
const START_KEY = `min(p.starts_on, coalesce((
    SELECT min(newer.starts_on) FROM treatment_period_v11 newer
    WHERE newer.treatment_id = p.treatment_id AND newer.deleted_at IS p.deleted_at
      AND newer.created_at > p.created_at), p.starts_on))`

// Les réglages visibles se rangent entre eux ; ceux d'un traitement supprimé, avec ceux supprimés au même instant.
const PERIODS_WITH_PREVIOUS = `
  SELECT keyed.*, lag(keyed.id) OVER (
    PARTITION BY keyed.treatment_id, keyed.deleted_at
    ORDER BY keyed.start_key, keyed.created_at, keyed.id) AS previous_id
  FROM (SELECT p.*, ${START_KEY} AS start_key FROM treatment_period_v11 p) keyed`

const GRID_ORIGIN = `CASE
    WHEN previous.id IS NOT NULL AND previous.stopped_on IS NULL
      AND previous.frequency_value = p.frequency_value
      AND previous.frequency_unit = p.frequency_unit
      AND previous.reference_on = p.reference_on THEN NULL
    WHEN ${onGrid('p.reference_on', 'p.first_due_on', 'p.frequency_value', 'p.frequency_unit')}
      THEN p.reference_on
    ELSE p.first_due_on
  END`

export const migrationV12: DbMigration = {
  toVersion: 12,
  statements: [
    'CREATE TABLE treatment_period_v11 AS SELECT * FROM treatment_period',
    'CREATE TABLE treatment_dose_v11 AS SELECT * FROM treatment_dose',
    'DROP TABLE treatment_dose',
    'DROP TABLE treatment_period',

    `CREATE TABLE IF NOT EXISTS treatment_period (
        id TEXT PRIMARY KEY NOT NULL,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        starts_on TEXT NOT NULL,
        first_due_on TEXT NOT NULL,
        grid_origin_on TEXT,
        ends_on TEXT,
        stopped_on TEXT,
        frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
        frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
        times TEXT,
        dose_quantity REAL,
        dose_unit TEXT,
        reminder_offset_minutes INTEGER CHECK (reminder_offset_minutes IN (0, 15, 30, 60)),
        reminder_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        created_by_device TEXT NOT NULL,
        updated_by_device TEXT NOT NULL
      );`,
    `CREATE TABLE IF NOT EXISTS treatment_dose (
        id TEXT PRIMARY KEY NOT NULL,
        period_id TEXT NOT NULL REFERENCES treatment_period(id) ON DELETE CASCADE,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        due_on TEXT NOT NULL,
        due_time TEXT,
        given_on TEXT,
        status TEXT NOT NULL CHECK (status IN ('given', 'missed', 'postponed', 'extra', 'shift')),
        target_on TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        created_by_device TEXT NOT NULL,
        updated_by_device TEXT NOT NULL
      );`,

    `INSERT INTO treatment_period (${PERIOD_COLUMNS.join(', ')})
     SELECT ${PERIOD_COLUMNS.map((column) =>
       column === 'grid_origin_on' ? GRID_ORIGIN : `p.${column}`,
     ).join(', ')}
     FROM (${PERIODS_WITH_PREVIOUS}) p
     LEFT JOIN treatment_period_v11 previous ON previous.id = p.previous_id`,
    `INSERT INTO treatment_dose (${DOSE_COLUMNS.join(', ')})
     SELECT ${DOSE_COLUMNS.map((column) =>
       column === 'target_on'
         ? `CASE WHEN status IN ('postponed', 'shift') THEN next_due_date END`
         : column,
     ).join(', ')}
     FROM treatment_dose_v11`,
    'DROP TABLE treatment_dose_v11',
    'DROP TABLE treatment_period_v11',

    `CREATE INDEX IF NOT EXISTS idx_treatment_period_treatment
         ON treatment_period (treatment_id, starts_on);`,
    'CREATE INDEX IF NOT EXISTS idx_treatment_period_animal_id ON treatment_period (animal_id);',
    `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, due_on, due_time);`,
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_period_id ON treatment_dose (period_id);',
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',

    ...['treatment_period', 'treatment_dose'].flatMap(outboxTriggerStatements),
    ...allowedValuesTriggerStatements('treatment_period', 'dose_unit', DOSE_UNITS),
    'PRAGMA user_version = 12',
  ],
}
