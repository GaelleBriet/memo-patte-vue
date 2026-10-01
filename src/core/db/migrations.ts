/** Une version déjà publiée ne se modifie plus : toute évolution ajoute un `toVersion`. */
export interface DbMigration {
  toVersion: number
  statements: string[]
}

const VERSION_8_TABLES = [
  'treatment_dose',
  'treatment',
  'vaccination_injection',
  'vaccination',
  'weight_entry',
  'animal',
  'sync_outbox',
  'sync_state',
  'sync_pull_cursor',
]

const VERSION_9_TREATMENT_TABLES = ['treatment_dose', 'treatment']

const TREATMENT_TYPES = ['deworming', 'antiparasitic', 'medication']

const DOSE_UNITS = [
  'tablet',
  'capsule',
  'pipette',
  'collar',
  'ml',
  'drop',
  'g',
  'sachet',
  'spray',
  'application',
  'dose',
]

const SYNCED_TABLES = [
  'animal',
  'weight_entry',
  'carnet_settings',
  'vaccination',
  'vaccination_injection',
  'treatment',
  'treatment_dose',
]

export const migrations: DbMigration[] = [
  {
    // Repart d'une base vide : avant la publication, une base existante ne contient que des données de test.
    toVersion: 9,
    statements: [
      ...VERSION_8_TABLES.map((table) => `DROP TABLE IF EXISTS ${table}`),

      `CREATE TABLE IF NOT EXISTS animal (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
        breed TEXT,
        birth_date TEXT,
        birth_date_approximate INTEGER NOT NULL DEFAULT 0 CHECK (birth_date_approximate IN (0, 1)),
        photo_path TEXT,
        unfollowed_on TEXT,
        departure_reason TEXT CHECK (departure_reason IN ('death', 'rehomed', 'other')),
        departure_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS weight_entry (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        weight_kg REAL NOT NULL,
        measured_on TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS carnet_settings (
        id TEXT PRIMARY KEY NOT NULL CHECK (id = '00000000-0000-0000-0000-000000000000'),
        vaccine_reminder_time TEXT NOT NULL DEFAULT '09:00'
          CHECK (vaccine_reminder_time GLOB '[01][0-9]:[0-5][0-9]'
            OR vaccine_reminder_time GLOB '2[0-3]:[0-5][0-9]'),
        remind_before_due INTEGER NOT NULL DEFAULT 1 CHECK (remind_before_due IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS vaccination (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        planned_due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS vaccination_injection (
        id TEXT PRIMARY KEY NOT NULL,
        vaccination_id TEXT NOT NULL REFERENCES vaccination(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        injected_on TEXT NOT NULL,
        next_due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS treatment (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('deworming', 'antiparasitic')),
        frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
        frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
        stopped_on TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS treatment_dose (
        id TEXT PRIMARY KEY NOT NULL,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        given_on TEXT NOT NULL,
        next_due_date TEXT NOT NULL,
        frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
        frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (entity, entity_id)
      );`,
      `CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        restoring INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT
      );`,
      'INSERT INTO sync_state (id, enabled, restoring, last_synced_at) VALUES (1, 0, 0, NULL);',
      `CREATE TABLE IF NOT EXISTS sync_pull_cursor (
        entity TEXT PRIMARY KEY NOT NULL,
        last_pulled_at TEXT NOT NULL
      );`,

      'CREATE INDEX IF NOT EXISTS idx_weight_entry_animal_id ON weight_entry (animal_id);',
      'CREATE INDEX IF NOT EXISTS idx_vaccination_animal_id ON vaccination (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_vaccination_injection_vaccination
         ON vaccination_injection (vaccination_id, injected_on);`,
      `CREATE INDEX IF NOT EXISTS idx_vaccination_injection_animal_id
         ON vaccination_injection (animal_id);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_animal_id ON treatment (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, given_on);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',

      ...SYNCED_TABLES.flatMap(outboxTriggerStatements),
      ...nameLengthTriggerStatements('animal', ['name', 'breed']),
      ...nameLengthTriggerStatements('vaccination', ['name']),
      ...nameLengthTriggerStatements('treatment', ['name']),
      // Le plugin pose la version après le commit : posée ici, elle suit la transaction du schéma.
      'PRAGMA user_version = 9',
    ],
  },
  {
    // Les traitements v9 ne sont que des données de test : rien n'est repris.
    toVersion: 10,
    statements: [
      ...VERSION_9_TREATMENT_TABLES.map((table) => `DROP TABLE IF EXISTS ${table}`),
      `DELETE FROM sync_outbox WHERE entity IN ('treatment', 'treatment_dose')`,
      `DELETE FROM sync_pull_cursor WHERE entity IN ('treatment', 'treatment_dose')`,

      `CREATE TABLE IF NOT EXISTS treatment (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS treatment_period (
        id TEXT PRIMARY KEY NOT NULL,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        starts_on TEXT NOT NULL,
        first_due_on TEXT NOT NULL,
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
        deleted_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS treatment_dose (
        id TEXT PRIMARY KEY NOT NULL,
        period_id TEXT NOT NULL REFERENCES treatment_period(id) ON DELETE CASCADE,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        due_on TEXT NOT NULL,
        due_time TEXT,
        given_on TEXT,
        status TEXT NOT NULL CHECK (status IN ('given', 'missed', 'postponed')),
        next_due_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,

      'CREATE INDEX IF NOT EXISTS idx_treatment_animal_id ON treatment (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_treatment_period_treatment
         ON treatment_period (treatment_id, starts_on);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_period_animal_id ON treatment_period (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, due_on, due_time);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_dose_period_id ON treatment_dose (period_id);',
      'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',

      ...['treatment', 'treatment_period', 'treatment_dose'].flatMap(outboxTriggerStatements),
      ...nameLengthTriggerStatements('treatment', ['name']),
      ...allowedValuesTriggerStatements('treatment', 'type', TREATMENT_TYPES),
      ...allowedValuesTriggerStatements('treatment_period', 'dose_unit', DOSE_UNITS),
      'PRAGMA user_version = 10',
    ],
  },
]

/**
 * `DO UPDATE`, jamais `DO NOTHING` : une ligne déjà en file qui change une deuxième fois doit
 * avancer `queued_at`, sinon la garde de fin d'entrée ne verrait pas la nouvelle modification.
 */
function outboxTriggerStatements(table: string): string[] {
  const upsert = `
      INSERT INTO sync_outbox (entity, entity_id, queued_at)
      VALUES ('${table}', NEW.id, NEW.updated_at)
      ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;`

  return [
    `CREATE TRIGGER ${table}_outbox_insert AFTER INSERT ON ${table}
     WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
     BEGIN${upsert}
     END;`,
    `CREATE TRIGGER ${table}_outbox_update AFTER UPDATE ON ${table}
     WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
     BEGIN${upsert}
     END;`,
  ]
}

function nameLengthTriggerStatements(table: string, columns: string[]): string[] {
  const tooLong = columns.map((column) => `length(NEW.${column}) > 80`).join(' OR ')
  const abort = `BEGIN SELECT RAISE(ABORT, '${table}: text longer than 80 characters'); END;`

  return [
    `CREATE TRIGGER ${table}_name_length_insert BEFORE INSERT ON ${table}
     WHEN ${tooLong}
     ${abort}`,
    `CREATE TRIGGER ${table}_name_length_update BEFORE UPDATE OF ${columns.join(', ')} ON ${table}
     WHEN ${tooLong}
     ${abort}`,
  ]
}

/** Une liste appelée à grandir : une valeur s'ajoute en recréant le déclencheur, sans toucher la table. */
function allowedValuesTriggerStatements(table: string, column: string, values: string[]): string[] {
  const outside = `NEW.${column} NOT IN (${values.map((value) => `'${value}'`).join(', ')})`
  const abort = `BEGIN SELECT RAISE(ABORT, '${table}: ${column} not allowed'); END;`

  return [
    `CREATE TRIGGER ${table}_${column}_insert BEFORE INSERT ON ${table}
     WHEN ${outside}
     ${abort}`,
    `CREATE TRIGGER ${table}_${column}_update BEFORE UPDATE OF ${column} ON ${table}
     WHEN ${outside}
     ${abort}`,
  ]
}

export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
