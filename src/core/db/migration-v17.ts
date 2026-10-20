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
  'first_due_chosen',
  'fallen_doses_answer',
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
  'settings_written_at',
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
  'previous_target_on',
  'previous_target_time',
  'due_rank',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]

export const migrationV17: DbMigration = {
  toVersion: 17,
  statements: [
    'CREATE TABLE treatment_period_v16 AS SELECT * FROM treatment_period',
    'CREATE TABLE treatment_dose_v16 AS SELECT * FROM treatment_dose',
    'DROP TABLE treatment_dose',
    'DROP TABLE treatment_period',

    `CREATE TABLE IF NOT EXISTS treatment_period (
        id TEXT PRIMARY KEY NOT NULL,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        starts_on TEXT NOT NULL,
        first_due_on TEXT NOT NULL,
        grid_origin_on TEXT,
        first_due_chosen INTEGER NOT NULL DEFAULT 0 CHECK (first_due_chosen IN (0, 1)),
        fallen_doses_answer TEXT NOT NULL DEFAULT 'unasked'
          CHECK (fallen_doses_answer IN ('unasked', 'stay-unlogged', 'not-due')),
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
        settings_written_at TEXT NOT NULL,
        grid_written_at TEXT NOT NULL,
        grid_before TEXT,
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
        status TEXT NOT NULL
          CHECK (status IN ('given', 'missed', 'postponed', 'extra', 'shift', 'not-due')),
        target_on TEXT,
        previous_target_on TEXT,
        previous_target_time TEXT,
        due_rank INTEGER CHECK (due_rank IS NULL OR due_rank >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        created_by_device TEXT NOT NULL,
        updated_by_device TEXT NOT NULL
      );`,

    // La dernière écriture de la grille seule est inconnue : celle des réglages, qui la contient.
    `INSERT INTO treatment_period (${PERIOD_COLUMNS.join(', ')}, grid_written_at)
     SELECT ${PERIOD_COLUMNS.join(', ')}, settings_written_at FROM treatment_period_v16`,
    `INSERT INTO treatment_dose (${DOSE_COLUMNS.join(', ')})
     SELECT ${DOSE_COLUMNS.join(', ')} FROM treatment_dose_v16`,
    'DROP TABLE treatment_dose_v16',
    'DROP TABLE treatment_period_v16',

    `CREATE INDEX IF NOT EXISTS idx_treatment_period_treatment
         ON treatment_period (treatment_id, starts_on);`,
    'CREATE INDEX IF NOT EXISTS idx_treatment_period_animal_id ON treatment_period (animal_id);',
    `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, due_on, due_time);`,
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_period_id ON treatment_dose (period_id);',
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',

    ...['treatment_period', 'treatment_dose'].flatMap(outboxTriggerStatements),
    ...allowedValuesTriggerStatements('treatment_period', 'dose_unit', DOSE_UNITS),
    'PRAGMA user_version = 17',
  ],
}
