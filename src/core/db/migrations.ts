/** Une version déjà publiée ne se modifie plus : toute évolution ajoute un `toVersion`. */
export interface DbMigration {
  toVersion: number
  statements: string[]
}

export const migrations: DbMigration[] = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS animal (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
        breed TEXT,
        birth_date TEXT,
        initial_weight_kg REAL,
        photo_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Suppression logique (ISO 8601 UTC) : NULL tant que l'animal existe.
        -- La synchronisation Plus doit pouvoir propager une suppression entre
        -- appareils ; la purge des lignes marquées viendra après la synchro.
        deleted_at TEXT
      );`,
    ],
  },
  {
    toVersion: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS vaccination (
        id TEXT PRIMARY KEY NOT NULL,
        -- Un vaccin appartient toujours à un animal ; la purge éventuelle d'un
        -- animal emporte ses vaccins plutôt que de laisser des lignes orphelines.
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        -- Dates ISO 8601 locales (yyyy-MM-dd) : l'échéance reste facultative,
        -- un vaccin peut être consigné sans prochain rappel connu.
        last_injection_date TEXT NOT NULL,
        due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Suppression logique (ISO 8601 UTC) : NULL tant que le vaccin existe.
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vaccination_animal_id ON vaccination (animal_id);`,
    ],
  },
  {
    toVersion: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS weight_entry (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        weight_kg REAL NOT NULL,
        measured_on TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_weight_entry_animal_id ON weight_entry (animal_id);`,
    ],
  },
  {
    toVersion: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS treatment (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('deworming', 'antiparasitic')),
        frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
        frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
        last_dose_date TEXT NOT NULL,
        next_due_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_treatment_animal_id ON treatment (animal_id);`,
    ],
  },
  {
    toVersion: 5,
    statements: [
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
        last_pulled_at TEXT,
        restoring INTEGER NOT NULL DEFAULT 0
      );`,
      `INSERT INTO sync_state (id, enabled, last_pulled_at, restoring) VALUES (1, 0, NULL, 0);`,
      ...outboxTriggerStatements('animal'),
      ...outboxTriggerStatements('vaccination'),
      ...outboxTriggerStatements('treatment'),
      ...outboxTriggerStatements('weight_entry'),
    ],
  },
  {
    toVersion: 6,
    statements: [
      // Clés étrangères actives sur Android : l'ancienne table est renommée avant que l'enfant ne
      // la référence, sinon sa suppression déclencherait ON DELETE CASCADE sur les copies.
      'DROP TRIGGER IF EXISTS vaccination_outbox_insert',
      'DROP TRIGGER IF EXISTS vaccination_outbox_update',
      'DROP INDEX IF EXISTS idx_vaccination_animal_id',
      'ALTER TABLE vaccination RENAME TO vaccination_old',
      `CREATE TABLE IF NOT EXISTS vaccination (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at, deleted_at)
       SELECT id, animal_id, name, created_at, updated_at, deleted_at FROM vaccination_old;`,
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
      `INSERT INTO vaccination_injection
         (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at)
       SELECT id, id, animal_id, last_injection_date, due_date, created_at, updated_at, deleted_at
       FROM vaccination_old;`,
      'DROP TABLE vaccination_old',

      'DROP TRIGGER IF EXISTS treatment_outbox_insert',
      'DROP TRIGGER IF EXISTS treatment_outbox_update',
      'DROP INDEX IF EXISTS idx_treatment_animal_id',
      'ALTER TABLE treatment RENAME TO treatment_old',
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
      `INSERT INTO treatment
         (id, animal_id, name, type, frequency_value, frequency_unit, stopped_on, created_at, updated_at, deleted_at)
       SELECT id, animal_id, name, type, frequency_value, frequency_unit, NULL, created_at, updated_at, deleted_at
       FROM treatment_old;`,
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
      `INSERT INTO treatment_dose
         (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at, deleted_at)
       SELECT id, id, animal_id, last_dose_date, next_due_date, frequency_value, frequency_unit, created_at, updated_at, deleted_at
       FROM treatment_old;`,
      'DROP TABLE treatment_old',

      'CREATE INDEX IF NOT EXISTS idx_vaccination_animal_id ON vaccination (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_vaccination_injection_vaccination
         ON vaccination_injection (vaccination_id, injected_on);`,
      `CREATE INDEX IF NOT EXISTS idx_vaccination_injection_animal_id
         ON vaccination_injection (animal_id);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_animal_id ON treatment (animal_id);',
      `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, given_on);`,
      'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',
      ...outboxTriggerStatements('vaccination'),
      ...outboxTriggerStatements('vaccination_injection'),
      ...outboxTriggerStatements('treatment'),
      ...outboxTriggerStatements('treatment_dose'),
      // Le plugin pose la version après le commit : posée ici, elle suit la transaction du schéma.
      'PRAGMA user_version = 6',
    ],
  },
  {
    toVersion: 7,
    statements: [
      `CREATE TABLE IF NOT EXISTS sync_pull_cursor (
        entity TEXT PRIMARY KEY NOT NULL,
        last_pulled_at TEXT NOT NULL
      );`,
      'PRAGMA user_version = 7',
    ],
  },
  {
    toVersion: 8,
    statements: [
      ...nameLengthStatements('animal', ['name', 'breed']),
      ...nameLengthStatements('vaccination', ['name']),
      ...nameLengthStatements('treatment', ['name']),
      'PRAGMA user_version = 8',
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

/** Une ligne plus longue déjà enregistrée est coupée et datée : la synchro la renvoie. */
function nameLengthStatements(table: string, columns: string[]): string[] {
  const cut = columns.map((column) => `${column} = substr(${column}, 1, 80)`).join(', ')
  const stored = columns.map((column) => `length(${column}) > 80`).join(' OR ')
  const tooLong = columns.map((column) => `length(NEW.${column}) > 80`).join(' OR ')
  const abort = `BEGIN SELECT RAISE(ABORT, '${table}: text longer than 80 characters'); END;`

  return [
    `UPDATE ${table}
     SET ${cut}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE ${stored}`,
    `CREATE TRIGGER ${table}_name_length_insert BEFORE INSERT ON ${table}
     WHEN ${tooLong}
     ${abort}`,
    `CREATE TRIGGER ${table}_name_length_update BEFORE UPDATE OF ${columns.join(', ')} ON ${table}
     WHEN ${tooLong}
     ${abort}`,
  ]
}

export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
