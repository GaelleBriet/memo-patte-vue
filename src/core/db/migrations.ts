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

export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
